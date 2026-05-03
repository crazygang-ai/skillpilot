# Skillport M7 + Polish 综合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1–M6 完工基础上一次性补齐 4 块 backlog：Phase 1 多-skill repo App 内 install（M5 的 ADR-M5-2 欠账）→ Phase 2 Registry 渲染打磨（表格/图片/嵌套列表）→ Phase 3 i18n 加繁体中文 + 日语 → Phase 4 M7 发布流水线脚手架。

**Architecture:** 延续三层。Phase 1 动 Domain actor，Phase 2-3 是 UI / 资源层，Phase 4 新增 `Scripts/` + `.github/workflows/` + Sparkle 配置。不新增 SPM 依赖。

**Parent spec:** `docs/superpowers/specs/2026-05-02-skillport-native-rewrite-design.md`（§5.2 详情面板的两种渲染分支、§七 Sparkle 发布链路、§十一 M7 发布流水线）

**Parent plans:**
- M1-M4: `docs/superpowers/plans/2026-05-02-skillport-m1-m4-foundation.md`（完成）
- M5: `docs/superpowers/plans/2026-05-03-skillport-m5-registry.md`（完成）
- M6: `docs/superpowers/plans/2026-05-03-skillport-m6-polish-and-i18n.md`（完成）

**Working directories:**
- 本 plan 位于 `skillpilot/docs/superpowers/plans/`
- 代码任务在 `/Users/crazy/own_project/skillport/`
- git 命令默认在 `skillport` 仓库运行

**Ground rules:**

1. TDD 严格：失败测试 → 确认失败 → 实现 → 确认通过 → commit。不跳步。
2. Conventional Commits；**禁止 `Co-Authored-By:` trailer**。
3. 每 task 一个 commit。
4. 原子写：`.tmp` + `FileManager.replaceItemAt`。
5. Swift 6 strict concurrency 必须过；lint 0 warning（`App Domain Tests SkillportPreview`）。
6. `./Scripts/check-parser-parity.sh` 必须通过。
7. CI 是 canary（Xcode 16 / Swift 6.0）。
8. 不 mock fs / git / Keychain；仅 URLProtocol 做网络桩。

---

## ADR（开工前要固定的决策）

### ADR-M7-1：Phase 4 只到"脚手架 + user-action checklist"

**背景**：M7 端到端跑通需要用户提供 Apple Developer ID 证书、notarize credential、Sparkle EdDSA key、发布域名/GitHub Pages。这些 secrets 不在代码库、也不能由我生成。

**决策**：Phase 4 交付可 dry-run 的 script / workflow / 配置，不做真实 notarize 或 appcast publish。完工时给出一份明确的"user-action checklist"，用户按单子做完即可首发。

**后果**：Phase 4 的 task 全部 local dry-run；CI 只验证 script 语法和 workflow yaml 合法。真正 release 由用户在 M7 plan 外单独执行。

### ADR-M7-2：多-skill install 走"full clone + subdir move"

**背景**：skills.sh 的 registry entry 可能指向 `owner/repo` 下的子目录 skill（`skillId != repo`）。现有 `SkillInstallerActor.installGitHub` 用 `repo` 作为 canonical 目录名，不支持多 skill repo。

**候选方案**：
- (a) `git sparse-checkout` 只拉子目录 — 复杂，对 git 版本有要求，错误处理麻烦
- (b) **full clone 到 tmp → 移动子目录到 canonical → 删除 tmp**（选此）— 简单、健壮、容错好，代价是多存一份完整 repo 的临时文件（skill repos 通常很小）

**决策**：`installGitHub(owner:repo:ref:skillId:home:installTo:)` 新增可选 `skillId` 参数。若 nil 或 `skillId == repo` → 走原有单-skill 路径；否则 clone 到 tmpdir，把 `<tmp>/<skillId>` 或 `<tmp>/skills/<skillId>` 或 `<tmp>/.claude/skills/<skillId>`（存在 SKILL.md 的那个）移到 `<home>/.agents/skills/<skillId>/`。

**Canonical path 策略**：多-skill 时 canonical dir 用 `skillId` 而非 `repo`。与 Electron 版 / CLI `npx skills add --skill <skillId>` 一致，lockfile `name = skillId`。

**Collision**：canonical dir 已存在时继续报 `fileIO: destination already exists`（用户要先 uninstall）。

### ADR-M7-3：Registry 渲染 Phase 2 只补主 app 的 RegistryContentRenderer

**背景**：渲染逻辑有两处：主 app 的 `Domain/Services/RegistryContentRenderer.swift`（SwiftUI AttributedString）和 extension 的 `SkillportPreview/MarkdownRenderer.swift`（AppKit NSAttributedString）。结构相似但 API 不同。

**决策**：Phase 2 补 **两处** 都补，因为 QL preview 是用户直接面对的面，渲染质量落后会被一眼看出。Phase 2 最后一个 task 是 "sync extension parity"，保证两处同等 feature。Parity script 已经只比 `SKILLMdParser`，不管 MarkdownRenderer，所以 Phase 2 不破 CI parity check。

---

## Phase 1 — 多-skill repo App 内 install (Tasks 1–6)

### Task 1: `SkillInstallerActor.installGitHub` 增加 `skillId` 参数 + subdir 提取逻辑

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Actors/SkillInstallerActor.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillInstallerActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SkillInstallerActorTests.swift` 追加：

```swift
@Suite("SkillInstallerActor — multi-skill repos", .serialized)
struct SkillInstallerMultiSkillTests {
    @Test("installGitHub with skillId == repo name uses single-skill path (backwards compat)")
    func singleSkillDefaultBehavior() async throws {
        // 构造 bare repo 于 tmp, repo 根就是 SKILL.md
        let home = try TempDir.create()
        defer { try? home.cleanup() }
        let bareRepo = try makeBareRepoWithRootSKILL(home: home)

        let installer = makeInstaller(home: home)
        let skill = try await installer.installGitHub(
            owner: "test", repo: "example",
            ref: "HEAD", skillId: "example",
            home: home.url, installTo: []
        )
        #expect(skill.name == "example")
        let canonical = home.url.appendingPathComponent(".agents/skills/example")
        #expect(FileManager.default.fileExists(atPath: canonical.appendingPathComponent("SKILL.md").path))
        _ = bareRepo  // silence
    }

    @Test("installGitHub with skillId differing from repo extracts subdir")
    func multiSkillSubdirExtraction() async throws {
        let home = try TempDir.create()
        defer { try? home.cleanup() }
        // Bare repo 里 <root>/skills/sub1/SKILL.md 和 <root>/skills/sub2/SKILL.md
        let _ = try makeBareRepoWithSubSkills(home: home)

        let installer = makeInstaller(home: home)
        let skill = try await installer.installGitHub(
            owner: "test", repo: "example",
            ref: "HEAD", skillId: "sub1",
            home: home.url, installTo: []
        )
        #expect(skill.name == "sub1")

        // Canonical 应只含 sub1 的内容
        let canonical = home.url.appendingPathComponent(".agents/skills/sub1")
        #expect(FileManager.default.fileExists(atPath: canonical.appendingPathComponent("SKILL.md").path))

        // 不应包含 sub2
        let otherPath = canonical.appendingPathComponent("../sub2").standardizedFileURL
        #expect(!FileManager.default.fileExists(atPath: otherPath.path))
    }

    @Test("installGitHub with non-existent skillId throws")
    func multiSkillMissingSubdir() async throws {
        let home = try TempDir.create()
        defer { try? home.cleanup() }
        let _ = try makeBareRepoWithSubSkills(home: home)

        let installer = makeInstaller(home: home)
        await #expect(throws: SkillportError.self) {
            _ = try await installer.installGitHub(
                owner: "test", repo: "example",
                ref: "HEAD", skillId: "does-not-exist",
                home: home.url, installTo: []
            )
        }
    }

    // MARK: - Helpers

    private func makeInstaller(home: TempDir) -> SkillInstallerActor {
        let git = GitActor()
        let symlinker = SymlinkManagerActor()
        let lockFile = LockFileActor(path: home.url.appendingPathComponent(".agents/.skill-lock.json"))
        let cache = CommitHashCache(path: home.url.appendingPathComponent(".agents/.cache.json"))
        return SkillInstallerActor(
            git: git, symlinker: symlinker, lockFile: lockFile, cache: cache
        )
    }

    private func makeBareRepoWithRootSKILL(home: TempDir) throws -> URL {
        // 详见 TestSupport/GitFixtures.swift — 见 Task 1 Step 2 补 fixture helper
        return try GitFixtures.makeBareRepoWithRootSKILL(under: home.url)
    }

    private func makeBareRepoWithSubSkills(home: TempDir) throws -> URL {
        return try GitFixtures.makeBareRepoWithSubSkills(under: home.url, subs: ["sub1", "sub2"])
    }
}
```

> **Note**: 测试里的 `https://github.com/test/example.git` 会被 GitActor clone 打到网。替代方案：让 `installGitHub` 接 `URL`/`String` 形式的源而非硬编码 `https://github.com/\(owner)/\(repo).git`。看 M4 `SkillInstallerActorTests.swift` 里是否已有 git fixture 模式 — 若有，沿用；若无，本 task 顺便加 `installGitHub(from: URL, ...)` overload 用于测试 + `installGitHub(owner:repo:ref:)` 保留为 GitHub-specific wrapper。

- [ ] **Step 2: 补 `Tests/SkillportTests/TestSupport/GitFixtures.swift`（若缺）**

```swift
import Foundation
@testable import Skillport

enum GitFixtures {
    /// 造一个 bare git repo，根目录有 SKILL.md。
    static func makeBareRepoWithRootSKILL(under home: URL) throws -> URL {
        let workDir = home.appendingPathComponent("repo-work-\(UUID())")
        try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
        try "---\ndescription: test\n---\n# Root\n".write(
            to: workDir.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
        try runGit(in: workDir, ["init", "-b", "main"])
        try runGit(in: workDir, ["add", "."])
        try runGit(in: workDir, ["-c", "user.name=t", "-c", "user.email=t@t.t", "commit", "-m", "init"])
        let bareURL = home.appendingPathComponent("bare-\(UUID()).git")
        try runGit(in: workDir, ["clone", "--bare", ".", bareURL.path])
        return bareURL
    }

    /// 造一个 bare repo，`skills/<sub>/SKILL.md` 布局。
    static func makeBareRepoWithSubSkills(under home: URL, subs: [String]) throws -> URL {
        let workDir = home.appendingPathComponent("repo-work-\(UUID())")
        try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
        for sub in subs {
            let dir = workDir.appendingPathComponent("skills/\(sub)")
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try "---\ndescription: \(sub)\n---\n# \(sub)\n".write(
                to: dir.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
        }
        try runGit(in: workDir, ["init", "-b", "main"])
        try runGit(in: workDir, ["add", "."])
        try runGit(in: workDir, ["-c", "user.name=t", "-c", "user.email=t@t.t", "commit", "-m", "init"])
        let bareURL = home.appendingPathComponent("bare-\(UUID()).git")
        try runGit(in: workDir, ["clone", "--bare", ".", bareURL.path])
        return bareURL
    }

    private static func runGit(in dir: URL, _ args: [String]) throws {
        let p = Process()
        p.currentDirectoryURL = dir
        p.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        p.arguments = args
        let err = Pipe()
        let out = Pipe()
        p.standardError = err
        p.standardOutput = out
        try p.run()
        p.waitUntilExit()
        if p.terminationStatus != 0 {
            let stderr = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            throw SkillportError.gitFailed(exitCode: p.terminationStatus, stderr: stderr)
        }
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | grep -E "error:" | head -5
```

Expected: `installGitHub(...skillId:...)` 参数未知 OR `GitFixtures` 未定义 OR 3 个新测试红。

- [ ] **Step 4: 实现 `installGitHub` 扩展**

`Domain/Actors/SkillInstallerActor.swift` 的 `installGitHub` 改写：

```swift
public func installGitHub(
    owner: String, repo: String, ref: String,
    skillId: String? = nil,
    home: URL, installTo: Set<AgentID>
) async throws -> Skill {
    let effectiveSkillId = skillId ?? repo
    let url = URL(string: "https://github.com/\(owner)/\(repo).git")!
    return try await installGitHub(
        sourceURL: url,
        owner: owner, repo: repo, ref: ref,
        skillId: effectiveSkillId,
        home: home, installTo: installTo
    )
}

/// 可测试 overload：允许传任意 URL（file:// 本地 bare repo 用于测试）。
public func installGitHub(
    sourceURL: URL,
    owner: String, repo: String, ref: String,
    skillId: String,
    home: URL, installTo: Set<AgentID>
) async throws -> Skill {
    let canonicalBase = home.appendingPathComponent(".agents/skills", isDirectory: true)
    try FileManager.default.createDirectory(at: canonicalBase, withIntermediateDirectories: true)
    let dest = canonicalBase.appendingPathComponent(skillId, isDirectory: true)
    if FileManager.default.fileExists(atPath: dest.path) {
        throw SkillportError.fileIO(path: dest, reason: "destination already exists")
    }

    if skillId == repo {
        // Single-skill 旧路径：直接 clone 到 dest
        try await git.clone(url: sourceURL, to: dest, ref: ref, depth: 1)
    } else {
        // Multi-skill：clone 到 tmp，找含 SKILL.md 的子目录，move 到 dest
        let tmpBase = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillport-install-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: tmpBase) }
        try await git.clone(url: sourceURL, to: tmpBase, ref: ref, depth: 1)

        let candidates = [
            tmpBase.appendingPathComponent(skillId),
            tmpBase.appendingPathComponent("skills").appendingPathComponent(skillId),
            tmpBase.appendingPathComponent(".claude/skills").appendingPathComponent(skillId),
        ]
        guard let src = candidates.first(where: {
            FileManager.default.fileExists(
                atPath: $0.appendingPathComponent("SKILL.md").path)
        }) else {
            throw SkillportError.fileIO(
                path: tmpBase,
                reason: "SKILL.md not found for skillId '\(skillId)' in cloned repo"
            )
        }
        try FileManager.default.moveItem(at: src, to: dest)
    }

    let commitHash = try? await git.headHash(in: dest)
    let identity = SkillIdentity.compute(
        name: skillId, source: .github(owner: owner, repo: repo, ref: ref)
    )
    if let commitHash {
        try await cache.set(identity: identity, hash: commitHash)
    }
    let locked = LockedSkill(
        name: skillId,
        source: .github(owner: owner, repo: repo, ref: ref),
        installedAt: Date(),
        commitHash: commitHash,
        path: dest
    )
    try await lockFile.upsert(locked)

    var agents: Set<AgentID> = []
    for agentID in installTo {
        try await toggleAgent(name: skillId, agent: agentID, install: true, home: home)
        agents.insert(agentID)
    }
    let raw = (try? String(contentsOf: dest.appendingPathComponent("SKILL.md"), encoding: .utf8)) ?? ""
    let parsed = (try? SKILLMdParser.parse(raw)) ?? .init(metadata: SKILLMetadata(), body: raw)
    return Skill(
        name: skillId,
        path: dest,
        source: .github(owner: owner, repo: repo, ref: ref),
        frontmatter: parsed.metadata,
        installedAgents: agents,
        updateStatus: .upToDate
    )
}
```

**关键变化**：
- 原 `installGitHub(owner:repo:ref:home:installTo:)` 现在走 wrapper → 新 overload
- Canonical dir name: 单-skill = repo（不变），多-skill = skillId
- LockedSkill.name 同 canonical dir name
- 新 overload 可以接 `file://` URL 用于测试

- [ ] **Step 5: 跑测试确认通过**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
```

- [ ] **Step 6: commit**

```bash
git add Domain Tests
git commit -m "feat(actor): support multi-skill repos in installGitHub via skillId + subdir move"
```

---

### Task 2: `SkillManagerActor.installGitHub` 透传 skillId

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Actors/SkillManagerActor.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillManagerActorTests.swift`（若有对应测试）

- [ ] **Step 1: 写失败测试（如已有 SkillManagerActorTests 则追加）**

```swift
@Test("installGitHub passthrough accepts skillId and yields rescan event")
func installWithSkillId() async throws {
    let home = try TempDir.create()
    defer { try? home.cleanup() }
    _ = try GitFixtures.makeBareRepoWithSubSkills(under: home.url, subs: ["alpha"])
    // 略——构造 SkillManagerActor，调 installGitHub(skillId: "alpha")，验证 skill.name == "alpha"
}
```

- [ ] **Step 2: 实现 passthrough**

```swift
public func installGitHub(
    owner: String, repo: String, ref: String,
    skillId: String? = nil,
    home: URL, installTo: Set<AgentID>
) async throws -> Skill {
    let skill = try await installer.installGitHub(
        owner: owner, repo: repo, ref: ref,
        skillId: skillId,
        home: home, installTo: installTo
    )
    _ = try await rescan(home: home)
    return skill
}
```

- [ ] **Step 3: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Domain Tests
git commit -m "feat(actor): forward skillId through SkillManagerActor.installGitHub"
```

---

### Task 3: `RegistryModel.installSelected` 传 skillId + 移除 single-skill gate

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Models/RegistryModel.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/RegistryModelTests.swift`
- Modify: `/Users/crazy/own_project/skillport/App/Composition/AppContainer.swift`（InstallHandler 签名）

- [ ] **Step 1: 改 InstallHandler 签名**

`RegistryModel.swift`：

```swift
public typealias InstallHandler =
    @Sendable (
        _ owner: String, _ repo: String, _ ref: String,
        _ skillId: String,
        _ installTo: Set<AgentID>
    ) async throws -> Skill
```

`installSelected` 去掉 `isSingleSkillRepo` gate：

```swift
public func installSelected() async -> Result<Skill, Error> {
    guard let id = selectedID,
        let skill = skills.first(where: { $0.id == id }),
        let (owner, repo) = skill.ownerAndRepo
    else {
        return .failure(SkillportError.unexpected("no registry selection to install"))
    }
    do {
        let installed = try await installHandler(
            owner, repo, "HEAD", skill.skillId, selectedAgentsForInstall)
        return .success(installed)
    } catch {
        return .failure(error)
    }
}
```

- [ ] **Step 2: 改 AppContainer**

```swift
installHandler: { owner, repo, ref, skillId, installTo in
    try await manager.installGitHub(
        owner: owner, repo: repo, ref: ref,
        skillId: skillId,
        home: home, installTo: installTo)
}
```

- [ ] **Step 3: 改测试**

`RegistryModelTests.swift` / `RegistryE2ETests.swift` 里所有 `InstallHandler` 构造都加 `skillId` 参数。"multi-skill repo blocked" 那个测试改为 "multi-skill repo calls install handler with correct skillId"：

```swift
@Test("install passes skillId through for multi-skill repos")
func multiSkillPassesThrough() async {
    var receivedSkillId: String?
    let model = RegistryModel(
        registry: RegistryActor(session: MockURLProtocol.makeSession()),
        contentFetcher: SkillContentFetcher(session: MockURLProtocol.makeSession()),
        installHandler: { owner, repo, ref, skillId, installTo in
            receivedSkillId = skillId
            return Skill(name: skillId, path: URL(fileURLWithPath: "/tmp"),
                         source: .github(owner: owner, repo: repo, ref: ref),
                         frontmatter: SKILLMetadata(), installedAgents: installTo,
                         updateStatus: .upToDate)
        }
    )
    model.skills = [
        RegistrySkill(id: "owner/repo/subsk", skillId: "subsk",
                      name: "Sub Skill", installs: 0, source: "owner/repo")
    ]
    model.selectedID = "owner/repo/subsk"
    model.selectedAgentsForInstall = [.claudeCode]
    let result = await model.installSelected()
    if case .failure(let err) = result {
        Issue.record("expected success; got \(err)")
    }
    #expect(receivedSkillId == "subsk")
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive App Domain Tests SkillportPreview
git add App Tests
git commit -m "feat(model): pass skillId through install handler; drop single-skill gate"
```

---

### Task 4: `RegistryDetailPanel` 移除"Multi-skill repo — use CLI above"禁用态

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistryDetailPanel.swift`

- [ ] **Step 1: 改 Install 按钮逻辑**

```swift
Button {
    Task { await handleInstall(skill) }
} label: {
    HStack {
        Spacer()
        Text(String(localized: "Install"))
        Spacer()
    }
    .padding(.vertical, 6)
}
.disabled(model.selectedAgentsForInstall.isEmpty)
.buttonStyle(.borderedProminent)
```

删除 `isSingleSkillRepo` 分支和 "Multi-skill repo — use CLI above" 字符串。

- [ ] **Step 2: 更新 xcstrings**

把 `"Multi-skill repo — use CLI above"` 这条 key 从 `Localizable.xcstrings` 删掉（或标记 `extractionState: manual` + 保留作为"如果未来又禁用再启用"的预留 — 推荐直接删）。

- [ ] **Step 3: build + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add App
git commit -m "feat(view): enable Install button for multi-skill registry entries"
```

---

### Task 5: 多-skill install 端到端集成测试

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Integration/RegistryE2ETests.swift`

- [ ] **Step 1: 完整 E2E 测试**

```swift
@Test("multi-skill registry install: mock listing → select subskill → install extracts subdir")
func multiSkillInstallEndToEnd() async throws {
    let home = try TempDir.create()
    defer { try? home.cleanup() }
    let bareRepo = try GitFixtures.makeBareRepoWithSubSkills(under: home.url, subs: ["pilot", "scout"])

    // Mock skills.sh 返回 one-result search for pilot
    MockURLProtocol.resetSync()
    let json = #"{"skills":[{"id":"test/example/pilot","skillId":"pilot","name":"pilot","installs":0,"source":"test/example"}]}"#
    MockURLProtocol.stub(
        urlMatch: { $0.path == "/api/search" },
        status: 200, body: Data(json.utf8)
    )
    MockURLProtocol.stub(
        urlMatch: { $0.host == "raw.githubusercontent.com" },
        status: 404, body: Data()
    )
    MockURLProtocol.stub(urlMatch: { $0.host == "skills.sh" && $0.path != "/" }, status: 404, body: Data())

    let registry = RegistryActor(session: MockURLProtocol.makeSession())
    let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
    let git = GitActor()
    let symlinker = SymlinkManagerActor()
    let lockFile = LockFileActor(path: home.url.appendingPathComponent(".agents/.skill-lock.json"))
    let cache = CommitHashCache(path: home.url.appendingPathComponent(".agents/.cache.json"))
    let installer = SkillInstallerActor(
        git: git, symlinker: symlinker, lockFile: lockFile, cache: cache)

    let model = RegistryModel(
        registry: registry, contentFetcher: fetcher,
        installHandler: { _, _, ref, skillId, installTo in
            try await installer.installGitHub(
                sourceURL: bareRepo,
                owner: "test", repo: "example", ref: ref,
                skillId: skillId, home: home.url, installTo: installTo)
        }
    )

    model.searchInput = "pilot"
    await model.runSearchNow()
    #expect(model.skills.count == 1)
    await model.select(id: "test/example/pilot")
    model.selectedAgentsForInstall = []  // 不 install 到 agent
    let result = await model.installSelected()
    if case .failure(let err) = result {
        Issue.record("install failed: \(err)")
    }
    // canonical dir 是 pilot 不是 example
    let pilotDir = home.url.appendingPathComponent(".agents/skills/pilot")
    #expect(FileManager.default.fileExists(atPath: pilotDir.appendingPathComponent("SKILL.md").path))
    // scout 没被拉过来
    let scoutDir = home.url.appendingPathComponent(".agents/skills/scout")
    #expect(!FileManager.default.fileExists(atPath: scoutDir.path))
}
```

- [ ] **Step 2: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Tests
git commit -m "test(e2e): add multi-skill registry install end-to-end test"
```

---

### Task 6: `uninstall` 针对新 canonical path 策略的冒烟测试

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillInstallerActorTests.swift`

- [ ] **Step 1: 验证 uninstall(name: "sub1") 删对地方**

```swift
@Test("uninstall after multi-skill install removes the correct canonical dir")
func uninstallMultiSkill() async throws {
    let home = try TempDir.create()
    defer { try? home.cleanup() }
    let bareRepo = try GitFixtures.makeBareRepoWithSubSkills(under: home.url, subs: ["alpha", "beta"])

    let installer = makeInstaller(home: home)
    _ = try await installer.installGitHub(
        sourceURL: bareRepo, owner: "t", repo: "r", ref: "HEAD",
        skillId: "alpha", home: home.url, installTo: [])
    _ = try await installer.installGitHub(
        sourceURL: bareRepo, owner: "t", repo: "r", ref: "HEAD",
        skillId: "beta", home: home.url, installTo: [])

    try await installer.uninstall(name: "alpha", home: home.url)

    let alpha = home.url.appendingPathComponent(".agents/skills/alpha")
    let beta = home.url.appendingPathComponent(".agents/skills/beta")
    #expect(!FileManager.default.fileExists(atPath: alpha.path))
    #expect(FileManager.default.fileExists(atPath: beta.path))
}
```

- [ ] **Step 2: commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Tests
git commit -m "test: verify uninstall removes multi-skill canonical dir without collateral"
```

---

## Phase 2 — Registry 渲染打磨 (Tasks 7–10)

> 目标：`RegistryContentRenderer`（主 app）和 `SkillportPreview/MarkdownRenderer`（QL extension）都补 3 个元素：表格、嵌套列表、图片（可选取舍）。

### Task 7: 主 app — 嵌套列表支持

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Services/RegistryContentRenderer.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/RegistryContentRendererTests.swift`

- [ ] **Step 1: 写失败测试**

```swift
@Test("nested lists render with indentation preserved")
func nestedListsRender() throws {
    let md = """
        - top
          - nested
          - also nested
        - sibling
        """
    switch try renderer.render(md) {
    case .markdown(let s):
        let text = String(s.characters)
        #expect(text.contains("top"))
        #expect(text.contains("nested"))
        #expect(text.contains("also nested"))
        #expect(text.contains("sibling"))
    default: Issue.record("expected .markdown")
    }
}
```

- [ ] **Step 2: 改 `renderNode(_:)` 的 UnorderedList/OrderedList 分支**

目前 list item 只打"• "开头，没处理嵌套。用递归 + indent level：

```swift
private func renderNode(_ node: Markup, indent: Int = 0) -> AttributedString {
    switch node {
    // …既有
    case let ul as UnorderedList:
        var acc = AttributedString()
        for item in ul.listItems {
            acc.append(AttributedString(String(repeating: "  ", count: indent)))
            acc.append(AttributedString("• "))
            for child in item.children {
                acc.append(renderNode(child, indent: indent + 1))
            }
        }
        return acc
    case let ol as OrderedList:
        var acc = AttributedString()
        var idx = 1
        for item in ol.listItems {
            acc.append(AttributedString(String(repeating: "  ", count: indent)))
            acc.append(AttributedString("\(idx). "))
            for child in item.children {
                acc.append(renderNode(child, indent: indent + 1))
            }
            idx += 1
        }
        return acc
    // …
    }
}
```

其它 case 的 `renderNode` 调用补 `indent` 参数或直接默认 0。

- [ ] **Step 3: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Domain Tests
git commit -m "feat(service): render nested Markdown lists with indentation"
```

---

### Task 8: 主 app — 表格支持

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Services/RegistryContentRenderer.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/RegistryContentRendererTests.swift`

> swift-markdown 的 `Table` 节点解析 GFM 表格。我们把每行拼成 `" | "` 分隔的文本 + 头行加粗 + 空行分隔。

- [ ] **Step 1: 写失败测试**

```swift
@Test("markdown tables render as pipe-separated text with bold header")
func tableRender() throws {
    let md = """
        | Name | Stars |
        |------|-------|
        | foo  | 100   |
        | bar  | 50    |
        """
    switch try renderer.render(md) {
    case .markdown(let s):
        let text = String(s.characters)
        #expect(text.contains("Name"))
        #expect(text.contains("Stars"))
        #expect(text.contains("foo"))
        #expect(text.contains("100"))
    default: Issue.record("expected .markdown")
    }
}
```

- [ ] **Step 2: 实现 Table case**

`renderNode` 增加：

```swift
case let table as Markdown.Table:
    var acc = AttributedString()
    // 头行
    var headerText = AttributedString(
        table.head.cells.map { $0.plainText }.joined(separator: " | "))
    headerText.font = .system(.body, weight: .bold)
    acc.append(headerText)
    acc.append(AttributedString("\n"))
    // 分隔线
    acc.append(
        AttributedString(
            String(repeating: "-", count: 40) + "\n"))
    // 数据行
    for row in table.body.rows {
        acc.append(
            AttributedString(
                row.cells.map { $0.plainText }.joined(separator: " | ")))
        acc.append(AttributedString("\n"))
    }
    acc.append(AttributedString("\n"))
    return acc
```

- [ ] **Step 3: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Domain Tests
git commit -m "feat(service): render GFM tables as pipe-separated rows with bold header"
```

---

### Task 9: 主 app — 图片占位符（不实际加载远程图）

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Services/RegistryContentRenderer.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/RegistryContentRendererTests.swift`

> 远程图片加载涉及网络、缓存、隐私 — M5 时我们就避开了。这里用 `[Image: \(altText) — \(url)]` 文字占位。

- [ ] **Step 1: 写失败测试**

```swift
@Test("markdown images render as text placeholder")
func imagePlaceholder() throws {
    let md = "![logo](https://example.com/logo.png)"
    switch try renderer.render(md) {
    case .markdown(let s):
        let text = String(s.characters)
        #expect(text.contains("logo"))
        #expect(text.contains("example.com/logo.png"))
    default: Issue.record("expected .markdown")
    }
}
```

- [ ] **Step 2: 实现 Image 分支**

`renderInline` 补：

```swift
case let image as Markdown.Image:
    let alt = image.plainText.isEmpty ? "image" : image.plainText
    let url = image.source ?? ""
    var s = AttributedString("[Image: \(alt) — \(url)]")
    s.font = .system(.caption, weight: .regular)
    s.foregroundColor = .secondary
    return s
```

- [ ] **Step 3: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Domain Tests
git commit -m "feat(service): render Markdown images as inline text placeholder"
```

---

### Task 10: QL extension — 同步嵌套列表 / 表格 / 图片到 `MarkdownRenderer`

**Files:**
- Modify: `/Users/crazy/own_project/skillport/SkillportPreview/MarkdownRenderer.swift`

> QL extension 的渲染器吐 NSAttributedString 而非 AttributedString，API 略有不同。把 Phase 2 Task 7-9 的行为等价 port 过来。Parity script 不管这个文件，所以人工保持一致。

- [ ] **Step 1: 嵌套列表**

修改 `renderNode(_:into:)` 的 `UnorderedList` / `OrderedList` case，加 `indent` 参数。

- [ ] **Step 2: 表格**

加 Table case，输出为带 bold header 的文本：

```swift
case let table as Markdown.Table:
    let header = table.head.cells.map { $0.plainText }.joined(separator: " | ")
    let s = NSMutableAttributedString(string: header + "\n")
    s.addAttribute(.font,
        value: NSFont.boldSystemFont(ofSize: NSFont.systemFontSize),
        range: NSRange(location: 0, length: header.count))
    out.append(s)
    out.append(NSAttributedString(string: String(repeating: "-", count: 40) + "\n"))
    for row in table.body.rows {
        let line = row.cells.map { $0.plainText }.joined(separator: " | ")
        out.append(NSAttributedString(string: line + "\n"))
    }
    out.append(NSAttributedString(string: "\n"))
```

- [ ] **Step 3: 图片占位符**

```swift
case let image as Markdown.Image:
    let alt = image.plainText.isEmpty ? "image" : image.plainText
    let url = image.source ?? ""
    let s = NSMutableAttributedString(string: "[Image: \(alt) — \(url)]")
    s.addAttributes([
        .font: NSFont.systemFont(ofSize: 11),
        .foregroundColor: NSColor.secondaryLabelColor
    ], range: NSRange(location: 0, length: s.length))
    out.append(s)
```

- [ ] **Step 4: build + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
swift-format lint --recursive App Domain Tests SkillportPreview
git add SkillportPreview
git commit -m "feat(extension): port nested lists/tables/image placeholders to QL MarkdownRenderer"
```

---

## Phase 3 — i18n 加 zh-Hant + ja (Tasks 11–13)

### Task 11: `Localizable.xcstrings` 追加 zh-Hant 翻译

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Resources/Localizable.xcstrings`

> 所有 58 条 key 追加 `zh-Hant` localization。翻译逻辑：zh-Hans 当底，做简→繁映射。注意技术名词（Dashboard → 儀表板，Registry → 註冊表，Toggle → 切換）与大陆惯用差异（代理 → 代理服務器？台湾倾向"代理"或"Proxy"直写）。

- [ ] **Step 1: 按 key 排序加 zh-Hant**

对每条 key，在 `localizations` 字典里追加 `zh-Hant`，value 为繁体对应。示例（完整列表见 Step 2）：

```json
"Dashboard" : {
  "localizations" : {
    "en" : { "stringUnit" : { "state" : "translated", "value" : "Dashboard" } },
    "zh-Hans" : { "stringUnit" : { "state" : "translated", "value" : "仪表盘" } },
    "zh-Hant" : { "stringUnit" : { "state" : "translated", "value" : "儀表板" } }
  }
}
```

- [ ] **Step 2: 58 条 key 的 zh-Hant 翻译清单**

（下表按 xcstrings 出现顺序，逐条简 → 繁；直接照搬到 xcstrings）

| Key (en source) | zh-Hans | zh-Hant |
|---|---|---|
| %lld skill updates available | %lld 个技能有可用更新 | %lld 個技能有可用更新 |
| %lld skills installed | 已安装 %lld 个技能 | 已安裝 %lld 個技能 |
| About | 关于 | 關於 |
| All Skills | 全部技能 | 全部技能 |
| All Time | 全部 | 全部 |
| Automatically check for updates | 自动检查更新 | 自動檢查更新 |
| Back | 返回 | 返回 |
| Back to Dashboard | 返回仪表盘 | 返回儀表板 |
| Check for Skill Updates | 检查技能更新 | 檢查技能更新 |
| Check for updates | 检查更新 | 檢查更新 |
| Check now | 立即检查 | 立即檢查 |
| Copied install command | 已复制安装命令 | 已複製安裝指令 |
| Dashboard | 仪表盘 | 儀表板 |
| Drop a folder with SKILL.md here to import, or use ⌘N. | 把含 SKILL.md 的文件夹拖到这里导入，或按 ⌘N。 | 將含 SKILL.md 的資料夾拖到這裡匯入，或按 ⌘N。 |
| Editor | 编辑器 | 編輯器 |
| Enable proxy | 启用代理 | 啟用代理 |
| Failed to save password: %@ | 密码保存失败：%@ | 儲存密碼失敗：%@ |
| Filter by agent | 按 agent 筛选 | 依 agent 篩選 |
| General | 通用 | 一般 |
| GitHub | GitHub | GitHub |
| Host | 主机 | 主機 |
| Hot | 热门 | 熱門 |
| Import Skill… | 导入技能… | 匯入技能… |
| Import failed: %@ | 导入失败：%@ | 匯入失敗：%@ |
| Imported %@ | 已导入 %@ | 已匯入 %@ |
| Install | 安装 | 安裝 |
| Install to agents | 安装到 agent | 安裝到 agent |
| Installed %@ | 已安装 %@ | 已安裝 %@ |
| Language | 语言 | 語言 |
| Language changed — please restart Skillport. | 语言已更改 — 请重启 Skillport。 | 語言已變更 — 請重新啟動 Skillport。 |
| Last checked %@ | 上次检查：%@ | 上次檢查：%@ |
| Load failed: %@ | 加载失败：%@ | 載入失敗：%@ |
| Network | 网络 | 網路 |
| Never checked for updates | 尚未检查更新 | 尚未檢查更新 |
| No results | 无结果 | 無結果 |
| No skills available | 暂无技能 | 暫無技能 |
| No skills yet | 尚无技能 | 尚無技能 |
| Open Skillport | 打开 Skillport | 開啟 Skillport |
| Password (stored in Keychain) | 密码（存于 Keychain） | 密碼（儲存於 Keychain） |
| Port | 端口 | 連接埠 |
| Proxy password saved | 代理密码已保存 | 代理密碼已儲存 |
| Quit Skillport | 退出 Skillport | 結束 Skillport |
| Registry | 注册表 | 註冊表 |
| Rescan | 重新扫描 | 重新掃描 |
| Restart required for language change to take effect. | 语言更改需重启 Skillport 才会生效。 | 語言變更需重新啟動 Skillport 才會生效。 |
| Save | 保存 | 儲存 |
| Save failed: %@ | 保存失败：%@ | 儲存失敗：%@ |
| Save password | 保存密码 | 儲存密碼 |
| Saved. | 已保存。 | 已儲存。 |
| Scanning… | 扫描中… | 掃描中… |
| Search skills | 搜索技能 | 搜尋技能 |
| Select a skill to see details | 选择一个技能查看详情 | 選擇一個技能查看詳情 |
| Toggle failed: %@ | 切换失败：%@ | 切換失敗：%@ |
| Trending | 趋势 | 趨勢 |
| Type | 类型 | 類型 |
| Update | 更新 | 更新 |
| Updates | 更新 | 更新 |
| Username (optional) | 用户名（可选） | 使用者名稱（選填） |
| Views | 视图 | 檢視 |

（"Multi-skill repo — use CLI above" 这条 Phase 1 Task 4 已删，不出现此处）

- [ ] **Step 3: build + commit**

xcstrings 体积会翻一点。跑 build 确认解析无误。

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App/Resources/Localizable.xcstrings
git commit -m "feat(i18n): add zh-Hant translations for all 58 keys"
```

---

### Task 12: `Localizable.xcstrings` 追加 ja 翻译

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Resources/Localizable.xcstrings`

- [ ] **Step 1: 58 条 key 的 ja 翻译清单**

| Key (en source) | ja |
|---|---|
| %lld skill updates available | %lld 件のスキル更新が利用可能 |
| %lld skills installed | %lld 件のスキルをインストール済み |
| About | Skillport について |
| All Skills | すべてのスキル |
| All Time | 全期間 |
| Automatically check for updates | 自動的に更新を確認する |
| Back | 戻る |
| Back to Dashboard | ダッシュボードに戻る |
| Check for Skill Updates | スキルの更新を確認 |
| Check for updates | 更新を確認 |
| Check now | いま確認 |
| Copied install command | インストールコマンドをコピーしました |
| Dashboard | ダッシュボード |
| Drop a folder with SKILL.md here to import, or use ⌘N. | SKILL.md を含むフォルダをここにドロップするか、⌘N でインポート。 |
| Editor | エディタ |
| Enable proxy | プロキシを有効化 |
| Failed to save password: %@ | パスワードの保存に失敗: %@ |
| Filter by agent | エージェントで絞り込み |
| General | 一般 |
| GitHub | GitHub |
| Host | ホスト |
| Hot | ホット |
| Import Skill… | スキルをインポート… |
| Import failed: %@ | インポート失敗: %@ |
| Imported %@ | インポート済み: %@ |
| Install | インストール |
| Install to agents | エージェントにインストール |
| Installed %@ | インストール済み: %@ |
| Language | 言語 |
| Language changed — please restart Skillport. | 言語を変更しました — Skillport を再起動してください。 |
| Last checked %@ | 前回確認 %@ |
| Load failed: %@ | 読み込みに失敗: %@ |
| Network | ネットワーク |
| Never checked for updates | 更新を確認したことがありません |
| No results | 結果がありません |
| No skills available | 利用可能なスキルがありません |
| No skills yet | まだスキルがありません |
| Open Skillport | Skillport を開く |
| Password (stored in Keychain) | パスワード (Keychain に保存) |
| Port | ポート |
| Proxy password saved | プロキシパスワードを保存しました |
| Quit Skillport | Skillport を終了 |
| Registry | レジストリ |
| Rescan | 再スキャン |
| Restart required for language change to take effect. | 言語の変更には Skillport の再起動が必要です。 |
| Save | 保存 |
| Save failed: %@ | 保存に失敗: %@ |
| Save password | パスワードを保存 |
| Saved. | 保存しました。 |
| Scanning… | スキャン中… |
| Search skills | スキルを検索 |
| Select a skill to see details | スキルを選択して詳細を表示 |
| Toggle failed: %@ | 切り替え失敗: %@ |
| Trending | トレンド |
| Type | タイプ |
| Update | アップデート |
| Updates | アップデート |
| Username (optional) | ユーザー名 (任意) |
| Views | ビュー |

- [ ] **Step 2: build + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App/Resources/Localizable.xcstrings
git commit -m "feat(i18n): add Japanese translations for all 58 keys"
```

---

### Task 13: `GeneralTab` Language picker 加 zh-Hant / ja 选项

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Settings/GeneralTab.swift`

- [ ] **Step 1: 扩展 locales 数组**

```swift
private let locales: [(String, String)] = [
    ("en", "English"),
    ("zh-Hans", "简体中文"),
    ("zh-Hant", "繁體中文"),
    ("ja", "日本語"),
]
```

- [ ] **Step 2: 手工验证 + commit**

重启 app、Settings → Language 下拉看到 4 个选项。选择繁体中文 → 退出重启 → 主界面出现繁体。再切日语 → 重启 → 日语 UI。

```bash
git add App
git commit -m "feat(view): add zh-Hant and ja to Settings Language picker"
```

---

## Phase 4 — M7 发布流水线脚手架 (Tasks 14–19)

> **ADR-M7-1 适用**：只做本地 dry-run 能过的 scaffold。端到端验证由用户在 plan 外执行。

### Task 14: `build/ExportOptions.plist` 配 Developer ID 签名

**Files:**
- Modify: `/Users/crazy/own_project/skillport/build/ExportOptions.plist`（M1 已有 scaffold）

- [ ] **Step 1: 填完整**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>teamID</key>
    <string>$(DEVELOPMENT_TEAM)</string>
    <key>destination</key>
    <string>export</string>
    <key>installerSigningCertificate</key>
    <string>Developer ID Installer</string>
    <key>signingCertificate</key>
    <string>Developer ID Application</string>
    <key>uploadSymbols</key>
    <false/>
    <key>stripSwiftSymbols</key>
    <true/>
</dict>
</plist>
```

> 用户后续要在 `project.yml` 的 `DEVELOPMENT_TEAM` 填真实 team ID，或通过 xcconfig 文件覆盖。

- [ ] **Step 2: commit**

```bash
git add build
git commit -m "chore(release): complete ExportOptions.plist for Developer ID signing"
```

---

### Task 15: `Scripts/release.sh` — bump + tag + build + export

**Files:**
- Create: `/Users/crazy/own_project/skillport/Scripts/release.sh`

- [ ] **Step 1: 写 release.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./Scripts/release.sh 0.1.0
# Requires: 本机已装 Developer ID 证书 + Sparkle sign_update 工具。

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.1.0"
    exit 2
fi

VERSION="$1"
BUILD="$(date +%Y%m%d%H%M)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Releasing Skillport v$VERSION build $BUILD"

# 1. 检查 clean working tree
if ! git diff-index --quiet HEAD --; then
    echo "❌ Working tree not clean; commit first"
    exit 1
fi

# 2. Bump version in project.yml
/usr/bin/sed -i '' -E "s/MARKETING_VERSION: .*/MARKETING_VERSION: \"$VERSION\"/" project.yml
/usr/bin/sed -i '' -E "s/CURRENT_PROJECT_VERSION: .*/CURRENT_PROJECT_VERSION: \"$BUILD\"/" project.yml

./Scripts/generate-project.sh

# 3. Run tests + lint before tagging
xcodebuild -scheme Skillport -destination 'platform=macOS' test | xcpretty
swift-format lint --recursive App Domain Tests SkillportPreview
./Scripts/check-parser-parity.sh

# 4. Archive
ARCHIVE_PATH="$REPO_ROOT/build/Skillport-$VERSION.xcarchive"
xcodebuild archive \
    -scheme Skillport \
    -destination 'generic/platform=macOS' \
    -archivePath "$ARCHIVE_PATH" \
    -configuration Release

# 5. Export .app
EXPORT_DIR="$REPO_ROOT/build/export-$VERSION"
mkdir -p "$EXPORT_DIR"
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist build/ExportOptions.plist

# 6. Commit version bump + tag
git add project.yml
git commit -m "chore(release): bump to v$VERSION build $BUILD"
git tag "v$VERSION"

echo "==> Release v$VERSION built to $EXPORT_DIR/Skillport.app"
echo "==> Next steps:"
echo "    1. Notarize: ./Scripts/notarize.sh \"$EXPORT_DIR/Skillport.app\""
echo "    2. Publish appcast: ./Scripts/publish-appcast.sh \"$EXPORT_DIR\" $VERSION"
echo "    3. Push: git push && git push --tags"
```

- [ ] **Step 2: chmod +x**

```bash
chmod +x Scripts/release.sh
```

- [ ] **Step 3: commit**

```bash
git add Scripts/release.sh
git commit -m "feat(release): add Scripts/release.sh for version bump + archive + export"
```

---

### Task 16: `Scripts/notarize.sh` + `Scripts/publish-appcast.sh`

**Files:**
- Create: `/Users/crazy/own_project/skillport/Scripts/notarize.sh`
- Create: `/Users/crazy/own_project/skillport/Scripts/publish-appcast.sh`

- [ ] **Step 1: notarize.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./Scripts/notarize.sh <path-to-Skillport.app>
# Requires env vars: AC_USERNAME, AC_TEAM_ID, AC_APP_SPECIFIC_PASSWORD
# (或 keychain profile: xcrun notarytool store-credentials AC_PROFILE)

APP_PATH="${1:?usage: notarize.sh <path-to-Skillport.app>}"
if [ ! -d "$APP_PATH" ]; then
    echo "❌ $APP_PATH is not a directory"
    exit 1
fi

ZIP_PATH="${APP_PATH%.app}.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

echo "==> Submitting $ZIP_PATH to notarytool..."
if [ -n "${AC_PROFILE:-}" ]; then
    xcrun notarytool submit "$ZIP_PATH" \
        --keychain-profile "$AC_PROFILE" \
        --wait
else
    xcrun notarytool submit "$ZIP_PATH" \
        --apple-id "${AC_USERNAME:?set AC_USERNAME}" \
        --team-id "${AC_TEAM_ID:?set AC_TEAM_ID}" \
        --password "${AC_APP_SPECIFIC_PASSWORD:?set AC_APP_SPECIFIC_PASSWORD}" \
        --wait
fi

echo "==> Stapling ticket..."
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

echo "==> Notarization complete: $APP_PATH"
```

- [ ] **Step 2: publish-appcast.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./Scripts/publish-appcast.sh <export-dir> <version>
# Requires: Sparkle 的 sign_update 工具 (xcrun --find sign_update 或 Sparkle/bin/sign_update)
# Requires env: SPARKLE_PRIVATE_KEY_PATH (ed25519 private key)

EXPORT_DIR="${1:?usage: publish-appcast.sh <export-dir> <version>}"
VERSION="${2:?need version}"
APP_PATH="$EXPORT_DIR/Skillport.app"

# 1. Package into .dmg (用 create-dmg 或 hdiutil)
DMG_PATH="$EXPORT_DIR/Skillport-$VERSION.dmg"
echo "==> Creating $DMG_PATH..."
hdiutil create -volname "Skillport" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"

# 2. Sign with EdDSA
SIGN_TOOL="${SPARKLE_SIGN_UPDATE:-$(xcrun --find sign_update 2>/dev/null || echo '')}"
if [ -z "$SIGN_TOOL" ] || [ ! -x "$SIGN_TOOL" ]; then
    echo "❌ sign_update tool not found; set SPARKLE_SIGN_UPDATE or add Sparkle/bin to PATH"
    exit 1
fi

SIGNATURE=$("$SIGN_TOOL" "$DMG_PATH" "${SPARKLE_PRIVATE_KEY_PATH:?set SPARKLE_PRIVATE_KEY_PATH}")
LENGTH=$(stat -f%z "$DMG_PATH")

# 3. Append to appcast.xml (模板在 appcast.template.xml)
APPCAST_PATH="$EXPORT_DIR/appcast.xml"
cp build/appcast.template.xml "$APPCAST_PATH"
/usr/bin/sed -i '' "s|{{VERSION}}|$VERSION|g" "$APPCAST_PATH"
/usr/bin/sed -i '' "s|{{PUBDATE}}|$(date -R)|g" "$APPCAST_PATH"
/usr/bin/sed -i '' "s|{{LENGTH}}|$LENGTH|g" "$APPCAST_PATH"
/usr/bin/sed -i '' "s|{{SIGNATURE}}|$SIGNATURE|g" "$APPCAST_PATH"
/usr/bin/sed -i '' "s|{{DMG_URL}}|${APPCAST_DMG_BASE_URL:?set APPCAST_DMG_BASE_URL}/Skillport-$VERSION.dmg|g" "$APPCAST_PATH"

echo "==> Appcast generated: $APPCAST_PATH"
echo "==> Upload $DMG_PATH and $APPCAST_PATH to your hosting (GitHub Release / CDN / domain)"
```

- [ ] **Step 3: `build/appcast.template.xml`**

```xml
<?xml version="1.0" standalone="yes"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
    <channel>
        <title>Skillport Updates</title>
        <link>{{APPCAST_URL}}</link>
        <description>Most recent changes</description>
        <language>en</language>
        <item>
            <title>Version {{VERSION}}</title>
            <pubDate>{{PUBDATE}}</pubDate>
            <enclosure
                url="{{DMG_URL}}"
                sparkle:version="{{VERSION}}"
                sparkle:shortVersionString="{{VERSION}}"
                length="{{LENGTH}}"
                type="application/octet-stream"
                sparkle:edSignature="{{SIGNATURE}}" />
            <sparkle:minimumSystemVersion>15.0</sparkle:minimumSystemVersion>
        </item>
    </channel>
</rss>
```

- [ ] **Step 4: chmod + commit**

```bash
chmod +x Scripts/notarize.sh Scripts/publish-appcast.sh
git add Scripts build/appcast.template.xml
git commit -m "feat(release): add notarize + appcast publishing scripts with Sparkle EdDSA"
```

---

### Task 17: AppUpdaterBridge 接 feed URL 配置

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Actors/AppUpdaterBridge.swift`
- Modify: `/Users/crazy/own_project/skillport/App/Resources/Info.plist`
- Modify: `/Users/crazy/own_project/skillport/App/Composition/AppContainer.swift`

- [ ] **Step 1: 加 Info.plist key**

```xml
<key>SUFeedURL</key>
<string>https://YOUR_DOMAIN/appcast.xml</string>
<key>SUPublicEDKey</key>
<string>YOUR_PUBLIC_ED25519_KEY_BASE64</string>
```

占位值明显 — 用户需替换成真实域名和 key。

- [ ] **Step 2: `AppUpdaterBridge` 从 Info.plist 读 feedURL**

现有 `AppUpdaterBridge(feedURL: nil)` 改为从 `Bundle.main.object(forInfoDictionaryKey: "SUFeedURL")` 读。若为占位符则禁用自动更新。

```swift
public init(feedURL: URL? = nil) {
    let effective: URL? = feedURL ?? {
        guard let s = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String,
              !s.contains("YOUR_DOMAIN"),
              let u = URL(string: s) else { return nil }
        return u
    }()
    // …既有初始化，若 effective nil 则让 Sparkle 不 auto-check
}
```

- [ ] **Step 3: AppContainer 恢复默认构造**

```swift
self.updateModel = UpdateModel(bridge: AppUpdaterBridge())
```

- [ ] **Step 4: build + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add App Domain
git commit -m "feat(updater): wire AppUpdaterBridge feed URL via Info.plist SUFeedURL"
```

---

### Task 18: GitHub Actions release workflow

**Files:**
- Create: `/Users/crazy/own_project/skillport/.github/workflows/release.yml`

- [ ] **Step 1: 写 workflow（dry-run 兼容，真实 notarize 用 secrets）**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_16.app

      - name: Bootstrap
        run: ./Scripts/bootstrap.sh

      - name: Import Developer ID certificate
        env:
          DEV_ID_CERT_BASE64: ${{ secrets.DEV_ID_CERT_BASE64 }}
          DEV_ID_CERT_PASSWORD: ${{ secrets.DEV_ID_CERT_PASSWORD }}
        run: |
          if [ -z "$DEV_ID_CERT_BASE64" ]; then
              echo "⚠️  Skipping cert import (secret not set) — CI will fail at codesign"
              exit 0
          fi
          echo "$DEV_ID_CERT_BASE64" | base64 --decode > cert.p12
          security create-keychain -p "" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "" build.keychain
          security import cert.p12 -k build.keychain -P "$DEV_ID_CERT_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple: -s -k "" build.keychain

      - name: Generate project
        run: ./Scripts/generate-project.sh

      - name: Check parser parity
        run: ./Scripts/check-parser-parity.sh

      - name: Archive
        run: |
          xcodebuild archive \
            -scheme Skillport \
            -destination 'generic/platform=macOS' \
            -archivePath build/Skillport.xcarchive \
            -configuration Release \
            CODE_SIGN_IDENTITY="Developer ID Application" \
            DEVELOPMENT_TEAM="${{ secrets.DEVELOPMENT_TEAM }}"

      - name: Export .app
        run: |
          xcodebuild -exportArchive \
            -archivePath build/Skillport.xcarchive \
            -exportPath build/export \
            -exportOptionsPlist build/ExportOptions.plist

      - name: Notarize
        env:
          AC_USERNAME: ${{ secrets.AC_USERNAME }}
          AC_TEAM_ID: ${{ secrets.AC_TEAM_ID }}
          AC_APP_SPECIFIC_PASSWORD: ${{ secrets.AC_APP_SPECIFIC_PASSWORD }}
        run: ./Scripts/notarize.sh build/export/Skillport.app

      - name: Package + sign appcast
        env:
          SPARKLE_PRIVATE_KEY_PATH: ${{ secrets.SPARKLE_PRIVATE_KEY_PATH }}
          APPCAST_DMG_BASE_URL: ${{ secrets.APPCAST_DMG_BASE_URL }}
        run: ./Scripts/publish-appcast.sh build/export ${GITHUB_REF_NAME#v}

      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            build/export/Skillport-*.dmg
            build/export/appcast.xml
          draft: false
          prerelease: false
```

- [ ] **Step 2: commit**

```bash
git add .github
git commit -m "ci: add release workflow triggered by v* tags"
```

---

### Task 19: M7 user-action checklist 文档

**Files:**
- Create: `/Users/crazy/own_project/skillport/docs/RELEASE-SETUP.md`
- Modify: `/Users/crazy/own_project/skillport/README.md`

- [ ] **Step 1: docs/RELEASE-SETUP.md**

内容要有：

```markdown
# Skillport Release Setup

本文档列出首次发布 Skillport 前需要你（repo owner）做的一次性动作。

## 1. Apple Developer ID

1. 在 https://developer.apple.com 申请 / 续费 Apple Developer Program 会员
2. 在 Keychain Access 里生成 CSR，通过开发者后台换取：
   - **Developer ID Application** 证书（用于签 .app）
   - **Developer ID Installer** 证书（可选，用于 .pkg）
3. 把两张证书导入本机 Login Keychain
4. 记下 Team ID（10 字符），填到 `project.yml` 的 `DEVELOPMENT_TEAM`：

```yaml
settings:
  base:
    DEVELOPMENT_TEAM: "ABCDE12345"
```

## 2. Notarize credential

1. 在 https://appleid.apple.com 生成 App-Specific Password（名为 "skillport-notarize"）
2. 本机存到 Keychain：
   ```bash
   xcrun notarytool store-credentials "skillport-notarize" \
       --apple-id you@example.com \
       --team-id ABCDE12345 \
       --password YOUR_APP_SPECIFIC_PASSWORD
   ```
3. 本地 release 时 `export AC_PROFILE=skillport-notarize`
4. GitHub Actions 里加 secrets：`AC_USERNAME` / `AC_TEAM_ID` / `AC_APP_SPECIFIC_PASSWORD`

## 3. Sparkle EdDSA key pair

```bash
# 生成一次性 keypair（保管好 private key，丢了所有旧 appcast 都作废）
./Pods/Sparkle/bin/generate_keys  # 或者 Sparkle SPM：$(xcrun --find generate_keys)
# 生成 eddsa_priv.key 和 eddsa_pub.key
```

- Private key 保管好（`sparkle_eddsa_private_key` 已在 .gitignore）
- Public key 的 base64 填到 `App/Resources/Info.plist` 的 `SUPublicEDKey`
- GitHub Actions secret: `SPARKLE_PRIVATE_KEY_PATH`（CI 用 Base64-encoded 传入 + 运行时写文件）

## 4. Appcast 托管

选一个：

### 选项 A：GitHub Pages
- 在本仓库启用 Pages（Settings → Pages → main / docs or gh-pages branch）
- appcast.xml 路径：`https://crazygang-ai.github.io/skillport/appcast.xml`
- DMG 下载：用 GitHub Release（action-gh-release 已配）
- 把 `SUFeedURL` 改为 `https://crazygang-ai.github.io/skillport/appcast.xml`
- `APPCAST_DMG_BASE_URL` = GitHub Release 的 assets URL prefix，如 `https://github.com/crazygang-ai/skillport/releases/download/v0.1.0`

### 选项 B：自己的域名
- 买 `*.crazygang.ai` 域名，DNS 指到 S3/Cloudflare Pages/自家服务器
- SUFeedURL = `https://updates.crazygang.ai/appcast.xml`
- DMG 和 appcast.xml 都传到该域名下

## 5. GitHub Secrets（CI 用）

在 repo 的 Settings → Secrets and variables → Actions 加：

| Secret | 值 |
|---|---|
| `DEVELOPMENT_TEAM` | Apple Team ID (10 字符) |
| `DEV_ID_CERT_BASE64` | Developer ID Application .p12 的 base64 |
| `DEV_ID_CERT_PASSWORD` | .p12 的密码 |
| `AC_USERNAME` | 你的 Apple ID |
| `AC_TEAM_ID` | 同上 team ID |
| `AC_APP_SPECIFIC_PASSWORD` | App-Specific Password |
| `SPARKLE_PRIVATE_KEY_PATH` | EdDSA private key 内容（base64） |
| `APPCAST_DMG_BASE_URL` | DMG 的下载 URL prefix（见步骤 4） |

## 6. 第一次 release

```bash
# 本地 dry-run（跳过 notarize，仅验证 build + export 流程）
./Scripts/release.sh 0.1.0

# 真发（证书 / notarize / Sparkle 都配好后）
./Scripts/release.sh 0.1.0
./Scripts/notarize.sh build/export-0.1.0/Skillport.app
./Scripts/publish-appcast.sh build/export-0.1.0 0.1.0
git push && git push --tags
# GitHub Actions release workflow 会基于 v0.1.0 tag 自动跑
```
```

- [ ] **Step 2: README 加 Release 段**

```markdown
## Release

See [docs/RELEASE-SETUP.md](docs/RELEASE-SETUP.md) for first-time signing / notarize / appcast setup.

Subsequent releases:
```bash
./Scripts/release.sh X.Y.Z
```
```

- [ ] **Step 3: commit**

```bash
git add docs/RELEASE-SETUP.md README.md
git commit -m "docs: add M7 release setup checklist for maintainers"
```

---

## 总结清单（实施者完工时自查）

- [ ] 19 个 task 全部打勾
- [ ] `xcodebuild test` 全绿（预期 165+ tests）
- [ ] `swift-format lint --recursive App Domain Tests SkillportPreview` 静默
- [ ] Swift 6 strict concurrency 0 error 0 warning
- [ ] `./Scripts/check-parser-parity.sh` ✅
- [ ] CI `gh run watch` 绿
- [ ] `./Scripts/release.sh --dry-run`（或等价手工跑）能生成本地 Skillport.app（跳过 notarize）
- [ ] `docs/RELEASE-SETUP.md` 覆盖：Developer ID / notarize cred / EdDSA key / appcast 托管 / GitHub Secrets / 首发命令
- [ ] Registry Install 按钮对多-skill repo 启用；skillId != repo 的 entry 能装
- [ ] Registry 渲染包含 nested list / table / image placeholder（主 app 和 QL 两处）
- [ ] Localizable.xcstrings 有 en / zh-Hans / zh-Hant / ja 四语言全 key 覆盖
- [ ] Settings Language picker 有 4 个选项
- [ ] 无任何 `Co-Authored-By:` trailer

---

## 完工后的 backlog

- 首次发布（需要用户按 RELEASE-SETUP 做完 secrets 配置）
- 表格在 QL preview 用 NSAttributedString tab-stop 对齐（现在只 space 分隔）
- Registry 图片实际加载（含缓存、隐私设置）
- 多-skill install 的 update 流程（现在只 install，`SkillUpdaterActor` 改 skillId-aware）
- 繁体 / 日语的手工校对（我的翻译可能不完美）
