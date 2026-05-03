# Skillport M6 — 加分项 + Settings + i18n 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1–M5 完工的基础上实装 Spec 里程碑 **M6**：Settings 面板（原生 Preferences）+ MenuBarExtra（菜单栏常驻 mini dashboard）+ Quick Look extension（Finder 空格预览 SKILL.md）+ i18n（en + zh-Hans）。结束时 Skillport 就是功能完整的用户版，只差发布流水线（M7）。

**Architecture:** 延续三层 — SwiftUI Views → `@Observable` Models → Domain Actors。M6 新增：
- 1 个 App Extension target：`SkillportPreview`（Quick Look）
- 1 个新 Scene：`MenuBarExtra` 并入主 Scene
- 扩充 `SettingsView` 从占位 `Text` 成为四 tab `Form`
- 扩充 `SettingsModel` 加语言选择 + 自动更新开关
- 新文件：`App/Views/MenuBar/MenuBarContentView.swift` / `App/Views/Settings/SettingsView.swift` 及其 4 个子 tab view / `SkillportPreview/PreviewViewController.swift` 及 `SkillportPreview/SKILLMdParser.swift`（拷贝）
- 资源：`App/Resources/Localizable.xcstrings`（手写 en + zh-Hans）

**Tech Stack:** Swift 6, SwiftUI (macOS 15+), QuickLookUI framework, SwiftUI `MenuBarExtra` scene, Yams（extension 也用）, swift-markdown（extension 也用）。**不新增 SPM 依赖**。

**Parent spec:** `docs/superpowers/specs/2026-05-02-skillport-native-rewrite-design.md`（§5.1 主窗口结构：MenuBarExtra + DocumentGroup/Quick Look；§5.2 SettingsView 四段；§九 数据共存含 Keychain service name 共享）

**Parent plans:**
- M1-M4: `docs/superpowers/plans/2026-05-02-skillport-m1-m4-foundation.md`（已完成）
- M5: `docs/superpowers/plans/2026-05-03-skillport-m5-registry.md`（已完成）

**Working directories:**
- 本 plan 位于 Electron 版 `skillpilot` 仓库的 `docs/superpowers/plans/`
- 所有代码任务在 **`/Users/crazy/own_project/skillport/`** 下执行
- git 命令默认在 `skillport` 仓库运行

**Ground rules for the implementing engineer:**

1. TDD 严格：先写失败测试、跑一次确认失败、再写实现、跑一次确认通过、commit。不跳步。
2. 不 mock 文件系统、git、Keychain。仅 `URLProtocol` 做网络桩。
3. Commit message 用 [Conventional Commits](https://www.conventionalcommits.org/)。
4. **禁止任何 `Co-Authored-By:` trailer**。
5. 每 task 结尾都要 commit。不做"攒大 commit"。
6. 原子写：先写 `.tmp`，再 `FileManager.replaceItemAt`。
7. Swift 6 strict concurrency 必须过（0 error，0 warning）。
8. `swift-format lint --recursive App Domain Tests SkillportPreview` 必须静默。
9. 每次加新源文件要跑 `./Scripts/generate-project.sh`。
10. 新语法先查 Swift 6.0 兼容性（CI 是 canary）。

---

## ADR（开工前要固定的决策）

### ADR-M6-1：Quick Look extension 走"复制 parser 代码"路线

**背景**：QL extension 是独立 App Extension target，独立沙盒进程，不能直接 link Skillport.app 的 `Domain/` 代码。

**M6 实际做法**：
- 在 extension target 的 sources 下创建 `SkillportPreview/SKILLMdParser.swift`、`SKILLMetadata.swift`、`SkillportError.swift` 的副本（仅保留 QL 需要的字段/方法）
- 两个 target 共享同一个 SPM 依赖（Yams, swift-markdown），不共享 Swift 源码
- 主 app 改动 `SKILLMdParser` 时必须同步改 extension 里的副本（`Scripts/check-parser-parity.sh` 脚本做 CI 校验）

**被拒方案**：把 `Domain/` 抽出为独立 SwiftPM package（`SkillportKit`）—— M6 范围内不做，避免动到已绿的 150/150 测试和 project.yml。作为 M7+ backlog。

**取舍后果**：short-term 维护成本（双路同步）换 M6 范围可控。脚本化校验防退化。

### ADR-M6-2：语言切换要求重启 app

**背景**：SwiftUI 的 `Environment(\.locale)` 可以运行时切，但多数字符串通过 `String(localized:)` 读 `Bundle.main`，运行时切换 `AppleLanguages` UserDefaults 要下次启动才生效。自建 Bundle 动态包装是可以做，但复杂且容易踩 SwiftUI cache 坑。

**M6 实际做法**：
- Settings → General tab 下的语言选择写入 `AppleLanguages` UserDefaults
- 提 Toast "Restart required for language change to take effect"
- 下次启动 app 读 UserDefaults 应用

**被拒方案**：热切 locale — 太脆。

### ADR-M6-3：Quick Look UTI 认领整个 Markdown 类别

**背景**：QL 扩展注册 UTI 就对该类型所有文件生效。UTI 声明不支持"仅文件名 = SKILL.md"过滤。

**M6 实际做法**：extension 注册 `net.daringfireball.markdown`，对所有 `.md` 文件都渲染。我们的渲染（swift-markdown + AttributedString）通常比系统默认 Text 好看，是 feature 不是 bug。

**替代方案**：自定义 UTI + 文件名 `SKILL.md` 过滤 — macOS Quick Look 不原生支持，要在扩展内部判断 `lastPathComponent`。实施成本高于收益，不做。

---

## Phase 1 — Settings Panel (Tasks 1–3)

### Task 1: SettingsModel 扩充（autoCheckUpdates + preferredLocale + 持久化）

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Models/SettingsModel.swift`
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/SettingsModelTests.swift`

> 现有 `SettingsModel` 只有 `proxy` + `locale`（硬编码 "en"）。M6 扩充：
> - `autoCheckUpdates: Bool`（写到 `UserDefaults`，default true）
> - `preferredLocale: String`（写到 `UserDefaults`，default "en"；对应 `AppleLanguages` 的首位）
> - `proxyPassword: String`（KeychainActor 读写；account = "proxy"）

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Models/SettingsModelTests.swift`（追加 suite）:

```swift
@MainActor
@Suite("SettingsModel — M6 extensions", .serialized)
struct SettingsModelM6Tests {
    @Test("preferredLocale defaults to 'en' when UserDefaults has nothing")
    func localeDefault() async {
        let defaults = UserDefaults(suiteName: "test-\(UUID())")!
        let model = SettingsModel(
            proxyActor: ProxySettingsActor(suiteName: nil),
            keychain: KeychainActor(service: "skillport-test-\(UUID())"),
            defaults: defaults
        )
        #expect(model.preferredLocale == "en")
    }

    @Test("setPreferredLocale writes AppleLanguages array into UserDefaults")
    func persistLocale() async {
        let suite = "test-\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        let model = SettingsModel(
            proxyActor: ProxySettingsActor(suiteName: nil),
            keychain: KeychainActor(service: "skillport-test-\(UUID())"),
            defaults: defaults
        )
        model.setPreferredLocale("zh-Hans")
        #expect(model.preferredLocale == "zh-Hans")
        let arr = defaults.array(forKey: "AppleLanguages") as? [String] ?? []
        #expect(arr.first == "zh-Hans")
        defaults.removePersistentDomain(forName: suite)
    }

    @Test("autoCheckUpdates default true; toggling persists")
    func autoCheckDefault() async {
        let defaults = UserDefaults(suiteName: "test-\(UUID())")!
        let model = SettingsModel(
            proxyActor: ProxySettingsActor(suiteName: nil),
            keychain: KeychainActor(service: "skillport-test-\(UUID())"),
            defaults: defaults
        )
        #expect(model.autoCheckUpdates == true)
        model.autoCheckUpdates = false
        #expect(defaults.bool(forKey: "autoCheckUpdates") == false)
    }

    @Test("setProxyPassword stores in Keychain; readProxyPassword retrieves")
    func keychainRoundtrip() async throws {
        let svc = "skillport-test-\(UUID())"
        let kc = KeychainActor(service: svc)
        let model = SettingsModel(
            proxyActor: ProxySettingsActor(suiteName: nil),
            keychain: kc,
            defaults: UserDefaults(suiteName: "test-\(UUID())")!
        )
        try await model.setProxyPassword("sekret")
        let read = try await model.readProxyPassword()
        #expect(read == "sekret")
        // cleanup
        try? await kc.delete(account: "proxy")
    }
}
```

> **Note**: `ProxySettingsActor.init(suiteName:)` 存在（M1 已加）。`KeychainActor.delete(account:)` 可能需要补 — 若缺失本 task 顺便加。

- [ ] **Step 2: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | grep -E "error:" | head -10
```

Expected: SettingsModel 不接受 `keychain:` / `defaults:` 参数；`autoCheckUpdates` / `preferredLocale` / `setPreferredLocale` / `setProxyPassword` / `readProxyPassword` 未定义。

- [ ] **Step 3: 实现扩充后的 SettingsModel**

`App/Models/SettingsModel.swift` 整体替换：

```swift
import Foundation
import Observation

@MainActor
@Observable
public final class SettingsModel {
    public var proxy: ProxyConfig = ProxyConfig()
    public var preferredLocale: String
    public var autoCheckUpdates: Bool {
        didSet { defaults.set(autoCheckUpdates, forKey: "autoCheckUpdates") }
    }

    private let proxyActor: ProxySettingsActor
    private let keychain: KeychainActor
    private let defaults: UserDefaults

    public init(
        proxyActor: ProxySettingsActor,
        keychain: KeychainActor = KeychainActor(),
        defaults: UserDefaults = .standard
    ) {
        self.proxyActor = proxyActor
        self.keychain = keychain
        self.defaults = defaults
        if let arr = defaults.array(forKey: "AppleLanguages") as? [String],
           let first = arr.first, !first.isEmpty {
            self.preferredLocale = first
        } else {
            self.preferredLocale = "en"
        }
        if defaults.object(forKey: "autoCheckUpdates") == nil {
            self.autoCheckUpdates = true
            defaults.set(true, forKey: "autoCheckUpdates")
        } else {
            self.autoCheckUpdates = defaults.bool(forKey: "autoCheckUpdates")
        }
        Task { await refresh() }
    }

    public func refresh() async {
        self.proxy = await proxyActor.current
    }

    public func apply(proxy: ProxyConfig) async {
        await proxyActor.save(proxy)
        self.proxy = proxy
    }

    public func setPreferredLocale(_ locale: String) {
        preferredLocale = locale
        var current = defaults.array(forKey: "AppleLanguages") as? [String] ?? []
        current.removeAll { $0 == locale }
        current.insert(locale, at: 0)
        defaults.set(current, forKey: "AppleLanguages")
    }

    public func setProxyPassword(_ password: String) async throws {
        try await keychain.set(account: "proxy", password: password)
    }

    public func readProxyPassword() async throws -> String? {
        try await keychain.read(account: "proxy")
    }

    public func clearProxyPassword() async throws {
        try await keychain.delete(account: "proxy")
    }
}
```

> 若 `KeychainActor.read(account:)` / `delete(account:)` 不存在，先在同 commit 内补上（按 M1 `set` 的写法仿写）。

- [ ] **Step 4: 更新 AppContainer 注入 keychain**

```swift
// App/Composition/AppContainer.swift
self.settingsModel = SettingsModel(
    proxyActor: ProxySettingsActor(),
    keychain: KeychainActor()
)
```

- [ ] **Step 5: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
swift-format lint --recursive App Domain Tests
git add App Domain Tests
git commit -m "feat(model): extend SettingsModel with locale/autoUpdate/keychain password"
```

---

### Task 2: SettingsView 骨架 + 4 个 tab

**Files:**
- Replace: `/Users/crazy/own_project/skillport/App/Views/Settings/SettingsView.swift`（从 `SkillportApp.swift` 内联的 `Text("Settings —")` 抽到独立 view）
- Create: `/Users/crazy/own_project/skillport/App/Views/Settings/GeneralTab.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Settings/NetworkTab.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Settings/UpdatesTab.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Settings/AboutTab.swift`
- Modify: `/Users/crazy/own_project/skillport/App/SkillportApp.swift`（引用新 SettingsView）

- [ ] **Step 1: SettingsView 骨架**

```swift
// App/Views/Settings/SettingsView.swift
import SwiftUI

struct SettingsView: View {
    var body: some View {
        TabView {
            GeneralTab()
                .tabItem { Label(String(localized: "General"), systemImage: "gearshape") }
            NetworkTab()
                .tabItem { Label(String(localized: "Network"), systemImage: "network") }
            UpdatesTab()
                .tabItem { Label(String(localized: "Updates"), systemImage: "arrow.triangle.2.circlepath") }
            AboutTab()
                .tabItem { Label(String(localized: "About"), systemImage: "info.circle") }
        }
        .frame(width: 520, height: 380)
    }
}
```

- [ ] **Step 2: GeneralTab**

```swift
// App/Views/Settings/GeneralTab.swift
import SwiftUI

struct GeneralTab: View {
    @Environment(SettingsModel.self) private var settings
    @Environment(NotificationModel.self) private var notifications

    private let locales: [(String, String)] = [
        ("en", "English"),
        ("zh-Hans", "简体中文"),
    ]

    var body: some View {
        Form {
            Picker(String(localized: "Language"), selection: localeBinding) {
                ForEach(locales, id: \.0) { code, name in
                    Text(name).tag(code)
                }
            }
            Text(String(localized: "Restart required for language change to take effect."))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .padding()
    }

    private var localeBinding: Binding<String> {
        Binding(
            get: { settings.preferredLocale },
            set: { new in
                settings.setPreferredLocale(new)
                notifications.post(.init(
                    level: .info,
                    message: String(localized: "Language changed — please restart Skillport.")))
            }
        )
    }
}
```

- [ ] **Step 3: NetworkTab**

```swift
// App/Views/Settings/NetworkTab.swift
import SwiftUI

struct NetworkTab: View {
    @Environment(SettingsModel.self) private var settings
    @Environment(NotificationModel.self) private var notifications
    @State private var password: String = ""
    @State private var loadedPassword: Bool = false

    var body: some View {
        Form {
            Toggle(String(localized: "Enable proxy"), isOn: proxyEnabledBinding)

            if settings.proxy.enabled {
                Picker(String(localized: "Type"), selection: proxyKindBinding) {
                    Text("HTTPS").tag(ProxyConfig.Kind.https)
                    Text("SOCKS5").tag(ProxyConfig.Kind.socks5)
                }
                TextField(String(localized: "Host"), text: proxyHostBinding)
                TextField(
                    String(localized: "Port"), value: proxyPortBinding,
                    formatter: NumberFormatter()
                )
                TextField(String(localized: "Username (optional)"), text: proxyUsernameBinding)
                SecureField(String(localized: "Password (stored in Keychain)"), text: $password)
                    .onSubmit { Task { await savePassword() } }
                Button(String(localized: "Save password")) {
                    Task { await savePassword() }
                }
            }
        }
        .formStyle(.grouped)
        .padding()
        .task {
            if !loadedPassword {
                loadedPassword = true
                password = (try? await settings.readProxyPassword()) ?? ""
            }
        }
    }

    private func savePassword() async {
        do {
            if password.isEmpty {
                try await settings.clearProxyPassword()
            } else {
                try await settings.setProxyPassword(password)
            }
            notifications.post(.init(
                level: .success, message: String(localized: "Proxy password saved")))
        } catch {
            notifications.post(.init(
                level: .error, message: String(localized: "Failed to save password: \(error)")))
        }
    }

    // MARK: - Bindings — write through settings.apply(proxy:)

    private var proxyEnabledBinding: Binding<Bool> {
        Binding(
            get: { settings.proxy.enabled },
            set: { new in
                var p = settings.proxy
                p.enabled = new
                Task { await settings.apply(proxy: p) }
            }
        )
    }
    private var proxyKindBinding: Binding<ProxyConfig.Kind> {
        Binding(
            get: { settings.proxy.kind },
            set: { new in
                var p = settings.proxy
                p.kind = new
                Task { await settings.apply(proxy: p) }
            }
        )
    }
    private var proxyHostBinding: Binding<String> {
        Binding(
            get: { settings.proxy.host },
            set: { new in
                var p = settings.proxy
                p.host = new
                Task { await settings.apply(proxy: p) }
            }
        )
    }
    private var proxyPortBinding: Binding<Int> {
        Binding(
            get: { settings.proxy.port },
            set: { new in
                var p = settings.proxy
                p.port = new
                Task { await settings.apply(proxy: p) }
            }
        )
    }
    private var proxyUsernameBinding: Binding<String> {
        Binding(
            get: { settings.proxy.username ?? "" },
            set: { new in
                var p = settings.proxy
                p.username = new.isEmpty ? nil : new
                Task { await settings.apply(proxy: p) }
            }
        )
    }
}
```

- [ ] **Step 4: UpdatesTab**

```swift
// App/Views/Settings/UpdatesTab.swift
import SwiftUI

struct UpdatesTab: View {
    @Environment(SettingsModel.self) private var settings
    @Environment(UpdateModel.self) private var update

    var body: some View {
        @Bindable var settings = settings
        Form {
            Toggle(String(localized: "Automatically check for updates"),
                   isOn: $settings.autoCheckUpdates)
            HStack {
                if let last = update.lastCheck {
                    Text(String(localized: "Last checked \(last.formatted())"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text(String(localized: "Never checked for updates"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(String(localized: "Check now")) {
                    Task { await update.checkNow() }
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}
```

- [ ] **Step 5: AboutTab**

```swift
// App/Views/Settings/AboutTab.swift
import SwiftUI

struct AboutTab: View {
    var body: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "cube.box")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
            Text(Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "Skillport")
                .font(.title2).bold()
            Text(versionString).font(.caption).foregroundStyle(.secondary)
            Link(String(localized: "GitHub"),
                 destination: URL(string: "https://github.com/crazygang-ai/skillport")!)
                .font(.caption)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }

    private var versionString: String {
        let marketing = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "v\(marketing) (\(build))"
    }
}
```

- [ ] **Step 6: SkillportApp 引用新 SettingsView**

```swift
// App/SkillportApp.swift 内的 Settings 段
Settings {
    SettingsView()
        .environment(container.settingsModel)
        .environment(container.notificationModel)
        .environment(container.updateModel)
}
```

- [ ] **Step 7: build + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
swift-format lint --recursive App Domain
git add App
git commit -m "feat(view): add Settings panel with General/Network/Updates/About tabs"
```

---

### Task 3: NetworkTab 集成测试（可选 — 基本测 Binding 正确）

**Files:**
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Integration/SettingsFlowTests.swift`

- [ ] **Step 1: 写测试**

```swift
import Foundation
import Testing

@testable import Skillport

@MainActor
@Suite("Settings end-to-end flow", .serialized)
struct SettingsFlowTests {
    @Test("apply(proxy:) round-trips via ProxySettingsActor")
    func proxyRoundtrip() async {
        let suite = "test-\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        let proxyActor = ProxySettingsActor(suiteName: suite)
        let model = SettingsModel(
            proxyActor: proxyActor,
            keychain: KeychainActor(service: "skillport-test-\(UUID())"),
            defaults: defaults
        )
        var p = ProxyConfig()
        p.enabled = true
        p.host = "proxy.example.com"
        p.port = 8080
        p.kind = .https
        await model.apply(proxy: p)
        #expect(model.proxy.enabled)
        #expect(model.proxy.host == "proxy.example.com")
        defaults.removePersistentDomain(forName: suite)
    }
}
```

- [ ] **Step 2: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Tests
git commit -m "test(integration): add settings proxy round-trip test"
```

---

## Phase 2 — MenuBarExtra (Tasks 4–6)

### Task 4: MenuBarExtra scene + 空 content view

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Views/MenuBar/MenuBarContentView.swift`
- Modify: `/Users/crazy/own_project/skillport/App/SkillportApp.swift`（加 MenuBarExtra scene）

- [ ] **Step 1: MenuBarContentView 骨架**

```swift
// App/Views/MenuBar/MenuBarContentView.swift
import SwiftUI

struct MenuBarContentView: View {
    @Environment(SkillsModel.self) private var skills
    @Environment(UpdateModel.self) private var update
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "cube.box").foregroundStyle(.tint)
                Text("Skillport").font(.headline)
                Spacer()
                if update.updateAvailable {
                    Label(String(localized: "Update"), systemImage: "arrow.down.circle.fill")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(.orange)
                        .font(.caption)
                }
            }
            Divider()
            Label(
                String(localized: "\(skills.skills.count) skills installed"),
                systemImage: "list.bullet"
            )
            .font(.caption)

            Divider()
            Button {
                openWindow(id: "main")
            } label: {
                Label(String(localized: "Open Skillport"), systemImage: "arrow.up.right.square")
            }
            .buttonStyle(.plain)

            Button {
                Task { await update.checkNow() }
            } label: {
                Label(String(localized: "Check for updates"), systemImage: "arrow.clockwise")
            }
            .buttonStyle(.plain)

            Divider()
            Button {
                NSApp.terminate(nil)
            } label: {
                Label(String(localized: "Quit Skillport"), systemImage: "power")
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .frame(width: 260)
    }
}
```

- [ ] **Step 2: 在 SkillportApp 加 MenuBarExtra scene**

`App/SkillportApp.swift`：

```swift
@main
struct SkillportApp: App {
    @State private var container = AppContainer()

    var body: some Scene {
        WindowGroup("Skillport", id: "main") {   // 加 id 以便 openWindow(id:)
            RootView()
                .environment(container.appModel)
                // …既有 environment
                .environment(container.registryModel)
                .task {
                    try? await container.skillsModel.refresh()
                    await container.skillsModel.startWatching()
                }
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .windowResizability(.contentSize)
        .commands { /* 既有 */ }

        MenuBarExtra("Skillport", systemImage: "cube.box") {
            MenuBarContentView()
                .environment(container.skillsModel)
                .environment(container.updateModel)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(container.settingsModel)
                .environment(container.notificationModel)
                .environment(container.updateModel)
        }
    }
}
```

- [ ] **Step 3: 补 `UpdateModel.updateAvailable`（若不存在）**

`App/Models/UpdateModel.swift` 检查 — 若只有 `lastCheck` 无 `updateAvailable: Bool`，加一个 `public var updateAvailable: Bool = false`（Sparkle bridge feed URL 为 nil 时永远 false，M7 接 appcast 后才会变 true）。

- [ ] **Step 4: build + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App
git commit -m "feat(view): add MenuBarExtra with mini dashboard"
```

启动 app 看菜单栏是不是出现 Skillport 图标。

---

### Task 5: MenuBar 的 openWindow 交互验证

**Files:**
- Modify: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Integration/MenuBarFlowTests.swift`（新建）

- [ ] **Step 1: 写覆盖最小 XCUI 或 SwiftUI test**

SwiftUI `MenuBarExtra` 没有直接 headless test 方式，M6 手工验证：

手工验证清单：
1. 启动 app → 菜单栏出现 cube.box 图标
2. 点击图标 → 弹出 popover，显示 skill 数
3. 点击 "Open Skillport" → 主窗口被激活
4. 点击 "Check for updates" → UpdateModel 的 checkNow 被调（log 可见）
5. 点击 "Quit Skillport" → app 退出

在 `docs/handoff-2026-05-XX-m6.md` 附本清单验证记录。

- [ ] **Step 2: commit 验证记录**

```bash
git add docs/
git commit -m "docs(m6): record MenuBarExtra manual verification"
```

（本 task 不写单元测试。）

---

### Task 6: Sidebar count & MenuBar badge 同步

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/MenuBar/MenuBarContentView.swift`

加一个 "Updates available: N" 行，从 `SkillsModel` 的 `skills.filter { ... .available }` 派生。

- [ ] **Step 1: 改 MenuBarContentView**

```swift
let updatable = skills.skills.filter {
    if case .available = $0.updateStatus { return true }
    return false
}.count

if updatable > 0 {
    Label(
        String(localized: "\(updatable) skill updates available"),
        systemImage: "arrow.down.circle"
    )
    .font(.caption)
    .foregroundStyle(.orange)
}
```

- [ ] **Step 2: build + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App
git commit -m "feat(view): show per-skill update count in MenuBarExtra"
```

---

## Phase 3 — Quick Look Extension (Tasks 7–10)

### Task 7: 创建 SkillportPreview target

**Files:**
- Modify: `/Users/crazy/own_project/skillport/project.yml`（加 target）
- Create: `/Users/crazy/own_project/skillport/SkillportPreview/Info.plist`
- Create: `/Users/crazy/own_project/skillport/SkillportPreview/SkillportPreview.entitlements`

- [ ] **Step 1: project.yml 加 target**

```yaml
targets:
  # …existing Skillport + SkillportTests
  SkillportPreview:
    type: app-extension
    platform: macOS
    deploymentTarget: "15.0"
    sources:
      - SkillportPreview
    dependencies:
      - package: Yams
      - package: swift-markdown
        product: Markdown
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ai.crazygang.Skillport.Preview
        PRODUCT_NAME: SkillportPreview
        INFOPLIST_FILE: SkillportPreview/Info.plist
        CODE_SIGN_ENTITLEMENTS: SkillportPreview/SkillportPreview.entitlements
        ENABLE_HARDENED_RUNTIME: YES
        MARKETING_VERSION: "0.0.1"
        CURRENT_PROJECT_VERSION: "1"
        SKIP_INSTALL: YES
```

同时让 Skillport 主 target 声明 extension 为依赖：

```yaml
targets:
  Skillport:
    # …
    dependencies:
      - package: Sparkle
      - package: Yams
      - package: CodeEditor
      - package: swift-markdown
        product: Markdown
      - package: SwiftSoup
      - target: SkillportPreview
```

这样 extension 会被 bundle 进 `Skillport.app/Contents/PlugIns/` 供 QL 发现。

- [ ] **Step 2: Info.plist（声明 QL UTI）**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>SkillportPreview</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionAttributes</key>
        <dict>
            <key>QLSupportedContentTypes</key>
            <array>
                <string>net.daringfireball.markdown</string>
            </array>
        </dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.quicklook.preview</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).PreviewViewController</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 3: Entitlements**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-only</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <false/>
</dict>
</plist>
```

- [ ] **Step 4: 先写一个占位 PreviewViewController，验证 target 能编译**

`SkillportPreview/PreviewViewController.swift`:

```swift
import AppKit
import Quartz

class PreviewViewController: NSViewController, QLPreviewingController {
    override var nibName: NSNib.Name? { nil }

    override func loadView() {
        let label = NSTextField(labelWithString: "Skillport Preview — loading...")
        label.frame = NSRect(x: 20, y: 20, width: 400, height: 40)
        let v = NSView(frame: NSRect(x: 0, y: 0, width: 440, height: 80))
        v.addSubview(label)
        self.view = v
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        handler(nil)
    }
}
```

- [ ] **Step 5: 生成 + build**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -10
```

Expected: SkillportPreview target 编过。如果签名问题，检查 `DEVELOPMENT_TEAM` 设置是否继承到 extension target。

- [ ] **Step 6: commit**

```bash
git add SkillportPreview project.yml
git commit -m "chore(extension): scaffold SkillportPreview QL extension target"
```

---

### Task 8: 把 SKILLMdParser 与相依类型复制到 extension

**Files:**
- Create: `/Users/crazy/own_project/skillport/SkillportPreview/SKILLMdParser.swift`
- Create: `/Users/crazy/own_project/skillport/SkillportPreview/SKILLMetadata.swift`
- Create: `/Users/crazy/own_project/skillport/SkillportPreview/SkillportError.swift`
- Create: `/Users/crazy/own_project/skillport/Scripts/check-parser-parity.sh`

> 把主 app 里 `SKILLMdParser` 依赖的最小集合剪刀剪过来。Extension 里不需要 `SkillIdentity` / `Skill` / `LockFile` 等大型类型。

- [ ] **Step 1: 拷贝 + 瘦身**

`SkillportPreview/SKILLMetadata.swift` — 裁剪到 QL 用到的字段：

```swift
import Foundation
import Yams

/// QL extension 用的瘦身版 SKILLMetadata。与主 app 的 `Domain/Types/SKILLMetadata.swift` 保持字段一致。
public struct SKILLMetadata: Sendable, Hashable {
    public let description: String?
    public let version: String?
    public let allowedTools: [String]?

    public init(description: String? = nil, version: String? = nil, allowedTools: [String]? = nil) {
        self.description = description
        self.version = version
        self.allowedTools = allowedTools
    }

    public static func fromYAML(_ yaml: String) throws -> SKILLMetadata {
        guard !yaml.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return SKILLMetadata()
        }
        let node = try Yams.load(yaml: yaml) as? [String: Any] ?? [:]
        return SKILLMetadata(
            description: node["description"] as? String,
            version: node["version"] as? String,
            allowedTools: node["allowedTools"] as? [String]
        )
    }
}
```

`SkillportPreview/SkillportError.swift` — 极简版：

```swift
import Foundation

public enum SkillportError: Error, Sendable {
    case parseFailed(reason: String)
}
```

`SkillportPreview/SKILLMdParser.swift` — 直接照抄 `Domain/Parsers/SKILLMdParser.swift`，把 `SkillportError.parseFailed(file:reason:)` 改为 `SkillportError.parseFailed(reason:)` 以匹配瘦身的 error 类型。

- [ ] **Step 2: Parser parity 校验脚本**

`Scripts/check-parser-parity.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

main_parser="$(pwd)/Domain/Parsers/SKILLMdParser.swift"
ext_parser="$(pwd)/SkillportPreview/SKILLMdParser.swift"

if [ ! -f "$main_parser" ] || [ ! -f "$ext_parser" ]; then
    echo "missing parser file"; exit 1
fi

# 只比核心 parse/serialize 函数体 — 去掉注释、空行、import、error 类型差异
normalize() {
    sed -E '
        s/SkillportError\.parseFailed\(file: nil, reason:/SkillportError.parseFailed(reason:/g;
        /^[[:space:]]*\/\//d;
        /^[[:space:]]*$/d;
        /^import /d;
    ' "$1"
}

if ! diff -u <(normalize "$main_parser") <(normalize "$ext_parser") > /tmp/parser-diff.txt; then
    echo "❌ SKILLMdParser drift detected between main app and SkillportPreview"
    cat /tmp/parser-diff.txt
    exit 1
fi
echo "✅ SKILLMdParser parity OK"
```

chmod +x。

- [ ] **Step 3: 跑一次脚本确认过**

```bash
./Scripts/check-parser-parity.sh
```

- [ ] **Step 4: commit**

```bash
git add SkillportPreview Scripts
git commit -m "feat(extension): copy SKILLMdParser + dependencies into QL extension with parity script"
```

---

### Task 9: PreviewViewController 实装 — parse + render AttributedString

**Files:**
- Modify: `/Users/crazy/own_project/skillport/SkillportPreview/PreviewViewController.swift`
- Create: `/Users/crazy/own_project/skillport/SkillportPreview/MarkdownRenderer.swift`（简化版，独立于主 app）

> Extension 不 link 主 app 的 `RegistryContentRenderer`。复制一个最小 Markdown→AttributedString 渲染器。

- [ ] **Step 1: MarkdownRenderer.swift**

简化版，只处理最常见的 Markdown 元素。代码 50-100 行。可参照主 app `Domain/Services/RegistryContentRenderer.swift` 内的 `renderMarkdown` 私有函数。

- [ ] **Step 2: PreviewViewController 真正实装**

```swift
import AppKit
import Quartz

class PreviewViewController: NSViewController, QLPreviewingController {
    private let scrollView = NSScrollView()
    private let textView = NSTextView()

    override func loadView() {
        let v = NSView(frame: NSRect(x: 0, y: 0, width: 640, height: 480))
        scrollView.frame = v.bounds
        scrollView.autoresizingMask = [.width, .height]
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = false

        textView.frame = scrollView.contentView.bounds
        textView.autoresizingMask = .width
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 20, height: 20)
        textView.font = NSFont.systemFont(ofSize: 13)

        scrollView.documentView = textView
        v.addSubview(scrollView)
        self.view = v
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        do {
            let raw = try String(contentsOf: url, encoding: .utf8)
            let parsed = try? SKILLMdParser.parse(raw)
            let body = parsed?.body ?? raw

            // 如果有 frontmatter description, 在最顶放一个 callout
            var attr = NSMutableAttributedString()
            if let desc = parsed?.metadata.description, !desc.isEmpty {
                let d = NSMutableAttributedString(string: "\(desc)\n\n")
                d.addAttributes([
                    .font: NSFont.systemFont(ofSize: 14, weight: .semibold),
                    .foregroundColor: NSColor.secondaryLabelColor,
                ], range: NSRange(location: 0, length: d.length))
                attr.append(d)
            }
            let rendered = MarkdownRenderer.renderToAttributed(body)
            attr.append(rendered)
            textView.textStorage?.setAttributedString(attr)
            handler(nil)
        } catch {
            let err = NSAttributedString(string: "Failed to preview: \(error)")
            textView.textStorage?.setAttributedString(err)
            handler(error)
        }
    }
}
```

- [ ] **Step 3: build + 手工验证**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
open -a Skillport.app  # 确保 extension 被 registered
# 在 Finder 选一个 ~/.agents/skills/<name>/SKILL.md, 按空格 → 看是否出现我们的渲染
```

- [ ] **Step 4: commit**

```bash
git add SkillportPreview
git commit -m "feat(extension): render SKILL.md via Markdown parser in QL preview"
```

---

### Task 10: Parser parity 加入 CI

**Files:**
- Modify: `/Users/crazy/own_project/skillport/.github/workflows/ci.yml`

- [ ] **Step 1: 加 parity check step**

```yaml
- name: Check parser parity
  run: ./Scripts/check-parser-parity.sh
```

- [ ] **Step 2: commit**

```bash
git add .github/
git commit -m "ci: add SKILLMdParser parity check between main app and preview extension"
```

---

## Phase 4 — i18n (Tasks 11–14)

### Task 11: 把所有硬编码 UI 字符串包上 `String(localized:)`

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Sidebar/SidebarView.swift`（`Label("Dashboard", ...)` → `Label(String(localized: "Dashboard"), ...)`）
- Modify: `/Users/crazy/own_project/skillport/App/Views/Dashboard/DashboardView.swift`（drop hint）
- Modify: `/Users/crazy/own_project/skillport/App/Views/Editor/SkillEditorView.swift`（Back / Save）

> 审计脚本：`grep -rn 'Text("\|Label("\|Button("\|TextField("' App/Views` 看还剩哪些裸字符串。除了变量插值（`"\(skill.installs) installs"`）和调试占位字符串外，全部要包起来。

- [ ] **Step 1: 逐文件替换**

`App/Views/Sidebar/SidebarView.swift`:
```swift
Label(String(localized: "Dashboard"), systemImage: "square.grid.2x2")
Label(String(localized: "Registry"), systemImage: "books.vertical")
Section(String(localized: "Views")) { ... }
Section(String(localized: "Filter by agent")) { ... }
```

`App/Views/Dashboard/DashboardView.swift` 的 drop hint → 包装。

`App/Views/Editor/SkillEditorView.swift` Back / Save → 包装。

- [ ] **Step 2: build + 确认所有 tests 仍然过**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
```

- [ ] **Step 3: commit**

```bash
git add App
git commit -m "refactor(view): wrap all UI strings in String(localized:) for i18n"
```

---

### Task 12: 写 Localizable.xcstrings（en + zh-Hans 全键）

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Resources/Localizable.xcstrings`
- Modify: `/Users/crazy/own_project/skillport/project.yml`（加 `LOCALIZATION_PREFERS_STRING_CATALOGS = YES` 如缺）

> xcstrings 是 JSON 格式，Xcode 15+ 原生支持。手写完整 en + zh-Hans 列表（以下 key 列表根据 M1-M5 和 M6 Phase 1-3 新加字符串总结得出）。

- [ ] **Step 1: 汇总所有 key**

扫一遍：
```bash
grep -rhn 'String(localized: "' App | sed -E 's/.*String\(localized: "([^"]+)".*/\1/' | sort -u > /tmp/i18n-keys.txt
wc -l /tmp/i18n-keys.txt
```

预期 40-60 条。

- [ ] **Step 2: 生成 Localizable.xcstrings**

`App/Resources/Localizable.xcstrings`（示例格式；完整版按 Step 1 的 key 列表填）：

```json
{
  "sourceLanguage": "en",
  "version": "1.0",
  "strings": {
    "Dashboard": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Dashboard"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "仪表盘"}}
      }
    },
    "Registry": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Registry"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "注册表"}}
      }
    },
    "Views": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Views"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "视图"}}
      }
    },
    "Filter by agent": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Filter by agent"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "按 agent 筛选"}}
      }
    },
    "Search skills": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Search skills"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "搜索技能"}}
      }
    },
    "All Time": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "All Time"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "全部"}}
      }
    },
    "Trending": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Trending"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "趋势"}}
      }
    },
    "Hot": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Hot"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "热门"}}
      }
    },
    "Select a skill to see details": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Select a skill to see details"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "选择技能查看详情"}}
      }
    },
    "Install to agents": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Install to agents"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "安装到 agent"}}
      }
    },
    "Install": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Install"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "安装"}}
      }
    },
    "Multi-skill repo — use CLI above": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Multi-skill repo — use CLI above"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "多技能仓库 — 请用上方 CLI 命令"}}
      }
    },
    "Copied install command": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Copied install command"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "已复制安装命令"}}
      }
    },
    "No skills available": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "No skills available"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "暂无技能"}}
      }
    },
    "No results": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "No results"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "无结果"}}
      }
    },
    "Back": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Back"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "返回"}}
      }
    },
    "Save": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Save"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "保存"}}
      }
    },
    "General": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "General"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "通用"}}
      }
    },
    "Network": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Network"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "网络"}}
      }
    },
    "Updates": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Updates"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "更新"}}
      }
    },
    "About": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "About"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "关于"}}
      }
    },
    "Language": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Language"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "语言"}}
      }
    },
    "Restart required for language change to take effect.": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Restart required for language change to take effect."}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "语言更改需重启 Skillport 才会生效。"}}
      }
    },
    "Language changed — please restart Skillport.": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Language changed — please restart Skillport."}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "语言已更改 — 请重启 Skillport。"}}
      }
    },
    "Enable proxy": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Enable proxy"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "启用代理"}}
      }
    },
    "Type": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Type"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "类型"}}
      }
    },
    "Host": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Host"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "主机"}}
      }
    },
    "Port": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Port"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "端口"}}
      }
    },
    "Username (optional)": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Username (optional)"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "用户名（可选）"}}
      }
    },
    "Password (stored in Keychain)": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Password (stored in Keychain)"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "密码（存于 Keychain）"}}
      }
    },
    "Save password": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Save password"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "保存密码"}}
      }
    },
    "Proxy password saved": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Proxy password saved"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "代理密码已保存"}}
      }
    },
    "Automatically check for updates": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Automatically check for updates"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "自动检查更新"}}
      }
    },
    "Check now": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Check now"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "立即检查"}}
      }
    },
    "Never checked for updates": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Never checked for updates"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "尚未检查更新"}}
      }
    },
    "GitHub": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "GitHub"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "GitHub"}}
      }
    },
    "Update": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Update"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "更新"}}
      }
    },
    "Open Skillport": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Open Skillport"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "打开 Skillport"}}
      }
    },
    "Check for updates": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Check for updates"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "检查更新"}}
      }
    },
    "Quit Skillport": {
      "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": "Quit Skillport"}},
        "zh-Hans": {"stringUnit": {"state": "translated", "value": "退出 Skillport"}}
      }
    }
  }
}
```

> 对 `"%lld skills installed"` / `"%lld skill updates available"` 这种 format string，xcstrings 格式是：
> ```json
> "%lld skills installed": {
>   "extractionState": "manual",
>   "localizations": {
>     "en": {"variations": {"plural": {
>       "one": {"stringUnit": {"state": "translated", "value": "%lld skill installed"}},
>       "other": {"stringUnit": {"state": "translated", "value": "%lld skills installed"}}
>     }}},
>     "zh-Hans": {"stringUnit": {"state": "translated", "value": "已安装 %lld 个技能"}}
>   }
> }
> ```

具体 format string key 按 Step 1 的扫描结果填。

- [ ] **Step 3: project.yml 加 resource**

```yaml
targets:
  Skillport:
    resources:
      - App/Resources
      # (App/Resources 是 folder 已包含，无需单列 xcstrings)
```

若 `App/Resources` 已经是 folder resource，`Localizable.xcstrings` 自动被拾起。

- [ ] **Step 4: build + 验证**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
```

启动 app，切到 Settings → Language → 中文，重启，看 UI 是否切到 zh-Hans。

- [ ] **Step 5: commit**

```bash
git add App project.yml
git commit -m "feat(i18n): add Localizable.xcstrings with en + zh-Hans translations"
```

---

### Task 13: i18n 回归测试（确保 key coverage 不退化）

**Files:**
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Logging/LocalizationCoverageTests.swift`

- [ ] **Step 1: 扫描脚本化成单测**

```swift
import Foundation
import Testing

@testable import Skillport

@Suite("Localization coverage")
struct LocalizationCoverageTests {
    @Test("all String(localized:) keys are present in Localizable.xcstrings")
    func coverage() throws {
        let bundle = Bundle(for: InternalMarker.self)
        // TestBundleLocator 直接用即可
        guard let xcstringsURL = TestBundleLocator.bundle.url(
            forResource: "Localizable", withExtension: "xcstrings") else {
            Issue.record("Localizable.xcstrings not present in test bundle; OK to skip if xcstrings is main-bundle only")
            return
        }
        let data = try Data(contentsOf: xcstringsURL)
        let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = decoded?["strings"] as? [String: Any] ?? [:]
        #expect(strings.count > 0)
        // 抽查几个必须存在的
        for key in ["Dashboard", "Registry", "Install", "Save", "General"] {
            #expect(strings[key] != nil, "missing key: \(key)")
        }
    }

    class InternalMarker {}
}
```

> **Note**: 若 Localizable.xcstrings 只在主 app bundle 而不在 test bundle，这个测试只能做 sanity；真正的 coverage 保证靠 Xcode 编译期 extraction。

- [ ] **Step 2: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -5
git add Tests
git commit -m "test(i18n): add xcstrings coverage sanity check"
```

---

### Task 14: 语言切换手工验证记录

- [ ] **Step 1: 手工验证清单**

1. 启 app → 主界面英文
2. Settings → General → Language → 选 `简体中文` → 看 Toast
3. Cmd+Q 退出
4. 重新开 app → 主界面中文
5. Sidebar 显示 "仪表盘 / 注册表"
6. Settings 切回 "English" → 重启 → 恢复英文

记录到 handoff。

---

## Phase 5 — Wrap up (Task 15)

### Task 15: README + handoff + push + CI

**Files:**
- Modify: `/Users/crazy/own_project/skillport/README.md`
- Create: `/Users/crazy/own_project/skillport/docs/handoff-2026-05-XX-m6.md`

- [ ] **Step 1: README Features 段补 3 行**

```markdown
- Native Settings panel (General / Network / Updates / About) with i18n (en + zh-Hans)
- MenuBarExtra常驻菜单栏 mini dashboard
- Quick Look extension native SKILL.md preview in Finder
```

- [ ] **Step 2: 写 handoff**

内容：
- M6 已完工功能列表
- 踩坑备忘（SwiftUI MenuBarExtra 与 openWindow 配合坑、xcstrings 格式坑、extension 签名团队继承坑等）
- 下一步：M7 发布流水线；或 C（多-skill repo）；或 D（render 质量打磨）

- [ ] **Step 3: push + CI**

```bash
git push origin main
gh run watch
```

- [ ] **Step 4: 最终 commit**

```bash
git add README.md docs/
git commit -m "docs: M6 Settings + MenuBar + QL + i18n complete; ready for M7"
git push
```

---

## 总结清单（实施者完工时自查）

- [ ] 15 个 task 全部打勾
- [ ] `xcodebuild test` 全绿（预期 160+ tests）
- [ ] `swift-format lint --recursive App Domain Tests SkillportPreview` 静默
- [ ] Swift 6 strict concurrency 0 error 0 warning
- [ ] `./Scripts/check-parser-parity.sh` ✅
- [ ] CI `gh run watch` 绿
- [ ] Settings 能改代理 + 存密码到 Keychain + 语言切换重启生效
- [ ] MenuBarExtra 图标显示 + 点击弹 popover + skill 数和 update 徽章正确
- [ ] Finder 对 `~/.agents/skills/<name>/SKILL.md` 按空格 → 出现 native preview（含 frontmatter description 高亮）
- [ ] SkillportPreview target bundle 在 `Skillport.app/Contents/PlugIns/` 里
- [ ] Localizable.xcstrings 全 key en + zh-Hans 翻译完整
- [ ] `~/.agents/.skill-lock.json` version 仍为 `3`
- [ ] 无任何 `Co-Authored-By:` trailer

---

## M6 后的 backlog（非 M6 范围）

- M7 — 发布流水线（Developer ID、notarize、Sparkle appcast）
- 多-skill repo App 内 install（ADR-M5-2 欠账）
- Quick Look 扩展支持代码高亮 / table 渲染
- MenuBarExtra 加 "最近 install 的 5 个 skill" 列表
- i18n 加繁体中文 / 日语
- `Domain/` 抽成 SwiftPM package（ADR-M6-1 所避免的重构，未来如果多 target 场景变多值得做）
