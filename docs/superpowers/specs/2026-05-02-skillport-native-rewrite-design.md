# Skillport — macOS 原生重写 SkillPilot 的设计文档

**日期**：2026-05-02
**状态**：设计已确认，待转为实现计划
**上游**：基于现有 `crazygang-ai/skillpilot` (Electron + React)

## 一、目标与范围

### 目标

用 Swift / SwiftUI 将现有 Electron + React 版 SkillPilot 重写为原生 macOS 应用，品牌名 **Skillport**。不做跨平台。

- **本地路径**：`/Users/crazy/own_project/skillport`（与现有 `/Users/crazy/own_project/skillpilot` 同级）
- **远程仓库**：`crazygang-ai/skillport`（全新独立仓库，与 `crazygang-ai/skillpilot` 无 git 关联）

### 范围

- **功能层面**：与现有 SkillPilot 1:1 parity，即完整保留 Dashboard、Registry Browser (skills.sh)、SKILL.md 编辑器、批量更新检测、GitHub / 本地导入、代理支持、i18n（en + zh-Hans）、自动更新、文件系统监听、Keychain 密钥存储、11 个 agent 支持。
- **原生加分项（三项）**：Finder 拖放导入本地 skill；MenuBarExtra 菜单栏常驻；Quick Look 扩展原生渲染 `SKILL.md`。
- **平台目标**：macOS 15 Sequoia 或更高。
- **不做**：任何跨平台；不改动 `~/.agents/` 的磁盘 schema；不替换 lockfile v3。

### 并存策略

Skillport 与 Electron 版 SkillPilot 读写**同一份磁盘目录**（`~/.agents/skills/`、`.skill-lock.json`、`.skillpilot-cache.json`），两个 app 可共存，用户可渐进切换。Bundle ID 不同（`ai.crazygang.Skillport` vs `com.skillpilot.app`），UserDefaults 独立，但 Keychain service name 共享以便代理密码复用。

## 二、架构

### 2.1 三层分层

```
┌─────────────────────────────────────────────────┐
│   SwiftUI Views      Dashboard / Registry /     │
│   (App target)       Editor / Settings /        │
│                      MenuBarExtra / QL Preview  │
├─────────────────────────────────────────────────┤
│   Observable Models  AppModel · SkillsModel ·   │
│   (@Observable)      RegistryModel · UpdateModel│
│                      · NotificationModel        │
├─────────────────────────────────────────────────┤
│   Domain Actors      SkillManager · Scanner ·   │
│   (actor)            Symlinker · LockFile ·     │
│                      Watcher · Registry ·       │
│                      Updater · Network · …      │
└─────────────────────────────────────────────────┘
         ▲ AsyncStream<DomainEvent>
         │ (替代 Electron 的 EventEmitter + IPC)
```

规则：

- **View**：只读 Model、调用 Model 上的方法，不直接接触 actor。
- **Model**：`@Observable class`，持有对 domain actor 的引用，向 View 提供可观察属性和动作方法；内部用 `Task` 调 actor，把结果写回属性。
- **Actor**：所有副作用（文件系统、网络、Keychain、Process）与可变状态都在 actor 里。彼此之间通过方法调用或 `AsyncStream<DomainEvent>` 协作。
- **事件总线**：`FileWatcherActor` 发 `.fileChanged` → `SkillManagerActor` 订阅后触发重扫 → 通过 `AsyncStream` 广播 `.skillsReloaded` → `SkillsModel` 消费后更新自身属性 → SwiftUI 重渲染。这条路径替代了 Electron 版的 EventEmitter + 4 层 IPC 桥。

### 2.2 为什么是 actor + @Observable（即架构方案 B）

skillpilot 的核心复杂度不在业务规则，而在**并发副作用**：批量扫 11 个 agent 目录、并发拉 GitHub、批量 symlink、Promise.any 式竞速抓取内容、chokidar 监听的并发变更。Swift actor 模型天然为此而生：

- actor 内可变状态线程安全由类型系统保证，不用手写锁。
- `TaskGroup` 实现"8 路并发，首个成功即取消其余"比 `Promise.any` 更自然。
- `@Observable` 宏 + SwiftUI 精细依赖追踪，让数据层对 UI 透明。

替代方案被拒：方案 A（直译 service class）丢弃类型并发检查；方案 C（多 SwiftPM package）对中等体量过度工程。

## 三、数据模型

保持与 Electron 版磁盘数据 100% 兼容。类型层 Swift 化：

```swift
struct Skill: Identifiable, Codable, Hashable {
    let id: SkillIdentity          // 与 TS skill-identity.ts 相同规则
    let name: String
    let path: URL                  // ~/.agents/skills/<name>
    let source: SkillSource        // .github(owner, repo, ref) | .local | .registry
    let frontmatter: SKILLMetadata
    let installedAgents: Set<AgentID>
    let updateStatus: UpdateStatus // .upToDate | .available(remoteHash) | .unknown
}

enum AgentID: String, CaseIterable, Codable {
    case claudeCode, codex, gemini, copilot, opencode,
         antigravity, cursor, kiro, codebuddy, openclaw, trae
}

struct Agent {
    let id: AgentID
    let skillsDir: URL              // ~/.claude/skills 等
    let fallbackChain: [URL]        // 读取优先级链，对应 README 表格
    let isInstalled: Bool           // 二进制检测结果
}

struct LockFile: Codable {          // version = 3，不升级
    let version: Int
    let skills: [LockedSkill]
}
```

关键约束：

- **Skill ID 策略**与 TS 版 `skill-identity.ts` 完全一致，两边 lockfile 互读。
- **SKILL.md frontmatter** 解析用 `Yams`；与 `js-yaml` 语义匹配。
- **磁盘即数据库**：`Skill` 实例是扫描派生态，不引入二级持久化。
- **`@Observable` Model 持有 `[Skill]` 数组**；每次全量重扫后整体替换，SwiftUI 依靠 `Identifiable` 做 diff。

## 四、Domain Actor 映射表

现有 20 个 TS service 全部有归宿：

| 现有 TS service | Skillport 对应 | 类型 | 备注 |
|---|---|---|---|
| `skill-manager.ts` | `SkillManagerActor` | actor | 中心编排；持有其它 actor 引用；对外发 `AsyncStream<DomainEvent>` |
| `skill-scanner.ts` | `SkillScannerActor` | actor | 扫 `~/.agents/skills/` 与 11 个 agent 目录 |
| `skill-md-parser.ts` | `SKILLMdParser` | struct | 纯函数；Yams + swift-markdown |
| `skill-identity.ts` | `SkillIdentity` | struct | 纯函数 |
| `skill-install-service.ts` | `SkillInstallerActor` | actor | GitHub clone / local copy / symlink 编排 |
| `skill-update-service.ts` | `SkillUpdaterActor` | actor | Git tree hash 比对 + pull |
| `skill-registry-service.ts` | `RegistryActor` | actor | skills.sh 列表拉取 / 搜索 / 分类 |
| `skill-content-fetcher.ts` | `SkillContentFetcher` | actor | 三级级联；`TaskGroup` 实现 8 路并发取首成功 |
| `local-skill-importer.ts` | `LocalImporter` | struct | 配合 `SkillInstallerActor` |
| `symlink-manager.ts` | `SymlinkManagerActor` | actor | 原子创建 / 删除 symlink |
| `lock-file-manager.ts` | `LockFileActor` | actor | 原子写 `.tmp` → `FileManager.replaceItemAt`；v3 兼容 |
| `commit-hash-cache.ts` | `CommitHashCache` | actor | JSON 落盘缓存 |
| `file-system-watcher.ts` | `FileWatcherActor` | actor | FSEvents 包成 `AsyncStream<FileEvent>` |
| `agent-detector.ts` | `AgentDetector` | struct | `which` / `Process` 检测二进制 |
| `git-service.ts` | `GitActor` | actor | `Process` 调系统 `git` |
| `keychain-service.ts` | `KeychainActor` | actor | Security.framework 直调，去掉 keytar |
| `network-session-provider.ts` | `NetworkSession` | struct | `URLSession` + 代理配置 |
| `proxy-settings.ts` | `ProxySettingsActor` | actor | UserDefaults 读写 |
| `update-checker.ts` | `BatchUpdateCheckerActor` | actor | `TaskGroup` 控并发度 |
| `app-updater.ts` | `AppUpdaterBridge` | class | 封装 Sparkle 2 `SPUStandardUpdaterController` |

Observable models（对应原来 4 个 Zustand store + 派生 React Query 状态）：

| Zustand store | Skillport model |
|---|---|
| `appStore` | `AppModel` (current view, locale, theme) |
| `notificationStore` | `NotificationModel` |
| `settingsStore` | `SettingsModel` (proxy, language) |
| `updateStore` | `UpdateModel` |
| (新增) | `SkillsModel` 承载 skills / agents 缓存态 |

## 五、视图层

### 5.1 主窗口结构

```
App @main
├── WindowGroup "Skillport"
│   └── RootView
│       └── NavigationSplitView
│           ├── Sidebar                 ← agent 过滤 + 分类
│           └── DetailStack
│               ├── DashboardView       (对应 Dashboard.tsx)
│               ├── RegistryBrowserView (对应 RegistryBrowser.tsx)
│               └── SkillEditorView     (对应 SkillEditorView.tsx)
│
├── Settings { SettingsView }           ← Cmd+,（对应 SettingsModal.tsx，做成原生 Preferences）
│
├── MenuBarExtra "Skillport"            ← 加分项 1
│   └── MenuBarView (迷你 dashboard + 更新徽章)
│
└── DocumentGroup(viewing: SKILLDocument.self) …
    └── QuickLookPreviewView            ← 加分项 2（独立 QL extension target）
```

### 5.2 关键视图

- **DashboardView**：`List` 或 `Table` 展示所有 skill；左 sidebar 做 agent 过滤；每行内嵌原生 toggle 切换该 skill 在每个 agent 的安装状态（触发 `SkillManagerActor.toggleSymlink`）。整个列表加 `.onDrop(of: [.fileURL])` 支持**加分项 3：拖放导入**。

- **RegistryBrowserView**：搜索栏 + 分类筛选 + 结果列表 + 详情面板。详情面板两条渲染分支：
  - 内容以哨兵 `<!-- HTML -->` 开头 → `WKWebView`（SwiftUI 包装），**禁 JS、禁网**，另加白名单 tag/attribute 过滤层（替代 dompurify）。
  - 其它 Markdown → `swift-markdown` 解析 → `AttributedString` 渲染（原生字体、链接、代码块）。

- **SkillEditorView**：左右分栏：
  - 左：`Form` 绑定 frontmatter 字段 + `CodeEditor`（ZeeZide 的 SwiftUI 封装，YAML + Markdown 语法高亮）。
  - 右：实时 Markdown 预览，复用 Registry 的渲染路径。
  - `Cmd+S` 原子写 `SKILL.md`（先写 `.tmp`，`FileManager.replaceItemAt`）。

- **SettingsView**：原生 `Form` + `TabView`，分 General / Network / Updates / About。代理密码字段绑定 `KeychainActor`。

- **MenuBarView**（`MenuBarExtra` 内容）：显示 installed skills 数量、updates available 徽章、"打开主窗口"、"检查更新"按钮。

- **Quick Look 扩展**：独立 App Extension target，处理 `SKILL.md`（文件名匹配），通过共享的 `SKILLMdParser` + `swift-markdown` 渲染到 `NSView`，Finder 中按空格预览直接看到格式化 Markdown。

### 5.3 原生命令

全局 `Commands { }` 注册：
- `Cmd+N` — 从本地目录导入 skill
- `Cmd+R` — 重新扫描
- `Cmd+U` — 检查所有 skill 的更新
- `Cmd+,` — 打开 Settings

## 六、技术选型（依赖清单）

所有依赖通过 SwiftPM 引入：

| 用途 | 选型 | 对应 / 替代 |
|---|---|---|
| YAML | Yams | 替代 `js-yaml` |
| Markdown | swift-markdown (Apple) | 替代 `react-markdown` + `remark-gfm` |
| 代码编辑器 | CodeEditor (ZeeZide) | 新引入，轻量 SwiftUI wrapper |
| 自动更新 | Sparkle 2 | 替代 `electron-updater`；EdDSA 签名 + GitHub Releases 托管 appcast |
| 网络 | URLSession | 替代 `node-fetch` |
| 代理 | `URLSessionConfiguration.connectionProxyDictionary` + SOCKS5 via CFNetwork key | 替代 `https-proxy-agent` / `socks-proxy-agent` |
| Keychain | Security.framework 直调 | 替代 `keytar` |
| 文件监听 | FSEventStreamCreate + AsyncStream 适配 | 替代 `chokidar` |
| Git | 系统 `git` via `Process` | 与现行一致，不引 libgit2 |
| 原子写 | `FileManager.replaceItemAt` | 替代 Node rename |
| i18n | Apple String Catalogs (`.xcstrings`) | 替代 `i18next`；en + zh-Hans |
| HTML 清洗 | 自写白名单过滤器 + WKWebView 沙箱 | 替代 `dompurify` |
| 日志 | swift-log + OSLog | 替代 `electron-log` |
| 压缩 | Foundation + 系统 `unzip` / `tar` via `Process` | 同现行 |

**显式拒绝引入**：Tuist（用 XcodeGen）、Swinject / Resolver（actor 就够）、ComposableArchitecture（过重）、任何第三方响应式框架（`@Observable` + AsyncStream 已覆盖）。

## 七、工程结构与构建

### 7.1 仓库布局

本地路径 `/Users/crazy/own_project/skillport/`（与 `skillpilot/` 平级），远程 `crazygang-ai/skillport`，`git init` 独立历史，不做 fork、不做子模块、不 cherry-pick 历史。Electron 版 `skillpilot` 仓库继续独立存在，两者无 git 关联。

目录结构：

```
skillport/
├── project.yml                       ← XcodeGen 声明
├── Skillport.xcodeproj/              ← 生成物，gitignore
├── Package.resolved
├── App/
│   ├── SkillportApp.swift
│   ├── Views/
│   │   ├── Dashboard/
│   │   ├── Registry/
│   │   ├── Editor/
│   │   ├── Settings/
│   │   └── MenuBar/
│   ├── Models/                       ← @Observable models
│   └── Resources/
│       ├── Assets.xcassets
│       ├── Localizable.xcstrings
│       └── Info.plist
├── Domain/
│   ├── Actors/
│   ├── Types/
│   └── Protocols/
├── QuickLook/
│   ├── PreviewProvider.swift
│   └── Info.plist
├── Tests/
│   ├── SkillportTests/               ← Swift Testing 单元
│   └── SkillportUITests/             ← XCUITest UI
├── Scripts/
│   ├── build.sh
│   ├── notarize.sh
│   ├── release.sh
│   └── generate-appcast.sh
├── build/
│   ├── Skillport.entitlements
│   └── ExportOptions.plist
├── .github/workflows/
│   ├── ci.yml                        ← PR：test + lint
│   └── release.yml                   ← tag：archive + notarize + draft release
├── README.md
├── CLAUDE.md
└── docs/superpowers/specs/           ← 本 spec 与后续 plan
```

### 7.2 Targets

1. `Skillport` (App, macOS 15+, Swift 6, strict concurrency checking)
2. `SkillportQuickLook` (App Extension)
3. `SkillportTests` (Unit Test)
4. `SkillportUITests` (UI Test)

Domain 代码物理上以 `Domain/` 文件夹组织，不单独分 SwiftPM package。QuickLook 扩展只需要少量纯类型（`SKILLMdParser` 等），通过 Xcode Target Membership 勾选复用即可。如果后期共享面扩大，再拆本地 SwiftPM package。

### 7.3 签名与公证

- Developer ID Application 证书（与现行 SkillPilot 一致）。
- Hardened Runtime 启用；entitlements 保持最小集。
- CI 流程：`xcodebuild archive` → `xcodebuild -exportArchive` → `xcrun notarytool submit --wait` → `xcrun stapler staple`。
- 产物同时出 `.dmg`（脚本用 `create-dmg`）与 `.zip`（Sparkle 消费 zip）。

### 7.4 Sparkle 发布链路

- 每次 release tag，CI 产出 `.zip` 和签名后的 `appcast.xml`，上传到 GitHub Releases。
- 主 app `Info.plist` 的 `SUFeedURL` 指向 `https://github.com/crazygang-ai/skillport/releases/latest/download/appcast.xml`。
- 行为与现行 SkillPilot 一致：GitHub Release 为草稿时 Sparkle 不可见；发布后触发。

### 7.5 版本发布

`Scripts/release.sh <patch|minor|major>` 改 `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`，创建 commit、tag、push；其余由 GitHub Actions 完成。

## 八、测试策略

### 8.1 Unit Tests (`SkillportTests`, Swift Testing)

- **纯类型 / 解析器**：`SKILLMdParser`、`SkillIdentity`、HTML 白名单、lockfile 编解码、路径解析——测试主战场。
- **Actor 测试**：`SkillManagerActor`、`SymlinkManagerActor`、`SkillScannerActor` 等，用 `FileManager` + 临时目录（`URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)`）跑**真实文件系统**。不 mock 文件系统——项目原则"文件系统就是数据库"，mock 会掩盖真实行为。
- **网络**：`SkillContentFetcher`、`RegistryActor` 用 `URLProtocol` 子类拦截请求，返回 fixture。
- 覆盖 Electron 版 vitest 测试的每个行为点。不设覆盖率数字目标。

### 8.2 UI Tests (`SkillportUITests`, XCUITest)

对应现行 Playwright E2E 的子集：启动 app → 扫描目录 → 切换 agent → 安装一个 fixture skill → 验证 symlink → 打开编辑器 → 保存 → 验证磁盘。跑打包后的 release build，不 attach debugger。

### 8.3 手工验证清单（每次 release 前）

- **加分项 1** — Finder 拖一个含 SKILL.md 的文件夹进主窗口 → 成功导入并可切换安装。
- **加分项 2** — MenuBarExtra 正确显示 installed 数量与"有更新"徽章。
- **加分项 3** — Finder 选中 SKILL.md 按空格 → Quick Look 原生渲染。
- `skillpilot://` URL scheme 启动流程（parity 必须）。
- Sparkle 真实更新链路：用 test appcast 走一次"发现 → 下载 → 重启"。
- HTTPS 代理 + SOCKS5 代理分别连通性验证。

### 8.4 CI

- **PR**：`xcodebuild test -scheme Skillport` + `swift-format lint`。
- **Tag**：全量 archive + notarize + appcast 生成 + GitHub draft release。

### 8.5 不做

- 不 mock 文件系统；不 mock git；不 mock Keychain。测试替身仅在 URLSession 层。

## 九、数据兼容与并存

### 9.1 磁盘 schema（不变）

- `~/.agents/skills/<name>/` — skill 规范存储
- `~/.agents/.skill-lock.json` — **lockfile v3 严格保持**，不升级
- `~/.agents/.skillpilot-cache.json` — commit hash 缓存，同路径同结构
- 每个 agent 的目录（`~/.claude/skills/` 等）— symlink 指向规范存储，和 Electron 版相同

### 9.2 Bundle 层分离

- Bundle ID：`ai.crazygang.Skillport`（vs Electron 版 `com.skillpilot.app`）
- UserDefaults：独立（language / theme / proxy 配置 UI 偏好各自管）
- Keychain：**service name 共享**（`skillpilot-proxy`），两端都能读；代理密码不用重填
- `~/Library/Logs/Skillport/`、`~/Library/Caches/ai.crazygang.Skillport/`：独立目录
- `skillpilot://` URL scheme：两个 app 都注册，系统让用户选默认处理者；不强占

### 9.3 迁移辅助

首次启动检测 `com.skillpilot.app` 的 UserDefaults → 弹一次"导入 Electron 版设置？"按钮（代理、语言、主题）。读取后写入 Skillport 的 UserDefaults。**不自动迁移**，不触碰对方文件。

### 9.4 共存承诺

- 不自动卸载或修改 Electron 版 SkillPilot。
- 原子写 + `LockFile.version` 校验：读到对方版本的 lockfile 时仍能正常解析并显示。

## 十、错误处理与日志

- `Result`/`throws` 风格错误传递，domain 层定义 `SkillportError` 枚举（带关联值：路径、URL、exit code）。
- 面向用户的错误用本地化字符串，经 `NotificationModel` 浮层展示。
- OSLog 按 subsystem 分：`ai.crazygang.Skillport.scanner`、`.registry`、`.network`、`.sparkle` 等，方便 Console.app 过滤。
- Sparkle 内部错误走它自己的委托回调，再映射到 `UpdateModel`。

## 十一、里程碑

粗粒度阶段（实现计划在下一份文档里拆细）：

1. **脚手架** — XcodeGen 配置、基础 targets、Sparkle/CI/签名链路打通、hello-world 窗口。
2. **Domain 下沉** — 所有 actor（文件 IO / Git / Keychain / 网络）完成 + 单元测试。
3. **数据层** — `@Observable` models + SkillsModel 驱动下的扫描/重扫闭环。
4. **Dashboard + Editor** — 主窗口两个核心视图 + SKILL.md 编辑读写。
5. **RegistryBrowser** — skills.sh 拉取、搜索、详情、两种渲染分支。
6. **加分项 + Settings** — 拖放导入、MenuBarExtra、Quick Look extension、Settings 面板、i18n。
7. **自动更新 + 发布流水线** — Sparkle 跑通、CI tag 触发、首个公开 dmg。
8. **UI test + 手工清单通过** — 达到 release 条件。

## 十二、未决事项

均已在设计阶段敲定，无遗留 TBD。如果后续实现中发现问题，在 plan 文件或 follow-up spec 中单独记录。
