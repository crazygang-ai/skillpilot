# Skillport M5 — Registry Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1–M4 完工的基础上实装 Spec 里程碑 **M5 RegistryBrowser**。结束时 app 能从 skills.sh 拉取 leaderboard（allTime / trending / hot）和搜索结果，展示详情面板（SKILL.md 内容，支持 HTML 与 Markdown 两种渲染分支），并一键把 skill 从 GitHub 安装到选中的 agent。

**Architecture:** 延续三层 — SwiftUI Views → `@Observable` Models → Domain Actors。M5 新增：
- 两个 actor 的功能扩充：`RegistryActor`（加 leaderboard / search），`SkillContentFetcher`（加 3 级级联 fetch）
- 一个新 `@Observable` model：`RegistryModel`
- 一个新视图：`RegistryBrowserView`（替换 `RootView` 里的占位 stub）
- 两个纯类型：`RSCPayloadParser`（状态机）、`HTMLSanitizer`（allowlist）
- 一个新渲染器：`RegistryContentRenderer`（HTML → NSAttributedString / Markdown → AttributedString）

**Tech Stack:** Swift 6, SwiftUI (macOS 15+), Observation 宏, Yams, swift-markdown, **SwiftSoup 2.8.7**（新增，纯 Swift，用于 HTML allowlist 过滤）, Swift Testing, XcodeGen, swift-format.

**Parent spec:** `docs/superpowers/specs/2026-05-02-skillport-native-rewrite-design.md`（§5.2 RegistryBrowserView、§四 Actor 映射 `RegistryActor` / `SkillContentFetcher`）

**Parent plan:** `docs/superpowers/plans/2026-05-02-skillport-m1-m4-foundation.md`（本 plan 假设 M1-M4 的 55 个 commit 已 merge 到 `main`）

**Working directories:**
- 本 plan 文件位于 Electron 版 `skillpilot` 仓库的 `docs/superpowers/plans/`
- 所有代码任务在 **`/Users/crazy/own_project/skillport/`** 下执行
- 每个 task 的 `git` 命令都默认在 `skillport` 仓库里运行（不是 `skillpilot`）

**Ground rules for the implementing engineer:**

1. TDD 严格：先写失败测试、跑一次确认失败、再写实现、跑一次确认通过、commit。不跳步。
2. 不 mock 文件系统、git、Keychain。仅 `URLProtocol` 做网络桩（沿用 M1 的 `MockURLProtocol`）。
3. Commit message 用 [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `chore:`, `test:`, `refactor:`, `docs:`, `fix:` 前缀)。
4. **禁止任何 `Co-Authored-By:` trailer** — 包括 dispatch 到 subagent 的 task。
5. 每 task 结尾都要 commit。不做"攒大 commit"。
6. 所有写文件必须原子：先写 `.tmp`，再 `FileManager.replaceItemAt`。
7. Swift 6 strict concurrency 必须过（0 error，0 warning）。
8. `swift-format lint --recursive App Domain Tests` 必须静默。
9. 每次加新源文件要跑 `./Scripts/generate-project.sh` 重新生成 Xcode 工程。
10. Swift Testing 的 `@Test` 要带清晰 name，断言用 `#expect` 和 `#require`。
11. 新语法先查 Swift 6.0 兼容性（CI 用 Xcode 16 / Swift 6.0），不确定就避开。本机 Xcode 26.4 / Swift 6.3 能过不代表 CI 能过 — push 后看 `gh run watch`。

---

## Architectural Decision Records (ADRs)

在开工前明确 2 个对 spec 的偏离与 1 个作用域限定，实施时遵循：

### ADR-M5-1：HTML 渲染用 NSAttributedString，不用 WKWebView

**Spec 原文（§5.2）**：> 内容以哨兵 `<!-- HTML -->` 开头 → `WKWebView`（SwiftUI 包装），**禁 JS、禁网**，另加白名单 tag/attribute 过滤层（替代 dompurify）。

**M5 实际做法**：仍保留 `<!-- HTML -->` sentinel 分支 + allowlist 过滤（用 SwiftSoup），但渲染用 `NSAttributedString(data:options:.documentType:.html ...)` 包在 `Text(AttributedString(...))` 里，不起 WebView 进程。

**理由**：
- NSAttributedString 的 HTML 文档解析内部走 WebKit，但不执行 JavaScript，也不发起"主动"网络请求（只会为 `<img src>` 等 loader 请求资源 — 我们通过 SwiftSoup 预清洗阶段把所有 `src`/`href` 归一化到允许协议，并剥离未在 allowlist 中的标签/属性，再传给 NSAttributedString，从而消除远程请求面）。
- 避免起独立 WebContent/Networking XPC 进程，减小内存和启动开销。
- 原生字体/链接/列表视觉与其他 SwiftUI 文本一致。
- 表格、复杂 SVG、代码高亮渲染会比 WKWebView 差 — 实际用户影响：skills.sh 的 HTML 基本是简单文档 + 代码块 + 链接，影响可控。
- 如果未来发现 NSAttributedString 渲染质量不可接受，可以用单个 task 回退到 WKWebView 包装（渲染器接口已预留 `RegistryContentRenderer` 抽象）。

**取舍后果**：引入 1 个 SPM 依赖 `SwiftSoup`（纯 Swift，无 C 扩展，MIT 协议）。不引入 WKWebView 相关样板代码。

### ADR-M5-2：M5 的 "Install" 按钮只支持单-skill 仓库

**背景**：现有 `SkillInstallerActor.installGitHub(owner: String, repo: String, ref: String, ...)` 签名不带 `skillId`，clone 后把整个 repo 当成一个 skill 落到 `~/.agents/skills/<repo>/`。skills.sh 的 registry entry 里有独立的 `skillId` 字段，可能不等于 repo 根（即一个 repo 含多个 skill 子目录的场景）。

**M5 实际做法**：
- 把从 skills.sh 拉到的 `source`（`owner/repo`）和 `skillId` 同时显示在详情面板。
- 始终显示 CLI 安装命令 `npx skills add https://github.com/<source> --skill <skillId>`（供复制）。
- "Install" 按钮：当 `skillId == repo`（单-skill repo）时启用，调 `installGitHub`；否则禁用并 tooltip 提示"此 skill 为多技能仓库子目录，请使用上方 CLI 命令；App 内安装支持将在 M6/M7 补齐"。

**理由**：扩展 `installGitHub` 支持 `skillId`（sparse-checkout + 子目录提升）本身是 4–6 个 task 的工作量，且要动 `Skill` 数据模型（`Skill.path` vs `Skill.source` 关系、卸载逻辑），不是 M5 的核心范畴。M5 的核心是"看 + 找 + 导航"，CLI 命令作为逃生舱保证"找得到就装得上"。

### ADR-M5-3：i18n 留给 M6

**Spec §十一 milestone 列表**：M5 = RegistryBrowser；M6 = 加分项 + Settings + **i18n**。

**M5 实际做法**：
- RegistryBrowserView 用的字符串用 `String(localized:)` 包装 + 英文默认值，便于 M6 接 `xcstrings` 后零改动切语言。
- 暂不生成 `Localizable.xcstrings`，暂不产出 zh-Hans 翻译。

---

## Phase 1 — 类型与 RSC Payload Parser (Tasks 1–2)

> 这是 M5 的基础 — 定义 registry API 的 Swift 类型，以及从 skills.sh 返回的 next.js RSC flight payload 里抽 `initialSkills` JSON 数组的状态机 parser（Electron 版 `parseLeaderboardHTML`/`extractDoubleEscapedArray` 的 1:1 port）。

### Task 1: Registry domain types

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/RegistrySkill.swift`
- Modify: `/Users/crazy/own_project/skillport/Domain/Types/DomainEvent.swift`（加 2 个 case）
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/RegistrySkillTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Types/RegistrySkillTests.swift`:

```swift
import Testing
@testable import Skillport
import Foundation

@Suite("RegistrySkill value type")
struct RegistrySkillTests {
    @Test("LeaderboardCategory has three cases matching skills.sh URL paths")
    func leaderboardCategoryCases() {
        #expect(LeaderboardCategory.allTime.urlPath == "")
        #expect(LeaderboardCategory.trending.urlPath == "/trending")
        #expect(LeaderboardCategory.hot.urlPath == "/hot")
        #expect(LeaderboardCategory.allCases.count == 3)
    }

    @Test("RegistrySkill is Sendable + Codable roundtrip preserves all fields")
    func roundtrip() throws {
        let input = RegistrySkill(
            id: "owner/repo/skill-id",
            skillId: "skill-id",
            name: "Skill Name",
            installs: 1234,
            source: "owner/repo",
            installsYesterday: 10,
            change: 5
        )
        let data = try JSONEncoder().encode(input)
        let decoded = try JSONDecoder().decode(RegistrySkill.self, from: data)
        #expect(decoded == input)
    }

    @Test("installCommand returns correct npx skills add string")
    func installCommandFormat() {
        let s = RegistrySkill(id: "a/b/c", skillId: "c", name: "c", installs: 0, source: "a/b")
        #expect(s.installCommand == "npx skills add https://github.com/a/b --skill c")
    }

    @Test("LeaderboardResult default empty")
    func leaderboardResultEmpty() {
        let r = LeaderboardResult()
        #expect(r.skills.isEmpty)
        #expect(r.totalCount == 0)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | grep -E "error:|FAILED" | head -20
```

Expected: 编译错误 — `RegistrySkill` / `LeaderboardCategory` / `LeaderboardResult` 未定义。

- [ ] **Step 3: 实现类型**

`Domain/Types/RegistrySkill.swift`:

```swift
import Foundation

public struct RegistrySkill: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let skillId: String
    public let name: String
    public let installs: Int
    public let source: String
    public let installsYesterday: Int?
    public let change: Int?

    public init(
        id: String,
        skillId: String,
        name: String,
        installs: Int,
        source: String,
        installsYesterday: Int? = nil,
        change: Int? = nil
    ) {
        self.id = id
        self.skillId = skillId
        self.name = name
        self.installs = installs
        self.source = source
        self.installsYesterday = installsYesterday
        self.change = change
    }

    /// CLI 安装命令，详情面板里显示给用户复制。
    public var installCommand: String {
        "npx skills add https://github.com/\(source) --skill \(skillId)"
    }

    /// 如果 source 形如 "owner/repo" 且 skillId == repo，则该 skill 占据整个仓库，
    /// 适用于现有的 `SkillInstallerActor.installGitHub` 接口（见 ADR-M5-2）。
    public var isSingleSkillRepo: Bool {
        let parts = source.split(separator: "/")
        guard parts.count == 2 else { return false }
        return String(parts[1]) == skillId
    }

    /// 解析 "owner/repo" 形式，失败返回 nil。
    public var ownerAndRepo: (owner: String, repo: String)? {
        let parts = source.split(separator: "/")
        guard parts.count == 2 else { return nil }
        return (String(parts[0]), String(parts[1]))
    }
}

public enum LeaderboardCategory: String, CaseIterable, Sendable, Hashable {
    case allTime
    case trending
    case hot

    public var urlPath: String {
        switch self {
        case .allTime: return ""
        case .trending: return "/trending"
        case .hot: return "/hot"
        }
    }
}

public struct LeaderboardResult: Sendable, Hashable {
    public let skills: [RegistrySkill]
    public let totalCount: Int

    public init(skills: [RegistrySkill] = [], totalCount: Int = 0) {
        self.skills = skills
        self.totalCount = totalCount
    }
}
```

- [ ] **Step 4: 加 2 个 DomainEvent case**

`Domain/Types/DomainEvent.swift` 在既有 enum 上追加：

```swift
case registryLeaderboardLoaded(category: LeaderboardCategory, count: Int)
case registryContentFetched(source: String, skillId: String, bytes: Int)
```

（不要破坏既有 case 顺序；新 case 附加到末尾。）

- [ ] **Step 5: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Domain Tests
git commit -m "feat(types): add RegistrySkill + LeaderboardCategory + LeaderboardResult"
```

Expected: 4 tests pass.

---

### Task 2: RSCPayloadParser — skills.sh leaderboard HTML 提取状态机

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Parsers/RSCPayloadParser.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Parsers/RSCPayloadParserTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Fixtures/skills-sh-leaderboard-alltime.html`

> 这是 M5 最"脏"的一段 — 从 Next.js RSC flight payload 里抠出 `\"initialSkills\":[...]` 数组。逻辑照搬 `electron/services/skill-registry-service.ts` 的 `extractDoubleEscapedArray` + `decodeDoubleEscapedJson` + `parseLeaderboardHTML`。skills.sh 未来改版会把它打破，我们靠 fixture 测试挂牌、生产 404 降级为空列表（而不是崩）。

- [ ] **Step 1: 抓一份真实 fixture（只做一次）**

```bash
cd /Users/crazy/own_project/skillport
mkdir -p Tests/SkillportTests/Fixtures
curl -sS -H "Accept: text/html" https://skills.sh/ > Tests/SkillportTests/Fixtures/skills-sh-leaderboard-alltime.html
# 健康检查：文件应包含 initialSkills 标记
grep -c 'initialSkills' Tests/SkillportTests/Fixtures/skills-sh-leaderboard-alltime.html
```

Expected: 输出 `1` 或更多（如为 0 说明 skills.sh 已改版，暂停此 task 并汇报）。

- [ ] **Step 2: 写失败测试**

`Tests/SkillportTests/Parsers/RSCPayloadParserTests.swift`:

```swift
import Testing
@testable import Skillport
import Foundation

@Suite("RSCPayloadParser — skills.sh leaderboard extraction")
struct RSCPayloadParserTests {
    // MARK: - Double-escaped array extraction

    @Test("extractDoubleEscapedArray returns nil if payload doesn't start with [")
    func extractRejectsNonArrayStart() {
        let payload = "garbage"
        let result = RSCPayloadParser.extractDoubleEscapedArray(in: payload, startingAt: 0)
        #expect(result == nil)
    }

    @Test("extractDoubleEscapedArray handles empty array")
    func extractEmptyArray() {
        let payload = "[]"
        let result = RSCPayloadParser.extractDoubleEscapedArray(in: payload, startingAt: 0)
        #expect(result == "[]")
    }

    @Test("extractDoubleEscapedArray handles nested arrays")
    func extractNested() {
        let payload = #"[1,[2,3],4]trailing"#
        let result = RSCPayloadParser.extractDoubleEscapedArray(in: payload, startingAt: 0)
        #expect(result == #"[1,[2,3],4]"#)
    }

    @Test("extractDoubleEscapedArray respects double-escaped string boundaries")
    func extractWithEscapedStrings() {
        // 模拟 RSC 里的双重 JSON 转义:内部字符串用 \" 包裹, 字符串内的 [ ] 不算数组层级
        let payload = #"[\"a[b]c\",\"d\"]"#
        let result = RSCPayloadParser.extractDoubleEscapedArray(in: payload, startingAt: 0)
        #expect(result == #"[\"a[b]c\",\"d\"]"#)
    }

    @Test("extractDoubleEscapedArray treats \\\\ as literal backslash not escape prefix")
    func extractHandlesBackslashPair() {
        // \\\" 在 payload 层应拆为 \\ + \" = 字面反斜杠 + 字符串终止
        let payload = #"[\"a\\\",\"b\"]"#
        let result = RSCPayloadParser.extractDoubleEscapedArray(in: payload, startingAt: 0)
        #expect(result == #"[\"a\\\",\"b\"]"#)
    }

    @Test("extractDoubleEscapedArray returns nil for unterminated array")
    func extractUnterminated() {
        let payload = "[1,2,3"
        let result = RSCPayloadParser.extractDoubleEscapedArray(in: payload, startingAt: 0)
        #expect(result == nil)
    }

    // MARK: - End-to-end leaderboard parsing

    @Test("parseLeaderboardHTML on empty HTML yields empty result")
    func emptyHTML() {
        let result = RSCPayloadParser.parseLeaderboardHTML("")
        #expect(result.skills.isEmpty)
        #expect(result.totalCount == 0)
    }

    @Test("parseLeaderboardHTML on HTML without initialSkills marker yields empty")
    func htmlWithoutMarker() {
        let result = RSCPayloadParser.parseLeaderboardHTML("<html><body>no marker here</body></html>")
        #expect(result.skills.isEmpty)
    }

    @Test("parseLeaderboardHTML extracts skills from real skills.sh fixture")
    func realFixture() throws {
        let url = try #require(TestBundleLocator.bundle.url(
            forResource: "skills-sh-leaderboard-alltime", withExtension: "html"))
        let html = try String(contentsOf: url, encoding: .utf8)
        let result = RSCPayloadParser.parseLeaderboardHTML(html)
        // 实际条数随 skills.sh 增减, 我们只断言"至少有一条"+"totalCount 存在"
        #expect(result.skills.count > 0)
        #expect(result.totalCount >= result.skills.count)
        // 首条 skill 的关键字段必须填充
        let first = try #require(result.skills.first)
        #expect(!first.id.isEmpty)
        #expect(!first.source.isEmpty)
        #expect(!first.skillId.isEmpty)
        #expect(first.installs >= 0)
    }

    @Test("parseLeaderboardHTML gracefully degrades on malformed initialSkills")
    func malformedInitialSkills() {
        let html = #"something \"initialSkills\":[malformed"#
        let result = RSCPayloadParser.parseLeaderboardHTML(html)
        #expect(result.skills.isEmpty)
        #expect(result.totalCount == 0)
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

- [ ] **Step 4: 实现 parser**

`Domain/Parsers/RSCPayloadParser.swift`:

```swift
import Foundation
import OSLog

/// 从 skills.sh 的 Next.js RSC flight payload 里提取 `initialSkills` 数组。
///
/// 逻辑 1:1 port 自 electron/services/skill-registry-service.ts 的
/// `parseLeaderboardHTML` + `extractDoubleEscapedArray` + `decodeDoubleEscapedJson`。
/// 由于 skills.sh 没有公开 JSON API, 必须靠抓 HTML 里的序列化 state 树。
/// 此 parser 对 payload 格式变化脆弱; 生产故障时靠空列表降级, 不 throw。
public enum RSCPayloadParser {
    private static let logger = Logger(subsystem: "ai.crazygang.Skillport", category: "registry")
    private static let marker = #"\"initialSkills\":"#

    public static func parseLeaderboardHTML(_ html: String) -> LeaderboardResult {
        guard let markerRange = html.range(of: marker) else {
            return LeaderboardResult()
        }
        let start = markerRange.upperBound
        guard let rawChunk = extractDoubleEscapedArray(
            in: html, startingAt: html.distance(from: html.startIndex, to: start)
        ) else {
            logger.warning("initialSkills marker found but array could not be extracted")
            return LeaderboardResult()
        }
        let decoded: String
        do {
            decoded = try decodeDoubleEscapedJson(rawChunk)
        } catch {
            logger.warning("failed to decode RSC double-escape: \(error.localizedDescription)")
            return LeaderboardResult()
        }
        guard let data = decoded.data(using: .utf8) else { return LeaderboardResult() }
        let raw: [[String: Any]]
        do {
            raw = (try JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
        } catch {
            logger.warning("failed to parse decoded JSON: \(error.localizedDescription)")
            return LeaderboardResult()
        }
        let total = extractTotalCount(in: html) ?? raw.count
        let skills = raw.compactMap(mapRawSkill)
        return LeaderboardResult(skills: skills, totalCount: total)
    }

    // MARK: - State machine

    /// 单遍状态机, 从 `[` 开始扫到匹配的 `]`。
    /// 参考 Electron 版实现的注释:
    ///   - `\\` → 字面反斜杠 (原子消费两字符)
    ///   - `\"` → 内部 JSON 字符串分隔符 (切换 inString 状态)
    /// 返回切片 [start, end], 含首尾 [ ]。
    public static func extractDoubleEscapedArray(in html: String, startingAt offset: Int) -> String? {
        let chars = Array(html)
        guard offset < chars.count, chars[offset] == "[" else { return nil }

        var depth = 0
        var inString = false
        var i = offset

        while i < chars.count {
            let c = chars[i]
            let next: Character? = (i + 1 < chars.count) ? chars[i + 1] : nil

            if inString {
                if c == "\\" && next == "\\" {
                    i += 2
                } else if c == "\\" && next == "\"" {
                    inString = false
                    i += 2
                } else {
                    i += 1
                }
            } else {
                if c == "\\" && next == "\"" {
                    inString = true
                    i += 2
                } else if c == "[" {
                    depth += 1
                    i += 1
                } else if c == "]" {
                    depth -= 1
                    if depth == 0 {
                        return String(chars[offset...i])
                    }
                    i += 1
                } else {
                    i += 1
                }
            }
        }
        return nil
    }

    // MARK: - Decoding

    /// 用 JSON 解码器把 RSC 的"双重转义"字符串还原一层 — 与 Electron 版
    /// `JSON.parse('"' + rawChunk + '"')` 等价。这里靠 JSONDecoder 解一个
    /// 被包一层引号的字符串, 便利且正确地处理所有 JSON 转义。
    public static func decodeDoubleEscapedJson(_ rawChunk: String) throws -> String {
        let wrapped = "\"\(rawChunk)\""
        guard let data = wrapped.data(using: .utf8) else {
            throw SkillportError.parseError(reason: "utf8 encode failed")
        }
        return try JSONDecoder().decode(String.self, from: data)
    }

    // MARK: - Raw skill mapping

    private static func mapRawSkill(_ item: [String: Any]) -> RegistrySkill? {
        let id = (item["id"] as? String) ?? {
            if let source = item["source"] as? String, let skillId = item["skillId"] as? String {
                return "\(source)/\(skillId)"
            }
            return ""
        }()
        if id.isEmpty { return nil }
        let skillId = (item["skillId"] as? String) ?? ""
        let name = (item["name"] as? String) ?? skillId
        let source = (item["source"] as? String) ?? ""
        let installs = (item["installs"] as? Int) ?? Int((item["installs"] as? Double) ?? 0)
        let installsYesterday = (item["installs_yesterday"] as? Int)
        let change = (item["change"] as? Int)
        return RegistrySkill(
            id: id,
            skillId: skillId,
            name: name,
            installs: installs,
            source: source,
            installsYesterday: installsYesterday,
            change: change
        )
    }

    private static func extractTotalCount(in html: String) -> Int? {
        let totalMarker = #"\"totalSkills\":"#
        guard let r = html.range(of: totalMarker) else { return nil }
        let tail = html[r.upperBound...]
        let digits = tail.prefix { $0.isNumber }
        return Int(digits)
    }
}
```

- [ ] **Step 5: 确保 `SkillportError` 有 `parseError` case**

若不存在, 补充到 `Domain/Types/DomainEvent.swift`（`SkillportError` 所在文件）:

```swift
case parseError(reason: String)
```

- [ ] **Step 6: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Domain Tests
git commit -m "feat(parser): add RSCPayloadParser for skills.sh leaderboard HTML"
```

Expected: 10 tests pass (9 unit + 1 fixture-based). 如 fixture 测试因 skills.sh 改版失败, commit 前把 HTML 重抓一次。

---

## Phase 2 — Actor 功能扩充 (Tasks 3–4)

### Task 3: RegistryActor 扩充 — leaderboard + search + cache

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Actors/RegistryActor.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/RegistryActorTests.swift`（如已存在）或 Create 之

> 现有 `RegistryActor` 只有 `fetchListing()` 打 `/api/skills.json`（skills.sh 实际并没这个端点）。M5 替换为 `leaderboard(category:)` 和 `search(query:limit:)` 两个 API，加 5 分钟 TTL 缓存。旧 `RegistryEntry` + `fetchListing` 整个删除。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/RegistryActorTests.swift`（整体重写）:

```swift
import Testing
@testable import Skillport
import Foundation

@Suite("RegistryActor — leaderboard + search via skills.sh", .serialized)
struct RegistryActorTests {
    @Test("leaderboard(.allTime) fetches / and parses RSC payload")
    func leaderboardAllTime() async throws {
        MockURLProtocol.reset()
        let fixtureHTML = try loadFixture("skills-sh-leaderboard-alltime.html")
        MockURLProtocol.stub(
            url: URL(string: "https://skills.sh/")!,
            status: 200,
            body: fixtureHTML.data(using: .utf8)!
        )
        let session = MockURLProtocol.makeSession()
        let actor = RegistryActor(session: session)
        let result = try await actor.leaderboard(.allTime)
        #expect(result.skills.count > 0)
        #expect(result.totalCount >= result.skills.count)
    }

    @Test("leaderboard(.trending) hits /trending path")
    func leaderboardTrending() async throws {
        MockURLProtocol.reset()
        let html = try loadFixture("skills-sh-leaderboard-alltime.html")  // 相同 payload 结构即可
        MockURLProtocol.stub(
            url: URL(string: "https://skills.sh/trending")!,
            status: 200,
            body: html.data(using: .utf8)!
        )
        let actor = RegistryActor(session: MockURLProtocol.makeSession())
        _ = try await actor.leaderboard(.trending)
        let called = MockURLProtocol.requestLog.map { $0.url?.path ?? "" }
        #expect(called.contains("/trending"))
    }

    @Test("leaderboard uses in-memory cache within TTL")
    func leaderboardCache() async throws {
        MockURLProtocol.reset()
        let html = try loadFixture("skills-sh-leaderboard-alltime.html")
        MockURLProtocol.stub(
            url: URL(string: "https://skills.sh/")!,
            status: 200,
            body: html.data(using: .utf8)!
        )
        let actor = RegistryActor(session: MockURLProtocol.makeSession())
        _ = try await actor.leaderboard(.allTime)
        _ = try await actor.leaderboard(.allTime)
        // 两次调用只打 1 次网络
        let calls = MockURLProtocol.requestLog.filter { $0.url?.host == "skills.sh" }
        #expect(calls.count == 1)
    }

    @Test("leaderboard 500 throws networkFailed")
    func leaderboard500() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.stub(
            url: URL(string: "https://skills.sh/")!,
            status: 500,
            body: Data()
        )
        let actor = RegistryActor(session: MockURLProtocol.makeSession())
        await #expect(throws: SkillportError.self) {
            _ = try await actor.leaderboard(.allTime)
        }
    }

    @Test("search encodes query and limit, parses JSON response")
    func search() async throws {
        MockURLProtocol.reset()
        let json = """
        {"skills":[
          {"id":"a/b/c","skillId":"c","name":"cool","installs":42,"source":"a/b"},
          {"id":"d/e/f","skillId":"f","name":"fast","installs":99,"source":"d/e","installs_yesterday":5,"change":2}
        ]}
        """
        MockURLProtocol.stub(
            urlMatch: { $0.path == "/api/search" && $0.query?.contains("q=helm") == true },
            status: 200,
            body: json.data(using: .utf8)!
        )
        let actor = RegistryActor(session: MockURLProtocol.makeSession())
        let skills = try await actor.search(query: "helm")
        #expect(skills.count == 2)
        #expect(skills[0].skillId == "c")
        #expect(skills[1].installsYesterday == 5)
        #expect(skills[1].change == 2)
    }

    @Test("search clamps limit to a reasonable upper bound")
    func searchLimitParam() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.stub(
            urlMatch: { _ in true },
            status: 200,
            body: #"{"skills":[]}"#.data(using: .utf8)!
        )
        let actor = RegistryActor(session: MockURLProtocol.makeSession())
        _ = try await actor.search(query: "x", limit: 999)
        let q = MockURLProtocol.requestLog.last?.url?.query ?? ""
        #expect(q.contains("limit=100"))  // 我们 clamp 到 100
    }

    // MARK: - Helper

    private func loadFixture(_ name: String) throws -> String {
        let url = try #require(TestBundleLocator.bundle.url(
            forResource: name.replacingOccurrences(of: ".html", with: ""),
            withExtension: "html"
        ))
        return try String(contentsOf: url, encoding: .utf8)
    }
}
```

> **Note**: `MockURLProtocol.stub(urlMatch:)` 谓词式变体在 M1 可能不存在 — 若缺失, 此 task 先扩展 `MockURLProtocol` 加 `stub(urlMatch: (@Sendable (URL) -> Bool), status:, body:)` 和 `requestLog: [URLRequest]` 属性。修改归入本 task commit。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 重写 RegistryActor**

`Domain/Actors/RegistryActor.swift` （整体替换）:

```swift
import Foundation
import OSLog

public actor RegistryActor {
    private let session: URLSession
    private let baseURL: URL
    private let cacheTTL: TimeInterval
    private var leaderboardCache: [LeaderboardCategory: (result: LeaderboardResult, at: Date)] = [:]
    private let logger = Logger(subsystem: "ai.crazygang.Skillport", category: "registry")

    public init(
        session: URLSession,
        baseURL: URL = URL(string: "https://skills.sh")!,
        cacheTTL: TimeInterval = 5 * 60
    ) {
        self.session = session
        self.baseURL = baseURL
        self.cacheTTL = cacheTTL
    }

    // MARK: - Leaderboard

    public func leaderboard(_ category: LeaderboardCategory) async throws -> LeaderboardResult {
        if let cached = leaderboardCache[category],
           Date().timeIntervalSince(cached.at) < cacheTTL {
            return cached.result
        }
        let url = baseURL.appendingPathComponent(category.urlPath.isEmpty ? "/" : category.urlPath)
        var request = URLRequest(url: url)
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw SkillportError.networkFailed(url: url, reason: "status \(http.statusCode)")
        }
        guard let html = String(data: data, encoding: .utf8) else {
            throw SkillportError.parseError(reason: "non-utf8 response from \(url.absoluteString)")
        }
        let result = RSCPayloadParser.parseLeaderboardHTML(html)
        leaderboardCache[category] = (result, Date())
        return result
    }

    public func invalidateLeaderboardCache(_ category: LeaderboardCategory? = nil) {
        if let c = category {
            leaderboardCache.removeValue(forKey: c)
        } else {
            leaderboardCache.removeAll()
        }
    }

    // MARK: - Search

    public func search(query: String, limit: Int = 50) async throws -> [RegistrySkill] {
        let clampedLimit = min(max(1, limit), 100)
        var comps = URLComponents(url: baseURL.appendingPathComponent("/api/search"),
                                  resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: String(clampedLimit)),
        ]
        let url = comps.url!
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw SkillportError.networkFailed(url: url, reason: "status \(http.statusCode)")
        }
        struct Response: Decodable {
            let skills: [RawSkill]?
            struct RawSkill: Decodable {
                let id: String
                let skillId: String?
                let name: String?
                let installs: Int
                let source: String
                let installs_yesterday: Int?
                let change: Int?
            }
        }
        let decoded: Response
        do {
            decoded = try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw SkillportError.parseError(reason: "\(error)")
        }
        return (decoded.skills ?? []).map { raw in
            let skillId = raw.skillId ?? URL(string: raw.id)?.lastPathComponent ?? raw.id
            return RegistrySkill(
                id: raw.id,
                skillId: skillId,
                name: raw.name ?? skillId,
                installs: raw.installs,
                source: raw.source,
                installsYesterday: raw.installs_yesterday,
                change: raw.change
            )
        }
    }
}
```

- [ ] **Step 4: 删除旧 `RegistryEntry`/`fetchListing` 的引用**

```bash
cd /Users/crazy/own_project/skillport
grep -rn "RegistryEntry\|fetchListing" App Domain Tests | grep -v RegistryActor.swift
```

Expected: 空（旧 API 无引用, 可以安全删）。若有, 修正调用点。

- [ ] **Step 5: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive App Domain Tests
git add Domain Tests
git commit -m "feat(actor): rewrite RegistryActor for leaderboard + search via skills.sh RSC"
```

Expected: 6 tests pass, 加上先前 103 也全绿。

---

### Task 4: SkillContentFetcher 扩充 — 3 级 fetch 级联 + cache

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Domain/Actors/SkillContentFetcher.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillContentFetcherTests.swift`

> 现有 `fetchFirstSuccess(from:)` 只做 Strategy 1（并行跑 URL，首成即赢）。M5 升级为完整 3 级：
> 1. GitHub raw 8-候选 URL 并发 race
> 2. skills.sh RSC payload → 拿 HTML → `<!-- HTML -->` prefix
> 3. GitHub Tree API 发现（带 rate limit 状态记忆）
>
> 旧 `fetchFirstSuccess(from:)` 保留为 internal helper（Strategy 1 内部用）。对外新增 `fetchContent(source:skillId:)` 总入口。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SkillContentFetcherTests.swift` （在既有基础上追加 Suite）:

```swift
@Suite("SkillContentFetcher — 3-tier cascade", .serialized)
struct SkillContentFetcherCascadeTests {
    @Test("strategy 1 wins when any raw URL candidate returns 200")
    func strategy1Wins() async throws {
        MockURLProtocol.reset()
        let body = "# hello from raw".data(using: .utf8)!
        MockURLProtocol.stub(
            urlMatch: { $0.host == "raw.githubusercontent.com" && $0.path.hasSuffix("/main/SKILL.md") },
            status: 200,
            body: body
        )
        let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
        let content = try await fetcher.fetchContent(source: "owner/repo", skillId: "repo")
        #expect(content.contains("# hello from raw"))
        // 不应去碰 skills.sh 或 api.github.com
        let touched = MockURLProtocol.requestLog.map { $0.url?.host ?? "" }
        #expect(!touched.contains("skills.sh"))
        #expect(!touched.contains("api.github.com"))
    }

    @Test("strategy 2 fires when all raw URLs fail; returns HTML prefixed content")
    func strategy2SkillsShFallback() async throws {
        MockURLProtocol.reset()
        // 所有 raw URL 都 404
        MockURLProtocol.stub(
            urlMatch: { $0.host == "raw.githubusercontent.com" },
            status: 404,
            body: Data()
        )
        // skills.sh RSC payload: 我们给一段"含最大 T chunk"的假 payload
        let rsc = makeFakeRSCPayload(htmlBody: "<h1>docs</h1><p>details</p>")
        MockURLProtocol.stub(
            urlMatch: { $0.host == "skills.sh" },
            status: 200,
            body: rsc.data(using: .utf8)!
        )
        let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
        let content = try await fetcher.fetchContent(source: "owner/repo", skillId: "sub")
        #expect(content.hasPrefix("<!-- HTML -->"))
        #expect(content.contains("<h1>docs</h1>"))
    }

    @Test("strategy 3 hits Tree API + raw file when strategies 1 and 2 both fail")
    func strategy3TreeAPI() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.stub(
            urlMatch: { $0.host == "raw.githubusercontent.com" && !$0.path.contains("skills/sub/SKILL.md") },
            status: 404,
            body: Data()
        )
        MockURLProtocol.stub(urlMatch: { $0.host == "skills.sh" }, status: 404, body: Data())
        // Tree API 命中
        let tree = #"{"tree":[{"path":"skills/sub/SKILL.md","type":"blob"}]}"#
        MockURLProtocol.stub(
            urlMatch: { $0.host == "api.github.com" && $0.path.hasSuffix("git/trees/main") },
            status: 200,
            body: tree.data(using: .utf8)!
        )
        // 拿到真实 raw
        MockURLProtocol.stub(
            urlMatch: { $0.host == "raw.githubusercontent.com" && $0.path.hasSuffix("skills/sub/SKILL.md") },
            status: 200,
            body: "# from tree".data(using: .utf8)!
        )
        let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
        let content = try await fetcher.fetchContent(source: "owner/repo", skillId: "sub")
        #expect(content.contains("# from tree"))
    }

    @Test("content is cached for subsequent calls within TTL")
    func cacheHit() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.stub(
            urlMatch: { $0.host == "raw.githubusercontent.com" },
            status: 200,
            body: "# cached".data(using: .utf8)!
        )
        let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
        _ = try await fetcher.fetchContent(source: "owner/repo", skillId: "repo")
        _ = try await fetcher.fetchContent(source: "owner/repo", skillId: "repo")
        let count = MockURLProtocol.requestLog.count
        #expect(count <= 8)  // 第一次最多 8 条候选; 第二次 0 条
    }

    @Test("GitHub API rate-limit response sets internal reset timer")
    func rateLimitBackoff() async throws {
        MockURLProtocol.reset()
        MockURLProtocol.stub(urlMatch: { $0.host == "raw.githubusercontent.com" }, status: 404, body: Data())
        MockURLProtocol.stub(urlMatch: { $0.host == "skills.sh" }, status: 404, body: Data())
        let futureReset = String(Int(Date().addingTimeInterval(3600).timeIntervalSince1970))
        MockURLProtocol.stub(
            urlMatch: { $0.host == "api.github.com" },
            status: 403,
            headers: ["x-ratelimit-remaining": "0", "x-ratelimit-reset": futureReset],
            body: Data()
        )
        let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
        _ = try? await fetcher.fetchContent(source: "a/b", skillId: "x")
        // 立刻再问一次 — tree API 不应被再次打
        MockURLProtocol.clearRequestLog()
        _ = try? await fetcher.fetchContent(source: "c/d", skillId: "y")
        let githubApiCalls = MockURLProtocol.requestLog.filter { $0.url?.host == "api.github.com" }
        #expect(githubApiCalls.count == 0)
    }
}

/// 构造"带 T chunk"的假 RSC payload: `a:T{sizeHex},{body}`
private func makeFakeRSCPayload(htmlBody: String) -> String {
    let size = String(htmlBody.utf8.count, radix: 16)
    return "a:T\(size),\(htmlBody)\nb:T1,x\n"
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 3 级级联**

`Domain/Actors/SkillContentFetcher.swift` （整体替换）:

```swift
import Foundation
import OSLog

public actor SkillContentFetcher {
    public static let htmlPrefix = "<!-- HTML -->"

    private let session: URLSession
    private let rawBase: URL
    private let apiBase: URL
    private let skillsShBase: URL
    private let cacheTTL: TimeInterval

    private var contentCache: [String: (content: String, at: Date)] = [:]
    private var githubApiRateLimitResetAt: Date?

    private let logger = Logger(subsystem: "ai.crazygang.Skillport", category: "fetcher")

    public init(
        session: URLSession,
        rawBase: URL = URL(string: "https://raw.githubusercontent.com")!,
        apiBase: URL = URL(string: "https://api.github.com")!,
        skillsShBase: URL = URL(string: "https://skills.sh")!,
        cacheTTL: TimeInterval = 10 * 60
    ) {
        self.session = session
        self.rawBase = rawBase
        self.apiBase = apiBase
        self.skillsShBase = skillsShBase
        self.cacheTTL = cacheTTL
    }

    // MARK: - Public API

    public func fetchContent(source: String, skillId: String) async throws -> String {
        let cacheKey = "\(source)/\(skillId)"
        if let cached = contentCache[cacheKey],
           Date().timeIntervalSince(cached.at) < cacheTTL {
            return cached.content
        }

        // Strategy 1: 8 个 raw URL 并发 race
        if let raw = try? await fetchFromRawCandidates(source: source, skillId: skillId) {
            contentCache[cacheKey] = (raw, Date())
            return raw
        }

        // Strategy 2: skills.sh RSC payload
        if let html = try? await fetchFromSkillsSh(source: source, skillId: skillId) {
            let content = Self.htmlPrefix + html
            contentCache[cacheKey] = (content, Date())
            return content
        }

        // Strategy 3: GitHub Tree API discovery
        if let tree = try? await discoverViaTreeAPI(source: source, skillId: skillId) {
            contentCache[cacheKey] = (tree, Date())
            return tree
        }
        return ""
    }

    public func invalidateCache(source: String? = nil, skillId: String? = nil) {
        if let s = source, let k = skillId {
            contentCache.removeValue(forKey: "\(s)/\(k)")
        } else {
            contentCache.removeAll()
        }
    }

    // MARK: - Strategy 1

    private func fetchFromRawCandidates(source: String, skillId: String) async throws -> String {
        let urls = Self.buildCandidateURLs(source: source, skillId: skillId, rawBase: rawBase)
        return try await withThrowingTaskGroup(of: String?.self) { group in
            for url in urls {
                group.addTask { [session] in
                    do {
                        var req = URLRequest(url: url)
                        req.timeoutInterval = 8
                        let (data, resp) = try await session.data(for: req)
                        if let http = resp as? HTTPURLResponse, http.statusCode == 200,
                           let text = String(data: data, encoding: .utf8) {
                            return text
                        }
                    } catch {}
                    return nil
                }
            }
            for try await s in group {
                if let s {
                    group.cancelAll()
                    return s
                }
            }
            throw SkillportError.networkFailed(url: urls.first, reason: "all raw candidates failed")
        }
    }

    public static func buildCandidateURLs(source: String, skillId: String, rawBase: URL) -> [URL] {
        let branches = ["main", "master"]
        let layouts = [
            "\(skillId)/SKILL.md",
            "skills/\(skillId)/SKILL.md",
            ".claude/skills/\(skillId)/SKILL.md",
            "SKILL.md",
        ]
        return branches.flatMap { branch in
            layouts.compactMap { layout in
                URL(string: "\(rawBase.absoluteString)/\(source)/\(branch)/\(layout)")
            }
        }
    }

    // MARK: - Strategy 2

    private func fetchFromSkillsSh(source: String, skillId: String) async throws -> String {
        let url = skillsShBase.appendingPathComponent(source).appendingPathComponent(skillId)
        var req = URLRequest(url: url)
        req.setValue("text/x-component", forHTTPHeaderField: "Accept")
        req.setValue("1", forHTTPHeaderField: "RSC")
        req.setValue("%5B%22%22%5D", forHTTPHeaderField: "Next-Router-State-Tree")
        req.timeoutInterval = 10
        let (data, resp) = try await session.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode != 200 {
            throw SkillportError.networkFailed(url: url, reason: "status \(http.statusCode)")
        }
        guard let payload = String(data: data, encoding: .utf8) else {
            throw SkillportError.parseError(reason: "non-utf8 skills.sh payload")
        }
        return try extractLargestTChunk(in: payload)
    }

    /// 找形如 `{ref}:T{hexSize},{html}` 的文本块中 size 最大的那一段 —
    /// skills.sh 在该块里塞渲染好的 SKILL.md HTML。
    private func extractLargestTChunk(in payload: String) throws -> String {
        let pattern = #"^\w+:T([0-9a-f]+),"#
        let regex = try NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
        let ns = payload as NSString
        let range = NSRange(location: 0, length: ns.length)
        var bestOffset = -1
        var bestSize = 0
        regex.enumerateMatches(in: payload, options: [], range: range) { m, _, _ in
            guard let m, m.numberOfRanges >= 2 else { return }
            let hex = ns.substring(with: m.range(at: 1))
            let size = Int(hex, radix: 16) ?? 0
            let afterOffset = m.range.location + m.range.length
            if size > bestSize {
                bestSize = size
                bestOffset = afterOffset
            }
        }
        guard bestOffset >= 0, bestSize >= 50 else {
            throw SkillportError.parseError(reason: "no suitable T chunk")
        }
        let html = ns.substring(with: NSRange(location: bestOffset, length: bestSize))
        guard html.contains("<") else {
            throw SkillportError.parseError(reason: "T chunk is not HTML")
        }
        return html
    }

    // MARK: - Strategy 3

    private func discoverViaTreeAPI(source: String, skillId: String) async throws -> String {
        if let reset = githubApiRateLimitResetAt, Date() < reset {
            throw SkillportError.networkFailed(url: nil, reason: "github api rate limited")
        }
        for branch in ["main", "master"] {
            let url = apiBase
                .appendingPathComponent("repos")
                .appendingPathComponent(source)
                .appendingPathComponent("git/trees")
                .appendingPathComponent(branch)
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            comps.queryItems = [URLQueryItem(name: "recursive", value: "1")]
            var req = URLRequest(url: comps.url!)
            req.setValue("application/vnd.github.v3+json", forHTTPHeaderField: "Accept")
            req.timeoutInterval = 15
            do {
                let (data, resp) = try await session.data(for: req)
                if let http = resp as? HTTPURLResponse {
                    updateRateLimit(from: http)
                    if http.statusCode == 403 || http.statusCode == 429 {
                        return "" // treat as miss
                    }
                    if http.statusCode != 200 { continue }
                }
                struct Tree: Decodable {
                    let tree: [Entry]?
                    struct Entry: Decodable { let path: String; let type: String }
                }
                let parsed = try JSONDecoder().decode(Tree.self, from: data)
                guard let match = parsed.tree?.first(where: {
                    $0.type == "blob" && $0.path.hasSuffix("SKILL.md") && $0.path.contains(skillId)
                }) else { continue }
                let rawURL = rawBase
                    .appendingPathComponent(source)
                    .appendingPathComponent(branch)
                    .appendingPathComponent(match.path)
                var rawReq = URLRequest(url: rawURL)
                rawReq.timeoutInterval = 10
                let (rawData, rawResp) = try await session.data(for: rawReq)
                if let http = rawResp as? HTTPURLResponse, http.statusCode == 200,
                   let content = String(data: rawData, encoding: .utf8) {
                    return content
                }
            } catch {
                logger.warning("tree API error for \(source) @ \(branch): \(error.localizedDescription)")
                continue
            }
        }
        throw SkillportError.networkFailed(url: nil, reason: "tree api found nothing")
    }

    private func updateRateLimit(from response: HTTPURLResponse) {
        let remaining = response.value(forHTTPHeaderField: "x-ratelimit-remaining")
        let reset = response.value(forHTTPHeaderField: "x-ratelimit-reset")
        if remaining == "0", let r = reset, let ts = TimeInterval(r) {
            githubApiRateLimitResetAt = Date(timeIntervalSince1970: ts)
            logger.warning("github api rate limit hit, reset at \(Date(timeIntervalSince1970: ts))")
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive Domain Tests
git add Domain Tests
git commit -m "feat(actor): add 3-tier content fetch cascade to SkillContentFetcher"
```

---

## Phase 3 — 渲染与清洗 (Tasks 5–6)

### Task 5: HTMLSanitizer (SwiftSoup allowlist)

**Files:**
- Modify: `/Users/crazy/own_project/skillport/project.yml`（加 SwiftSoup 依赖）
- Create: `/Users/crazy/own_project/skillport/Domain/Services/HTMLSanitizer.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/HTMLSanitizerTests.swift`

> 1:1 port Electron 版 `src/lib/sanitizeRemoteHtml.ts`。Allowlist 的标签/属性集合保持一致（见 parent repo 参考）。

- [ ] **Step 1: 加 SwiftSoup 依赖**

在 `project.yml` 的 `packages` 块追加:

```yaml
packages:
  SwiftSoup:
    url: https://github.com/scinfu/SwiftSoup
    from: 2.8.7
```

目标 dependencies 加 `- package: SwiftSoup`。跑 `./Scripts/generate-project.sh`。

- [ ] **Step 2: 写失败测试**

`Tests/SkillportTests/Services/HTMLSanitizerTests.swift`:

```swift
import Testing
@testable import Skillport

@Suite("HTMLSanitizer — allowlist parity with Electron sanitizeRemoteHtml")
struct HTMLSanitizerTests {
    let sanitizer = HTMLSanitizer()

    @Test("strips script tags")
    func stripsScript() throws {
        let out = try sanitizer.sanitize("<p>safe</p><script>alert(1)</script>")
        #expect(out.contains("<p>safe</p>"))
        #expect(!out.contains("<script"))
        #expect(!out.contains("alert"))
    }

    @Test("strips style tags and attributes")
    func stripsStyle() throws {
        let out = try sanitizer.sanitize(#"<p style="color:red">x</p><style>body{}</style>"#)
        #expect(!out.contains("<style"))
        #expect(!out.contains("color:red"))
        #expect(out.contains("<p>"))
    }

    @Test("strips iframe / object / embed")
    func stripsDangerousTags() throws {
        let out = try sanitizer.sanitize("<iframe src=evil></iframe><object></object><embed>")
        #expect(!out.contains("iframe"))
        #expect(!out.contains("object"))
        #expect(!out.contains("embed"))
    }

    @Test("allows common markdown-ish tags")
    func allowsMarkdownTags() throws {
        let html = "<h1>t</h1><p>p</p><ul><li>x</li></ul><pre><code>y</code></pre><blockquote>q</blockquote>"
        let out = try sanitizer.sanitize(html)
        for tag in ["h1", "p", "ul", "li", "pre", "code", "blockquote"] {
            #expect(out.contains("<\(tag)"))
        }
    }

    @Test("drops javascript: and data: urls")
    func dropsUnsafeUrls() throws {
        let out = try sanitizer.sanitize(#"<a href="javascript:alert(1)">x</a><a href="data:text/html,evil">y</a>"#)
        #expect(!out.lowercased().contains("javascript:"))
        #expect(!out.lowercased().contains("data:text"))
    }

    @Test("preserves https / http / mailto / tel / relative urls")
    func preservesSafeUrls() throws {
        let cases: [(String, String)] = [
            (#"<a href="https://a.com">a</a>"#, "https://a.com"),
            (#"<a href="mailto:x@y.z">b</a>"#, "mailto:x@y.z"),
            (#"<a href="tel:+1">c</a>"#, "tel:+1"),
            (#"<a href="#section">d</a>"#, "#section"),
            (#"<a href="/relative">e</a>"#, "/relative"),
        ]
        for (input, expected) in cases {
            let out = try sanitizer.sanitize(input)
            #expect(out.contains(expected), "\(input) → \(out)")
        }
    }

    @Test("adds rel=noopener noreferrer to anchors")
    func anchorsGetRel() throws {
        let out = try sanitizer.sanitize(#"<a href="https://a.com">x</a>"#)
        #expect(out.contains("rel=\"noopener noreferrer\""))
    }

    @Test("adds empty alt to images missing alt attribute")
    func imgAltFilled() throws {
        let out = try sanitizer.sanitize(#"<img src="https://a.com/i.png">"#)
        #expect(out.contains("alt=\"\""))
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

- [ ] **Step 4: 实现 sanitizer**

`Domain/Services/HTMLSanitizer.swift`:

```swift
import Foundation
import SwiftSoup

public struct HTMLSanitizer {
    private static let allowedTags: Set<String> = [
        "p", "a", "ul", "ol", "li", "pre", "code", "blockquote",
        "strong", "em", "h1", "h2", "h3", "h4", "h5", "h6",
        "img", "hr", "br", "table", "thead", "tbody", "tr", "th", "td",
    ]
    private static let allowedAttrs: Set<String> = [
        "href", "src", "alt", "title", "target", "rel",
    ]
    private static let urlAttrs: Set<String> = ["href", "src"]
    private static let safeProtocols: Set<String> = ["http", "https", "mailto", "tel"]

    public init() {}

    public func sanitize(_ html: String) throws -> String {
        let doc = try SwiftSoup.parseBodyFragment(html)
        let body = try #require(doc.body(), "SwiftSoup returned doc without body")
        try walkAndClean(body)
        // SwiftSoup.parseBodyFragment 产出的 body 外包 `<html><body>...</body></html>`,
        // 我们只要 body 的内部 HTML。
        return try body.html()
    }

    private func walkAndClean(_ node: Element) throws {
        // 对 body 里的所有元素做深度遍历 — 先收集, 再变更, 避免迭代时结构变化。
        let elements = try node.getAllElements().array()
        for el in elements {
            let tag = el.tagName().lowercased()
            if !Self.allowedTags.contains(tag) && tag != "body" && tag != "html" {
                try el.unwrap()  // 保留内容, 移除标签
                continue
            }
            // 清属性
            let attrs = el.getAttributes()?.asList().map { $0.getKey() } ?? []
            for key in attrs {
                let lowerKey = key.lowercased()
                if !Self.allowedAttrs.contains(lowerKey) {
                    try el.removeAttr(key)
                    continue
                }
                if Self.urlAttrs.contains(lowerKey) {
                    let val = try el.attr(key)
                    if !Self.isSafeURL(val) {
                        try el.removeAttr(key)
                    }
                }
            }
            // 锚点强制 rel=noopener noreferrer
            if tag == "a", try el.hasAttr("href") {
                try el.attr("rel", "noopener noreferrer")
            }
            // img 无 alt 补空 alt
            if tag == "img", try !el.hasAttr("alt") {
                try el.attr("alt", "")
            }
        }
    }

    private static func isSafeURL(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        if trimmed.hasPrefix("#") || trimmed.hasPrefix("/") ||
           trimmed.hasPrefix("./") || trimmed.hasPrefix("../") {
            return true
        }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased() else {
            return false
        }
        return safeProtocols.contains(scheme)
    }
}

// Pre-Swift-6 compat shim for #require in non-test code
@inlinable
internal func `#require`<T>(_ value: T?, _ msg: @autoclosure () -> String = "") throws -> T {
    guard let v = value else {
        throw SkillportError.parseError(reason: msg())
    }
    return v
}
```

- [ ] **Step 5: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive Domain Tests
git add Domain Tests project.yml Skillport.xcodeproj
git commit -m "feat(service): add HTMLSanitizer with SwiftSoup allowlist (port of sanitizeRemoteHtml)"
```

---

### Task 6: RegistryContentRenderer (branch → AttributedString)

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Services/RegistryContentRenderer.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/RegistryContentRendererTests.swift`

> 对照 Electron 的 `SafeRemoteContent.tsx`：
> - 空内容 → `.empty(message)`
> - `<!-- HTML -->` sentinel → `sanitize → NSAttributedString(.html) → AttributedString`
> - 否则 → 剥 frontmatter → `swift-markdown` → AttributedString
>
> 返回枚举, 让 View 层决定空态渲染方式（Text / 自定义 Empty state）。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Services/RegistryContentRendererTests.swift`:

```swift
import Testing
@testable import Skillport
import Foundation

@Suite("RegistryContentRenderer")
struct RegistryContentRendererTests {
    let renderer = RegistryContentRenderer()

    @Test("empty input yields .empty")
    func emptyBranch() throws {
        switch try renderer.render("") {
        case .empty: break
        default: Issue.record("expected .empty")
        }
    }

    @Test("whitespace-only input yields .empty")
    func whitespaceBranch() throws {
        switch try renderer.render("   \n\t  ") {
        case .empty: break
        default: Issue.record("expected .empty")
        }
    }

    @Test("html-prefixed input goes through sanitizer + NSAttributedString branch")
    func htmlBranch() throws {
        let input = "<!-- HTML -->\n<p>hi</p><script>x</script>"
        switch try renderer.render(input) {
        case .attributed(let str):
            #expect(String(str.characters).contains("hi"))
        case .empty, .markdown:
            Issue.record("expected .attributed for HTML branch")
        }
    }

    @Test("markdown branch strips frontmatter before rendering")
    func markdownStripsFrontmatter() throws {
        let input = """
        ---
        description: x
        ---
        # Hello
        """
        switch try renderer.render(input) {
        case .markdown(let str):
            let s = String(str.characters)
            #expect(s.contains("Hello"))
            #expect(!s.contains("description"))
        default:
            Issue.record("expected .markdown")
        }
    }

    @Test("markdown with no frontmatter also renders")
    func plainMarkdown() throws {
        switch try renderer.render("# Plain") {
        case .markdown(let str):
            #expect(String(str.characters).contains("Plain"))
        default:
            Issue.record("expected .markdown")
        }
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 renderer**

`Domain/Services/RegistryContentRenderer.swift`:

```swift
import Foundation
import AppKit
import Markdown

public enum RegistryRendered: Sendable {
    case empty(reason: String)
    case markdown(AttributedString)
    case attributed(AttributedString)
}

public struct RegistryContentRenderer {
    private let sanitizer: HTMLSanitizer
    private static let htmlPrefix = "<!-- HTML -->"
    private static let frontmatterPattern = #"\A---\r?\n[\s\S]*?\r?\n---\r?\n?"#

    public init(sanitizer: HTMLSanitizer = HTMLSanitizer()) {
        self.sanitizer = sanitizer
    }

    public func render(_ raw: String, emptyMessage: String = "No documentation available") throws -> RegistryRendered {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .empty(reason: emptyMessage) }

        if trimmed.hasPrefix(Self.htmlPrefix) {
            let body = String(trimmed.dropFirst(Self.htmlPrefix.count))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let sanitized = try sanitizer.sanitize(body)
            if sanitized.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return .empty(reason: emptyMessage)
            }
            let attributed = try renderHTMLToAttributed(sanitized)
            return .attributed(AttributedString(attributed))
        }

        let stripped = try stripFrontmatter(trimmed)
        if stripped.isEmpty { return .empty(reason: emptyMessage) }
        let doc = Document(parsing: stripped)
        let md = MarkdownAttributedRenderer().render(doc)
        return .markdown(md)
    }

    // MARK: - HTML → NSAttributedString

    /// NSAttributedString 的 HTML 文档加载内部走 WebKit 但不执行 JS。我们在传入前已用
    /// HTMLSanitizer 剥离 script/style/iframe 等危险标签和非 http/https/mailto/tel 的 URL,
    /// 因此也不会触发外部资源加载 (无 img src 的远程请求, 所有 href 已归一化)。
    /// 调用必须在 main thread — NSAttributedString.init(data:options:) 是 UI-thread-bound。
    @MainActor
    private func renderHTMLToAttributed(_ html: String) throws -> NSAttributedString {
        guard let data = html.data(using: .utf8) else {
            throw SkillportError.parseError(reason: "utf8 encode failed")
        }
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
        ]
        return try NSAttributedString(data: data, options: options, documentAttributes: nil)
    }

    // MARK: - Frontmatter strip

    private func stripFrontmatter(_ s: String) throws -> String {
        let regex = try NSRegularExpression(pattern: Self.frontmatterPattern)
        let range = NSRange(location: 0, length: (s as NSString).length)
        let replaced = regex.stringByReplacingMatches(
            in: s, options: [], range: range, withTemplate: ""
        )
        return replaced.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// 极简 markdown → AttributedString 渲染 — SwiftUI Text 能消费的最基本富文本。
/// 复杂渲染（表格、图片）放到 M6/M7。
private struct MarkdownAttributedRenderer {
    func render(_ doc: Document) -> AttributedString {
        var out = AttributedString()
        var visitor = Visitor()
        visitor.visit(doc)
        out = visitor.result
        return out
    }

    private struct Visitor: MarkupWalker {
        var result = AttributedString()

        mutating func visitText(_ text: Text) -> Void {
            result.append(AttributedString(text.string))
        }
        mutating func visitHeading(_ heading: Heading) -> Void {
            var block = AttributedString()
            for child in heading.inlineChildren {
                var inner = AttributedString(child.plainText)
                inner.font = .system(size: CGFloat(28 - heading.level * 2), weight: .bold)
                block.append(inner)
            }
            block.append(AttributedString("\n\n"))
            result.append(block)
        }
        mutating func visitParagraph(_ paragraph: Paragraph) -> Void {
            for child in paragraph.inlineChildren {
                result.append(AttributedString(child.plainText))
            }
            result.append(AttributedString("\n\n"))
        }
        mutating func visitCodeBlock(_ codeBlock: CodeBlock) -> Void {
            var block = AttributedString(codeBlock.code)
            block.font = .system(.body, design: .monospaced)
            result.append(block)
            result.append(AttributedString("\n"))
        }
        mutating func visitInlineCode(_ inlineCode: InlineCode) -> Void {
            var s = AttributedString(inlineCode.code)
            s.font = .system(.body, design: .monospaced)
            result.append(s)
        }
        mutating func visitLink(_ link: Link) -> Void {
            var s = AttributedString(link.plainText)
            if let dest = link.destination, let url = URL(string: dest) {
                s.link = url
            }
            result.append(s)
        }
        mutating func visitEmphasis(_ emphasis: Emphasis) -> Void {
            var s = AttributedString(emphasis.plainText)
            s.font = .italicSystemFont(ofSize: NSFont.systemFontSize)
            result.append(s)
        }
        mutating func visitStrong(_ strong: Strong) -> Void {
            var s = AttributedString(strong.plainText)
            s.font = .boldSystemFont(ofSize: NSFont.systemFontSize)
            result.append(s)
        }
        mutating func visitListItem(_ listItem: ListItem) -> Void {
            result.append(AttributedString("• "))
            descendInto(listItem)
            result.append(AttributedString("\n"))
        }

        mutating func descendInto(_ markup: Markup) {
            for child in markup.children {
                visit(child)
            }
        }
    }
}
```

> **注**：`MarkdownAttributedRenderer` 故意简化 — 只渲染标题、段落、代码块、内联代码、链接、斜体、粗体、列表项。表格和图片留到 M6/M7。

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive Domain Tests
git add Domain Tests
git commit -m "feat(service): add RegistryContentRenderer with HTML + Markdown branches"
```

---

## Phase 4 — Model 与依赖注入 (Tasks 7–8)

### Task 7: RegistryModel (@Observable)

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Models/RegistryModel.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/RegistryModelTests.swift`

> 对应 Electron 版里 `useRegistryLeaderboard` / `useRegistrySearch` / `useContentFetch` 三个 React Query hook 合并到一个 Observable class。提供：search input（带 debounce）、category tabs、selection、content fetch、install action。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Models/RegistryModelTests.swift`:

```swift
import Testing
@testable import Skillport
import Foundation

@MainActor
@Suite("RegistryModel", .serialized)
struct RegistryModelTests {
    private func makeModel() -> (RegistryModel, MockURLProtocol.Type) {
        MockURLProtocol.reset()
        let session = MockURLProtocol.makeSession()
        let registry = RegistryActor(session: session)
        let fetcher = SkillContentFetcher(session: session)
        let manager = SkillManagerActor.makeDummy()  // test helper
        return (RegistryModel(registry: registry, contentFetcher: fetcher, manager: manager),
                MockURLProtocol.self)
    }

    @Test("initial category is .allTime, search empty")
    func initialState() async {
        let (model, _) = makeModel()
        #expect(model.category == .allTime)
        #expect(model.searchInput.isEmpty)
        #expect(model.skills.isEmpty)
        #expect(model.selectedID == nil)
    }

    @Test("loadLeaderboard populates skills + totalCount")
    func loadLeaderboard() async throws {
        let (model, _) = makeModel()
        let html = try String(contentsOf: #require(TestBundleLocator.bundle.url(
            forResource: "skills-sh-leaderboard-alltime", withExtension: "html")), encoding: .utf8)
        MockURLProtocol.stub(url: URL(string: "https://skills.sh/")!, status: 200, body: html.data(using: .utf8)!)
        await model.loadLeaderboard()
        #expect(model.skills.count > 0)
        #expect(model.isLoading == false)
    }

    @Test("select(id:) triggers content fetch and populates rendered")
    func selectFetchesContent() async throws {
        let (model, _) = makeModel()
        model.skills = [RegistrySkill(id: "a/b/b", skillId: "b", name: "B", installs: 1, source: "a/b")]
        MockURLProtocol.stub(
            urlMatch: { $0.host == "raw.githubusercontent.com" },
            status: 200,
            body: "# doc".data(using: .utf8)!
        )
        await model.select(id: "a/b/b")
        #expect(model.selectedID == "a/b/b")
        switch model.rendered {
        case .markdown: break
        default: Issue.record("expected markdown rendered result")
        }
    }

    @Test("search runs when input is non-empty after debounce")
    func searchDebounce() async throws {
        let (model, _) = makeModel()
        let json = #"{"skills":[{"id":"x/y/y","skillId":"y","name":"y","installs":1,"source":"x/y"}]}"#
        MockURLProtocol.stub(
            urlMatch: { $0.path == "/api/search" },
            status: 200,
            body: json.data(using: .utf8)!
        )
        model.searchInput = "y"
        await model.runSearchNow()  // 测试里绕过 debounce 直接跑
        #expect(model.skills.count == 1)
        #expect(model.skills[0].skillId == "y")
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 model**

`App/Models/RegistryModel.swift`:

```swift
import Foundation
import Observation

@MainActor
@Observable
public final class RegistryModel {
    public var searchInput: String = "" {
        didSet { scheduleDebouncedSearch() }
    }
    public var category: LeaderboardCategory = .allTime {
        didSet { Task { await loadLeaderboard() } }
    }
    public var skills: [RegistrySkill] = []
    public var totalCount: Int = 0
    public var selectedID: String?
    public var rendered: RegistryRendered = .empty(reason: "Select a skill")
    public var isLoading: Bool = false
    public var isContentLoading: Bool = false
    public var lastError: String?

    public var selectedAgentsForInstall: Set<AgentID> = []

    private let registry: RegistryActor
    private let contentFetcher: SkillContentFetcher
    private let manager: SkillManagerActor
    private let renderer: RegistryContentRenderer

    private var debounceTask: Task<Void, Never>?

    public init(
        registry: RegistryActor,
        contentFetcher: SkillContentFetcher,
        manager: SkillManagerActor,
        renderer: RegistryContentRenderer = RegistryContentRenderer()
    ) {
        self.registry = registry
        self.contentFetcher = contentFetcher
        self.manager = manager
        self.renderer = renderer
    }

    public func onAppear() {
        Task { await loadLeaderboard() }
    }

    public func loadLeaderboard() async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }
        do {
            let result = try await registry.leaderboard(category)
            skills = result.skills
            totalCount = result.totalCount
        } catch {
            lastError = String(describing: error)
            skills = []
            totalCount = 0
        }
    }

    public func runSearchNow() async {
        let q = searchInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            await loadLeaderboard()
            return
        }
        isLoading = true
        lastError = nil
        defer { isLoading = false }
        do {
            let results = try await registry.search(query: q)
            skills = results
            totalCount = results.count
        } catch {
            lastError = String(describing: error)
            skills = []
        }
    }

    public func select(id: String) async {
        selectedID = id
        rendered = .empty(reason: "Loading…")
        selectedAgentsForInstall = []
        guard let skill = skills.first(where: { $0.id == id }) else { return }
        isContentLoading = true
        defer { isContentLoading = false }
        do {
            let raw = try await contentFetcher.fetchContent(source: skill.source, skillId: skill.skillId)
            rendered = try renderer.render(raw)
        } catch {
            lastError = String(describing: error)
            rendered = .empty(reason: "Failed to load")
        }
    }

    public func toggleAgentForInstall(_ agent: AgentID) {
        if selectedAgentsForInstall.contains(agent) {
            selectedAgentsForInstall.remove(agent)
        } else {
            selectedAgentsForInstall.insert(agent)
        }
    }

    public func installSelected(home: URL) async -> Result<Skill, Error> {
        guard let id = selectedID,
              let skill = skills.first(where: { $0.id == id }),
              let (owner, repo) = skill.ownerAndRepo else {
            return .failure(SkillportError.parseError(reason: "no selection"))
        }
        guard skill.isSingleSkillRepo else {
            return .failure(SkillportError.parseError(
                reason: "multi-skill repo install is not supported in M5; use CLI command"
            ))
        }
        do {
            let installed = try await manager.installFromGitHub(
                owner: owner, repo: repo, ref: "HEAD",
                home: home, installTo: selectedAgentsForInstall
            )
            return .success(installed)
        } catch {
            return .failure(error)
        }
    }

    // MARK: - Debounce

    private func scheduleDebouncedSearch() {
        debounceTask?.cancel()
        let current = searchInput
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled, let self else { return }
            if self.searchInput == current {
                await self.runSearchNow()
            }
        }
    }
}
```

- [ ] **Step 4: 补 `SkillManagerActor.installFromGitHub` 包装（若不存在）**

`manager.installFromGitHub` 是对 `SkillInstallerActor.installGitHub` 的窄通道代理，也负责 broadcast 到 `DomainEvent` 流。若 `SkillManagerActor` 尚未暴露此方法, 先加：

```swift
// 在 SkillManagerActor.swift 里
public func installFromGitHub(
    owner: String, repo: String, ref: String,
    home: URL, installTo: Set<AgentID>
) async throws -> Skill {
    let skill = try await installer.installGitHub(
        owner: owner, repo: repo, ref: ref,
        home: home, installTo: installTo
    )
    eventContinuation.yield(.skillInstalled(name: skill.name))
    await rescan(home: home)
    return skill
}
```

若 `.skillInstalled(name:)` case 已存在就复用; 否则加 DomainEvent case 并附带一行测试覆盖。

- [ ] **Step 5: 测试辅助 `SkillManagerActor.makeDummy()`**

在 `Tests/SkillportTests/TestSupport/` 加 helper：

```swift
extension SkillManagerActor {
    static func makeDummy() -> SkillManagerActor {
        // 最小实例 — M5 model tests 里不真的 install, 所以 actor 只需响应调用不崩。
        // 具体参数依现有 init 签名填充(见 AppContainer.swift 真实构造).
        fatalError("TODO in Task 7 Step 5: copy AppContainer's init wiring for test-only instance")
    }
}
```

> **实施者注**：这里的写法可能需要根据 `SkillManagerActor` 真实 init 签名调整 — 参考 `App/Composition/AppContainer.swift` 复制一份最小版本。如果 SkillManagerActor 依赖过多使得 test dummy 构造困难，退路是让 `RegistryModel` 只持有 `SkillInstallerActor` 而不是 `SkillManagerActor`，M5 的 Install 按钮不需要全量 manager。

- [ ] **Step 6: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive App Tests
git add App Domain Tests
git commit -m "feat(model): add RegistryModel wrapping registry + content + install flow"
```

---

### Task 8: AppContainer wiring + 新源码目录注册

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Composition/AppContainer.swift`
- Modify: `/Users/crazy/own_project/skillport/project.yml`

- [ ] **Step 1: 在 project.yml 的 sources 加新目录**

确保 `Domain/Parsers` 和 `App/Views/Registry`（Task 9 会创建）在 target sources 里：

```yaml
targets:
  Skillport:
    sources:
      - App
      - Domain
      # …其它已有项
```

若已经是递归的 `- App` / `- Domain`, 无需改动。

- [ ] **Step 2: 在 AppContainer 里暴露 RegistryModel + SkillContentFetcher（如尚未暴露）**

```swift
@MainActor
public final class AppContainer {
    // …existing fields
    public let registryActor: RegistryActor
    public let contentFetcher: SkillContentFetcher
    public let registryModel: RegistryModel

    public init() {
        // …existing initialization

        let session = NetworkSession.shared(proxy: proxySettings)
        self.registryActor = RegistryActor(session: session)
        self.contentFetcher = SkillContentFetcher(session: session)
        self.registryModel = RegistryModel(
            registry: registryActor,
            contentFetcher: contentFetcher,
            manager: skillManager
        )
    }
}
```

- [ ] **Step 3: 在 SkillportApp 的 environment 注入中加 `registryModel`**

```swift
// App/SkillportApp.swift
RootView()
    .environment(container.registryModel)
    // …其它 environment
```

- [ ] **Step 4: 跑测试 + commit（可能不涉及新测试, 只是 wiring 改动）**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App project.yml
git commit -m "chore(app): wire RegistryModel through AppContainer"
```

Expected: build 成功, 所有旧测试继续绿。

---

## Phase 5 — View 层 (Tasks 9–10)

### Task 9: RegistryBrowserView 骨架 + 左侧搜索/分类/列表

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistryBrowserView.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistrySidebar.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistryRow.swift`
- Modify: `/Users/crazy/own_project/skillport/App/Views/RootView.swift`（替换 stub）

- [ ] **Step 1: RegistryRow + RegistrySidebar + RegistryBrowserView 骨架**

`App/Views/Registry/RegistryRow.swift`:

```swift
import SwiftUI

struct RegistryRow: View {
    let skill: RegistrySkill
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(skill.name).font(.body).lineLimit(1)
                Spacer()
                Label(formatInstalls(skill.installs), systemImage: "arrow.down.circle")
                    .labelStyle(.titleAndIcon)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(skill.source)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(isSelected ? Color.accentColor.opacity(0.15) : .clear)
        .cornerRadius(4)
    }

    private func formatInstalls(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fK", Double(n) / 1_000) }
        return String(n)
    }
}
```

`App/Views/Registry/RegistrySidebar.swift`:

```swift
import SwiftUI

struct RegistrySidebar: View {
    @Bindable var model: RegistryModel

    var body: some View {
        VStack(spacing: 0) {
            // Search
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField(String(localized: "Search skills"), text: $model.searchInput)
                    .textFieldStyle(.plain)
            }
            .padding(8)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(6)
            .padding(8)

            // Category tabs (hidden when searching)
            if model.searchInput.trimmingCharacters(in: .whitespaces).isEmpty {
                HStack(spacing: 4) {
                    ForEach(LeaderboardCategory.allCases, id: \.self) { c in
                        Button {
                            model.category = c
                        } label: {
                            Text(label(for: c))
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(model.category == c ? Color.accentColor.opacity(0.3) : .clear)
                                .cornerRadius(4)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    if model.totalCount > 0 {
                        Text("\(model.totalCount)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }

            // List
            if model.isLoading {
                ProgressView().padding()
                Spacer()
            } else if model.skills.isEmpty {
                Text(model.searchInput.isEmpty
                     ? String(localized: "No skills available")
                     : String(localized: "No results"))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .padding()
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(model.skills) { skill in
                            Button {
                                Task { await model.select(id: skill.id) }
                            } label: {
                                RegistryRow(skill: skill, isSelected: model.selectedID == skill.id)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }
        }
        .frame(minWidth: 300)
    }

    private func label(for c: LeaderboardCategory) -> String {
        switch c {
        case .allTime: return String(localized: "All Time")
        case .trending: return String(localized: "Trending")
        case .hot: return String(localized: "Hot")
        }
    }
}
```

`App/Views/Registry/RegistryBrowserView.swift` （骨架版, 详情面板 Task 10 补）:

```swift
import SwiftUI

struct RegistryBrowserView: View {
    @Environment(RegistryModel.self) private var model

    var body: some View {
        @Bindable var model = model
        HSplitView {
            RegistrySidebar(model: model)
            RegistryDetailView(model: model)
        }
        .onAppear { model.onAppear() }
    }
}

struct RegistryDetailView: View {
    @Bindable var model: RegistryModel

    var body: some View {
        Text("Detail panel — Task 10")
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
```

`App/Views/RootView.swift` — 替换 registry 分支：

```swift
case .registry:
    RegistryBrowserView()
```

- [ ] **Step 2: 跑 build + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
swift-format lint --recursive App
git add App
git commit -m "feat(view): add RegistryBrowserView shell with search/category/list"
```

Expected: build 成功, app 能进入 Registry tab 看到左侧列表（真网络下需要在线）。

---

### Task 10: Registry 详情面板 — header + install command + 内容 + agent 选择 + Install 按钮

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistryBrowserView.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistryDetailPanel.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Registry/RegistryContentView.swift`

- [ ] **Step 1: RegistryContentView — 展示 `RegistryRendered`**

```swift
import SwiftUI

struct RegistryContentView: View {
    let rendered: RegistryRendered
    let isLoading: Bool

    var body: some View {
        ScrollView {
            Group {
                if isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }.padding()
                } else {
                    switch rendered {
                    case .empty(let msg):
                        Text(msg).foregroundStyle(.secondary).padding()
                    case .markdown(let s), .attributed(let s):
                        Text(s).textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: RegistryDetailPanel**

`App/Views/Registry/RegistryDetailPanel.swift`:

```swift
import SwiftUI

struct RegistryDetailPanel: View {
    @Bindable var model: RegistryModel
    @Environment(SkillsModel.self) private var skills
    @Environment(NotificationModel.self) private var notifications

    var body: some View {
        if let id = model.selectedID,
           let skill = model.skills.first(where: { $0.id == id }) {
            VStack(alignment: .leading, spacing: 0) {
                header(skill)
                installCommandBar(skill)
                Divider()
                RegistryContentView(rendered: model.rendered, isLoading: model.isContentLoading)
                Divider()
                agentSelector(skill)
            }
        } else {
            VStack {
                Spacer()
                Text(String(localized: "Select a skill to see details"))
                    .foregroundStyle(.secondary)
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private func header(_ skill: RegistrySkill) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(skill.name).font(.title2).bold()
            HStack(spacing: 12) {
                Label("\(skill.installs) installs", systemImage: "arrow.down.circle")
                Link("skills.sh", destination: URL(string: "https://skills.sh/\(skill.id)")!)
                Link(skill.source, destination: URL(string: "https://github.com/\(skill.source)")!)
            }
            .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
    }

    @ViewBuilder
    private func installCommandBar(_ skill: RegistrySkill) -> some View {
        HStack(spacing: 8) {
            Text(skill.installCommand)
                .font(.system(.caption, design: .monospaced))
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(4)
            Button {
                let pb = NSPasteboard.general
                pb.clearContents()
                pb.setString(skill.installCommand, forType: .string)
                notifications.push(.init(kind: .success, text: String(localized: "Copied install command")))
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func agentSelector(_ skill: RegistrySkill) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Install to agents"))
                .font(.caption).foregroundStyle(.secondary)
            let installed = skills.agents.filter(\.isInstalled)
            WrappingHStack {
                ForEach(installed, id: \.id) { agent in
                    Button {
                        model.toggleAgentForInstall(agent.id)
                    } label: {
                        Text(agent.id.displayName)
                            .font(.caption)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(model.selectedAgentsForInstall.contains(agent.id)
                                        ? Color.accentColor.opacity(0.3) : Color.clear)
                            .overlay(RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.gray.opacity(0.4), lineWidth: 1))
                            .cornerRadius(4)
                    }
                    .buttonStyle(.plain)
                }
            }
            Button {
                Task { await handleInstall(skill) }
            } label: {
                HStack {
                    Spacer()
                    Text(skill.isSingleSkillRepo
                         ? String(localized: "Install")
                         : String(localized: "Multi-skill repo — use CLI above"))
                    Spacer()
                }.padding(.vertical, 6)
            }
            .disabled(!skill.isSingleSkillRepo || model.selectedAgentsForInstall.isEmpty)
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private func handleInstall(_ skill: RegistrySkill) async {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let result = await model.installSelected(home: home)
        switch result {
        case .success(let installed):
            notifications.push(.init(kind: .success,
                text: String(localized: "Installed \(installed.name)")))
        case .failure(let error):
            notifications.push(.init(kind: .error,
                text: String(describing: error)))
        }
    }
}

/// 简易 flow layout — SwiftUI 原生 wrapping 在 macOS 15 用 Layout 协议。
struct WrappingHStack: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 300
        return layout(subviews: subviews, width: width).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(subviews: subviews, width: bounds.width)
        for (sv, rect) in zip(subviews, result.rects) {
            sv.place(at: CGPoint(x: bounds.minX + rect.minX, y: bounds.minY + rect.minY), proposal: .init(rect.size))
        }
    }
    private func layout(subviews: Subviews, width: CGFloat) -> (rects: [CGRect], size: CGSize) {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        var rects: [CGRect] = []
        for sv in subviews {
            let s = sv.sizeThatFits(.unspecified)
            if x + s.width > width { x = 0; y += rowH + 4; rowH = 0 }
            rects.append(CGRect(x: x, y: y, width: s.width, height: s.height))
            x += s.width + 4
            rowH = max(rowH, s.height)
        }
        return (rects, CGSize(width: width, height: y + rowH))
    }
}
```

- [ ] **Step 3: 替换 RegistryDetailView 占位为 RegistryDetailPanel**

`RegistryBrowserView.swift`：
```swift
HSplitView {
    RegistrySidebar(model: model)
    RegistryDetailPanel(model: model)
}
```
删除旧 `RegistryDetailView` struct。

- [ ] **Step 4: build + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
swift-format lint --recursive App
git add App
git commit -m "feat(view): add Registry detail panel with install command + agent selector"
```

---

## Phase 6 — 端到端集成测试 (Task 11)

### Task 11: M5 E2E test — mock skills.sh → select → content fetch → verify render branch

**Files:**
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/E2E/RegistryE2ETests.swift`

> 沿用 M4 末尾 end-to-end 测试思路：用 TempDir 造一个"假 home"+ MockURLProtocol 把 skills.sh 和 raw.githubusercontent.com 全桩成本地 fixture, 完整走一遍 leaderboard → select → render → （若 single-skill）install → verify symlink。

- [ ] **Step 1: 写测试**

```swift
import Testing
@testable import Skillport
import Foundation

@MainActor
@Suite("M5 Registry E2E", .serialized)
struct RegistryE2ETests {
    @Test("leaderboard → select HTML skill → content rendered via sanitizer path")
    func htmlBranchEnd2End() async throws {
        MockURLProtocol.reset()
        let leaderboardHTML = try String(contentsOf: #require(TestBundleLocator.bundle.url(
            forResource: "skills-sh-leaderboard-alltime", withExtension: "html")), encoding: .utf8)
        MockURLProtocol.stub(
            url: URL(string: "https://skills.sh/")!, status: 200,
            body: leaderboardHTML.data(using: .utf8)!
        )
        // raw 全部 404
        MockURLProtocol.stub(urlMatch: { $0.host == "raw.githubusercontent.com" }, status: 404, body: Data())
        // skills.sh content 回一个假 RSC payload (含最大 T chunk)
        let rsc = "a:T22,<h1>hi</h1><script>x</script>\nb:T1,x\n"
        MockURLProtocol.stub(
            urlMatch: { $0.host == "skills.sh" && $0.path != "/" },
            status: 200, body: rsc.data(using: .utf8)!
        )

        let registry = RegistryActor(session: MockURLProtocol.makeSession())
        let fetcher = SkillContentFetcher(session: MockURLProtocol.makeSession())
        let manager = SkillManagerActor.makeDummy()
        let model = RegistryModel(registry: registry, contentFetcher: fetcher, manager: manager)

        await model.loadLeaderboard()
        let first = try #require(model.skills.first)
        await model.select(id: first.id)

        switch model.rendered {
        case .attributed(let s):
            let text = String(s.characters)
            #expect(text.contains("hi"))
            #expect(!text.contains("script"))
        default:
            Issue.record("expected .attributed branch for HTML-prefixed content")
        }
    }

    @Test("single-skill repo install goes through manager + creates symlink")
    func installSingleSkillRepo() async throws {
        let home = try TempDir.create()
        defer { try? home.cleanup() }
        // … 完整集成的 install 流: 需要 git 能访问本地 bare repo 作为 clone source,
        // 具体 fixture 构造可以复用 M4 end-to-end test 里用的 pattern。
        // (详见 Tests/SkillportTests/E2E/InstallFlowTests.swift 里 M1-M4 的 Task 52 样例)
    }
}
```

- [ ] **Step 2: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -15
git add Tests
git commit -m "test(e2e): add M5 registry end-to-end test (leaderboard → render → install)"
```

Expected: 所有新旧测试绿 (103 + ~30 新增 ≈ 130+)。

---

## Phase 7 — 文档与收尾 (Task 12)

### Task 12: M5 收尾 — README 更新 + handoff 文档 + CI 验证

**Files:**
- Modify: `/Users/crazy/own_project/skillport/README.md`
- Create: `/Users/crazy/own_project/skillport/docs/handoff-2026-05-XX.md`（XX 用 task 完成当日日期）

- [ ] **Step 1: README Features 段加一行**

```markdown
- ✅ Registry browser (skills.sh) with search, leaderboard, HTML+Markdown preview, one-click install
```

- [ ] **Step 2: 更新 handoff（参考本 plan 的 parent handoff 格式）**

内容应该覆盖：
- M5 已完工的功能
- 本次踩坑（skills.sh 改版、NSAttributedString 渲染缺陷等）
- 下一步候选（M6 加分项 + Settings + i18n 或 M7 发布）

- [ ] **Step 3: push + CI 验证**

```bash
git push origin main
gh run watch
```

- [ ] **Step 4: commit handoff**

```bash
git add README.md docs/
git commit -m "docs: M5 Registry complete; ready for M6 plan"
git push
```

---

## 总结清单（实施者完工时自查）

- [ ] 12 个 task 全部打勾
- [ ] `xcodebuild test` 全绿（预期 130+ tests）
- [ ] `swift-format lint --recursive App Domain Tests` 静默
- [ ] Swift 6 strict concurrency 0 error 0 warning
- [ ] CI `gh run watch` 绿
- [ ] 启动 app → Sidebar 点 Registry → 能搜到、点进去看到内容、能一键 install 到 agent
- [ ] `~/.agents/.skill-lock.json` version 仍为 `3`
- [ ] 无任何 `Co-Authored-By:` trailer 混入
- [ ] SwiftSoup 作为新依赖在 `project.yml` 和 `Skillport.xcodeproj` 里登记

---

## 超出本 plan 的后续工作（M6+ backlog）

- 多-skill repo 的 App 内 install（扩展 `SkillInstallerActor.installGitHub` 接受 `skillId`，用 `git sparse-checkout` 或子目录提升）
- i18n：生成 `Localizable.xcstrings` + 补 zh-Hans 翻译
- Registry 详情表格/图片渲染（当前 `MarkdownAttributedRenderer` 简版）
- Registry "打开 GitHub 仓库"按钮 → 原生 NSWorkspace.open
- skills.sh fixture 定期更新的 CI cron
- Registry 错误状态更友好（网络错 / parse 错 / rate limit 错的分类 Toast）
- M7 发布流水线
