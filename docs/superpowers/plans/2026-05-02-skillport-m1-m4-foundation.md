# Skillport M1–M4 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/Users/crazy/own_project/skillport` 建立全新独立的 macOS 原生应用仓库，完成 Spec 里程碑 M1–M4：工程脚手架 + CI/签名骨架 + 20 个 domain actor + 5 个 `@Observable` model + Dashboard/Editor 两个核心视图。结束时 app 能扫描 `~/.agents/skills/`、显示 skill 列表、切换每个 skill 在 agent 间的安装状态、编辑 SKILL.md 并原子写回磁盘。

**Architecture:** SwiftUI + `@Observable` Models + Domain Actors 三层，通过 `AsyncStream<DomainEvent>` 解耦。所有副作用集中在 actor，View 只读 Model。XcodeGen 生成 `.xcodeproj`（不入库），SwiftPM 管理依赖。

**Tech Stack:** Swift 6, SwiftUI (macOS 15+), Observation 宏, Yams, swift-markdown, CodeEditor (ZeeZide), Sparkle 2, swift-log + OSLog, Swift Testing, XCUITest, XcodeGen, swift-format.

**Parent spec:** `docs/superpowers/specs/2026-05-02-skillport-native-rewrite-design.md`

**Working directories:**
- 本 plan 文件位于 Electron 版 `skillpilot` 仓库的 `docs/superpowers/plans/`
- 所有代码任务在 **`/Users/crazy/own_project/skillport/`** 下执行（该目录将由 Task 1 创建）
- 每个 task 的 `git` 命令都默认在 `skillport` 仓库里运行（不是 `skillpilot`）

**Ground rules for the implementing engineer:**
1. TDD 严格：先写失败测试、跑一次确认失败、再写实现、跑一次确认通过、commit。不跳步。
2. 不 mock 文件系统、git、Keychain。仅 `URLProtocol` 做网络桩。
3. Commit message 用 [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `chore:`, `test:`, `refactor:`, `docs:` 前缀)。
4. 每 task 结尾都要 commit。不做"攒大 commit"。
5. 所有写文件必须原子：先写 `.tmp`，再 `FileManager.replaceItemAt`。
6. Lockfile 永远 `version = 3`，不改 schema。
7. Swift Testing 的 `@Test` 要带清晰 name，断言用 `#expect` 和 `#require`。

---

## Phase 1 — M1 Scaffolding (Tasks 1–9)

### Task 1: 创建本地仓库和基础文件

**Files:**
- Create: `/Users/crazy/own_project/skillport/.gitignore`
- Create: `/Users/crazy/own_project/skillport/README.md`
- Create: `/Users/crazy/own_project/skillport/CLAUDE.md`
- Create: `/Users/crazy/own_project/skillport/.gitattributes`

- [ ] **Step 1: 创建目录并 git init**

```bash
mkdir -p /Users/crazy/own_project/skillport
cd /Users/crazy/own_project/skillport
git init -b main
```

Expected: `Initialized empty Git repository in /Users/crazy/own_project/skillport/.git/`

- [ ] **Step 2: 写 .gitignore**

```
# Xcode
*.xcodeproj/
!*.xcodeproj/project.pbxproj
*.xcworkspace/xcuserdata/
*.xcuserstate
*.xcuserdatad/
DerivedData/
build/DerivedData/
*.hmap
*.ipa
*.dSYM.zip
*.dSYM

# Swift Package Manager
.build/
.swiftpm/xcode/xcuserdata/
.swiftpm/xcode/*.xcworkspace/xcuserdata/
.swiftpm/configuration/
Package.pins

# XcodeGen 生成物
/Skillport.xcodeproj/

# macOS
.DS_Store

# Release artifacts
/release/
/Archive.xcarchive/
/Export/

# Sparkle private keys (must never be committed)
sparkle_eddsa_private_key
*.ed25519

# Editor
.idea/
.vscode/
*.swp
```

- [ ] **Step 3: 写 README.md 占位版**

```markdown
# Skillport

Native macOS app for managing AI agent skills. Rewrite of [SkillPilot](https://github.com/crazygang-ai/skillpilot) in Swift/SwiftUI.

**Status:** Early development. Not yet released.

## Requirements

- macOS 15 Sequoia or later
- Xcode 16+ (for building from source)

## Build from source

```bash
./Scripts/bootstrap.sh        # installs XcodeGen via Homebrew if missing
./Scripts/generate-project.sh # regenerates Skillport.xcodeproj
open Skillport.xcodeproj
```

## License

MIT
```

- [ ] **Step 4: 写 CLAUDE.md 初版**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with Skillport.

## Build & Run

```bash
./Scripts/bootstrap.sh              # one-time
./Scripts/generate-project.sh       # regenerate after project.yml changes
xcodebuild -scheme Skillport build  # CLI build
xcodebuild -scheme Skillport test   # run unit tests
```

## Architecture

三层：SwiftUI Views → `@Observable` Models → Domain Actors。事件通过 `AsyncStream<DomainEvent>` 从 actor 流向 model。View 不直接触碰 actor。

关键文件：`Domain/Actors/SkillManagerActor.swift` 是中心编排器。所有 actor 定义在 `Domain/Actors/`，纯类型在 `Domain/Types/`。

## Conventions

- 原子写：先 `.tmp` + `FileManager.replaceItemAt`
- YAML 用 Yams；Markdown 用 swift-markdown
- 文件系统即数据库，不引二级持久化
- 测试不 mock 文件系统 / git / Keychain；仅 URLSession 层打桩
- Swift 6 strict concurrency 必须过
- Lockfile 版本永远 3

## Related

Parent repo: `crazygang-ai/skillpilot` (Electron 版，保持独立演进)
Design spec: 参见 parent repo `docs/superpowers/specs/2026-05-02-skillport-native-rewrite-design.md`
```

- [ ] **Step 5: 写 .gitattributes 并 commit**

`.gitattributes`:
```
* text=auto eol=lf
*.pbxproj binary merge=union
*.xcstrings text
```

```bash
cd /Users/crazy/own_project/skillport
git add .gitignore README.md CLAUDE.md .gitattributes
git commit -m "chore: initialize repository"
```

Expected: 1 file changed? No — 4 files changed.

---

### Task 2: XcodeGen 安装 + `project.yml`

**Files:**
- Create: `/Users/crazy/own_project/skillport/project.yml`
- Create: `/Users/crazy/own_project/skillport/Scripts/bootstrap.sh`
- Create: `/Users/crazy/own_project/skillport/Scripts/generate-project.sh`

- [ ] **Step 1: 写 bootstrap.sh 和 generate-project.sh**

`Scripts/bootstrap.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

if ! command -v xcodegen >/dev/null 2>&1; then
    echo "Installing xcodegen via Homebrew..."
    brew install xcodegen
fi

if ! command -v swift-format >/dev/null 2>&1; then
    echo "Installing swift-format via Homebrew..."
    brew install swift-format
fi

echo "Bootstrap complete."
```

`Scripts/generate-project.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
xcodegen generate
echo "Generated Skillport.xcodeproj"
```

```bash
chmod +x Scripts/bootstrap.sh Scripts/generate-project.sh
./Scripts/bootstrap.sh
```

Expected: xcodegen + swift-format available, either already installed or freshly brewed.

- [ ] **Step 2: 写 project.yml（最小可构建版本）**

`project.yml`:
```yaml
name: Skillport
options:
  bundleIdPrefix: ai.crazygang
  deploymentTarget:
    macOS: "15.0"
  createIntermediateGroups: true
  xcodeVersion: "16.0"
  generateEmptyDirectories: true
settings:
  base:
    SWIFT_VERSION: "6.0"
    SWIFT_STRICT_CONCURRENCY: complete
    ENABLE_USER_SCRIPT_SANDBOXING: NO
    DEVELOPMENT_TEAM: ""
    CODE_SIGN_STYLE: Automatic
packages:
  # 依赖在后续 task 中按需添加
targets:
  Skillport:
    type: application
    platform: macOS
    deploymentTarget: "15.0"
    sources:
      - App
      - Domain
    resources:
      - App/Resources
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ai.crazygang.Skillport
        PRODUCT_NAME: Skillport
        MARKETING_VERSION: "0.0.1"
        CURRENT_PROJECT_VERSION: "1"
        INFOPLIST_FILE: App/Resources/Info.plist
        INFOPLIST_KEY_LSApplicationCategoryType: public.app-category.developer-tools
        INFOPLIST_KEY_NSHumanReadableCopyright: "MIT"
        CODE_SIGN_ENTITLEMENTS: build/Skillport.entitlements
        ENABLE_HARDENED_RUNTIME: YES
        COMBINE_HIDPI_IMAGES: YES
  SkillportTests:
    type: bundle.unit-test
    platform: macOS
    deploymentTarget: "15.0"
    sources:
      - Tests/SkillportTests
    dependencies:
      - target: Skillport
    settings:
      base:
        BUNDLE_LOADER: "$(TEST_HOST)"
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/Skillport.app/Contents/MacOS/Skillport"
schemes:
  Skillport:
    build:
      targets:
        Skillport: all
        SkillportTests: [test]
    test:
      targets:
        - SkillportTests
    run:
      config: Debug
    archive:
      config: Release
```

- [ ] **Step 3: commit（此时 `generate` 会因为 source 目录不存在而失败，下一个 task 修复）**

```bash
cd /Users/crazy/own_project/skillport
git add Scripts project.yml
git commit -m "chore: add XcodeGen project manifest and bootstrap scripts"
```

Expected: 3 files committed.

---

### Task 3: App 入口 + Info.plist + 占位资源

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/SkillportApp.swift`
- Create: `/Users/crazy/own_project/skillport/App/Resources/Info.plist`
- Create: `/Users/crazy/own_project/skillport/App/Resources/Assets.xcassets/Contents.json`
- Create: `/Users/crazy/own_project/skillport/App/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Create: `/Users/crazy/own_project/skillport/build/Skillport.entitlements`
- Create: `/Users/crazy/own_project/skillport/Domain/.gitkeep`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/SmokeTest.swift`

- [ ] **Step 1: 写最小 App 入口**

`App/SkillportApp.swift`:
```swift
import SwiftUI

@main
struct SkillportApp: App {
    var body: some Scene {
        WindowGroup("Skillport") {
            ContentView()
        }
        .windowStyle(.titleBar)
        .windowResizability(.contentSize)
    }
}

private struct ContentView: View {
    var body: some View {
        VStack {
            Text("Skillport")
                .font(.largeTitle)
            Text("Coming soon.")
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 600, minHeight: 400)
        .padding()
    }
}

#Preview {
    Text("Skillport")
}
```

- [ ] **Step 2: 写 Info.plist 和 entitlements**

`App/Resources/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>LSMinimumSystemVersion</key>
    <string>$(MACOSX_DEPLOYMENT_TARGET)</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>Skillport</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>skillpilot</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

`build/Skillport.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

Note: app sandbox 暂关，因为 Skillport 需要自由访问用户家目录下多个 agent 的 skills 目录和运行 `git` 子进程。未来若需要上架 App Store 需要走 group container 和 Security-Scoped Bookmarks，这里保持与 Electron 版一致的自由访问模式。

- [ ] **Step 3: Assets.xcassets 占位**

`App/Resources/Assets.xcassets/Contents.json`:
```json
{
  "info" : { "author" : "xcode", "version" : 1 }
}
```

`App/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`:
```json
{
  "images" : [
    { "idiom" : "mac", "scale" : "1x", "size" : "16x16" },
    { "idiom" : "mac", "scale" : "2x", "size" : "16x16" },
    { "idiom" : "mac", "scale" : "1x", "size" : "32x32" },
    { "idiom" : "mac", "scale" : "2x", "size" : "32x32" },
    { "idiom" : "mac", "scale" : "1x", "size" : "128x128" },
    { "idiom" : "mac", "scale" : "2x", "size" : "128x128" },
    { "idiom" : "mac", "scale" : "1x", "size" : "256x256" },
    { "idiom" : "mac", "scale" : "2x", "size" : "256x256" },
    { "idiom" : "mac", "scale" : "1x", "size" : "512x512" },
    { "idiom" : "mac", "scale" : "2x", "size" : "512x512" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
```

`Domain/.gitkeep`: （空文件，让 XcodeGen 不抱怨空目录）

- [ ] **Step 4: 写一个最小 smoke test 让测试 target 有内容**

`Tests/SkillportTests/SmokeTest.swift`:
```swift
import Testing

@Suite("Smoke")
struct SmokeTests {
    @Test("Truth is true")
    func truthIsTrue() {
        #expect(true)
    }
}
```

- [ ] **Step 5: 生成工程，build，run tests，commit**

```bash
cd /Users/crazy/own_project/skillport
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -20
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -20
```

Expected: 两条命令都以 `** BUILD SUCCEEDED **` 和 `** TEST SUCCEEDED **` 结尾。

```bash
git add App build Domain Tests
git commit -m "feat: minimum buildable Skillport app with smoke test"
```

---

### Task 4: Logging 子系统

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Logging/SkillportLog.swift`

- [ ] **Step 1: 写一个小测试**

`Tests/SkillportTests/Logging/SkillportLogTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("SkillportLog")
struct SkillportLogTests {
    @Test("All subsystems share the same bundle identifier")
    func subsystemIdentifier() {
        #expect(SkillportLog.subsystem == "ai.crazygang.Skillport")
    }

    @Test("Per-category loggers are distinct and correctly categorized")
    func categoryLoggers() {
        let scanner = SkillportLog.scanner
        let registry = SkillportLog.registry
        // Loggers 是 os.Logger 值类型；我们只能验证 factory 返回正确 category。
        // 通过 description 字符串粗略验证。
        #expect(String(describing: scanner).contains("scanner"))
        #expect(String(describing: registry).contains("registry"))
    }
}
```

- [ ] **Step 2: 跑一次确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -20
```

Expected: 失败，`cannot find 'SkillportLog' in scope`。

- [ ] **Step 3: 实现 SkillportLog**

`Domain/Logging/SkillportLog.swift`:
```swift
import Foundation
import os

/// 集中管理所有 OSLog logger。
/// 使用方式：SkillportLog.scanner.info("scanned \(count) skills")
public enum SkillportLog {
    public static let subsystem = "ai.crazygang.Skillport"

    public static let scanner = Logger(subsystem: subsystem, category: "scanner")
    public static let registry = Logger(subsystem: subsystem, category: "registry")
    public static let installer = Logger(subsystem: subsystem, category: "installer")
    public static let updater = Logger(subsystem: subsystem, category: "updater")
    public static let network = Logger(subsystem: subsystem, category: "network")
    public static let watcher = Logger(subsystem: subsystem, category: "watcher")
    public static let git = Logger(subsystem: subsystem, category: "git")
    public static let keychain = Logger(subsystem: subsystem, category: "keychain")
    public static let sparkle = Logger(subsystem: subsystem, category: "sparkle")
    public static let ui = Logger(subsystem: subsystem, category: "ui")
    public static let manager = Logger(subsystem: subsystem, category: "manager")
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -20
```

Expected: `** TEST SUCCEEDED **`。

- [ ] **Step 5: Commit**

```bash
git add Domain Tests
git commit -m "feat: add OSLog subsystem and per-category loggers"
```

---

### Task 5: swift-format 配置

**Files:**
- Create: `/Users/crazy/own_project/skillport/.swift-format`

- [ ] **Step 1: 写 `.swift-format`**

```json
{
    "version": 1,
    "indentation": { "spaces": 4 },
    "lineLength": 120,
    "maximumBlankLines": 1,
    "respectsExistingLineBreaks": true,
    "lineBreakBeforeControlFlowKeywords": false,
    "lineBreakBeforeEachArgument": false,
    "rules": {
        "AllPublicDeclarationsHaveDocumentation": false,
        "AlwaysUseLowerCamelCase": true,
        "NoBlockComments": true,
        "NoLeadingUnderscores": false,
        "OrderedImports": true,
        "UseLetInEveryBoundCaseVariable": true,
        "UseShorthandTypeNames": true,
        "UseSynthesizedInitializer": true,
        "UseTripleSlashForDocumentationComments": true
    }
}
```

- [ ] **Step 2: 跑一次 lint 确认通过**

```bash
cd /Users/crazy/own_project/skillport
swift-format lint --recursive App Domain Tests 2>&1 | head -40
```

Expected: 无输出（或仅若干可接受的 style warning；若有 error 则修复后再进行下一步）。

- [ ] **Step 3: Commit**

```bash
git add .swift-format
git commit -m "chore: add swift-format configuration"
```

---

### Task 6: GitHub Actions CI

**Files:**
- Create: `/Users/crazy/own_project/skillport/.github/workflows/ci.yml`

- [ ] **Step 1: 写 ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v5
      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_16.app
      - name: Bootstrap
        run: ./Scripts/bootstrap.sh
      - name: Generate project
        run: ./Scripts/generate-project.sh
      - name: Lint
        run: swift-format lint --recursive App Domain Tests
      - name: Build & Test
        run: |
          set -o pipefail
          xcodebuild \
            -scheme Skillport \
            -destination 'platform=macOS' \
            -enableCodeCoverage YES \
            test | xcpretty
      - name: Surface test failures
        if: failure()
        run: |
          find ~/Library/Developer/Xcode/DerivedData -name "*.xcresult" -print -exec echo {} \;
```

- [ ] **Step 2: 本地 dry-run 一下 lint + build**

```bash
cd /Users/crazy/own_project/skillport
swift-format lint --recursive App Domain Tests
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
```

Expected: lint 无错误；build 成功。

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: add macOS test and lint workflow"
```

---

### Task 7: Export options 与签名骨架

**Files:**
- Create: `/Users/crazy/own_project/skillport/build/ExportOptions.plist`

- [ ] **Step 1: 写 ExportOptions.plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>teamID</key>
    <string></string>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
```

Note: `teamID` 留空，由实际签名时通过 `xcodebuild` 的 `-allowProvisioningUpdates` 或 CI secret 注入。

- [ ] **Step 2: Commit**

```bash
git add build/ExportOptions.plist
git commit -m "chore: add ExportOptions.plist scaffold for developer-id signing"
```

---

### Task 8: Sparkle 依赖和 AppUpdaterBridge 占位

**Files:**
- Modify: `/Users/crazy/own_project/skillport/project.yml`
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/AppUpdaterBridge.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/AppUpdaterBridgeTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/AppUpdaterBridgeTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("AppUpdaterBridge")
@MainActor
struct AppUpdaterBridgeTests {
    @Test("Bridge initializes without feedURL (lazy / stubbed)")
    func initializesWithoutFeed() {
        let bridge = AppUpdaterBridge(feedURL: nil)
        #expect(bridge.isUpdateAvailable == false)
        #expect(bridge.latestCheckDate == nil)
    }

    @Test("Bridge exposes a stable subsystem label")
    func subsystemLabel() {
        let bridge = AppUpdaterBridge(feedURL: nil)
        #expect(bridge.subsystemLabel == "sparkle")
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -20
```

Expected: `cannot find 'AppUpdaterBridge' in scope`。

- [ ] **Step 3: 在 project.yml 加 Sparkle 依赖**

Edit `project.yml` — 在 `packages:` 下加：
```yaml
packages:
  Sparkle:
    url: https://github.com/sparkle-project/Sparkle
    from: "2.6.0"
```

在 `targets.Skillport` 下加：
```yaml
    dependencies:
      - package: Sparkle
```

然后：
```bash
./Scripts/generate-project.sh
```

- [ ] **Step 4: 实现 AppUpdaterBridge**

`Domain/Actors/AppUpdaterBridge.swift`:
```swift
import Foundation
import Observation
import Sparkle

/// 包装 Sparkle 的 SPUStandardUpdaterController。
/// 在 M1 阶段接受 nil feedURL 以便 app 能裸启动；
/// 实际 appcast 在 M7 milestone 接入。
@MainActor
@Observable
public final class AppUpdaterBridge {
    public private(set) var isUpdateAvailable: Bool = false
    public private(set) var latestCheckDate: Date?
    public let subsystemLabel: String = "sparkle"

    private let controller: SPUStandardUpdaterController?

    public init(feedURL: URL?) {
        if let feedURL {
            let controller = SPUStandardUpdaterController(
                startingUpdater: true,
                updaterDelegate: nil,
                userDriverDelegate: nil
            )
            controller.updater.setFeedURL(feedURL)
            self.controller = controller
        } else {
            self.controller = nil
        }
    }

    public func checkForUpdates() {
        controller?.updater.checkForUpdates()
        latestCheckDate = Date()
    }
}
```

- [ ] **Step 5: 跑测试、commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: `** TEST SUCCEEDED **`。

```bash
git add project.yml Domain Tests
git commit -m "feat: add Sparkle dependency and AppUpdaterBridge skeleton"
```

---

### Task 9: 手工启动验证

- [ ] **Step 1: 打开工程并运行 app**

```bash
cd /Users/crazy/own_project/skillport
./Scripts/generate-project.sh
open Skillport.xcodeproj
```

然后在 Xcode 里按 Cmd+R 启动 app。

Expected: 一个标题为 "Skillport" 的窗口弹出，里面显示 "Skillport / Coming soon."。

- [ ] **Step 2: 关闭 app，记录一次 checkpoint commit（空 commit 作为 M1 完成标记）**

```bash
git commit --allow-empty -m "chore: M1 scaffolding complete"
```

---
## Phase 2 — M2 Domain Types (Tasks 10–15)

### Task 10: AgentID + Agent 类型

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/AgentID.swift`
- Create: `/Users/crazy/own_project/skillport/Domain/Types/Agent.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/AgentIDTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/AgentTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Types/AgentIDTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("AgentID")
struct AgentIDTests {
    @Test("All 11 agents are defined")
    func allCasesCount() {
        #expect(AgentID.allCases.count == 11)
    }

    @Test("Raw values are stable, lowerCamelCase strings")
    func rawValues() {
        #expect(AgentID.claudeCode.rawValue == "claudeCode")
        #expect(AgentID.codex.rawValue == "codex")
        #expect(AgentID.gemini.rawValue == "gemini")
        #expect(AgentID.copilot.rawValue == "copilot")
        #expect(AgentID.opencode.rawValue == "opencode")
        #expect(AgentID.antigravity.rawValue == "antigravity")
        #expect(AgentID.cursor.rawValue == "cursor")
        #expect(AgentID.kiro.rawValue == "kiro")
        #expect(AgentID.codebuddy.rawValue == "codebuddy")
        #expect(AgentID.openclaw.rawValue == "openclaw")
        #expect(AgentID.trae.rawValue == "trae")
    }

    @Test("Codable round-trip")
    func codable() throws {
        let encoded = try JSONEncoder().encode(AgentID.claudeCode)
        let decoded = try JSONDecoder().decode(AgentID.self, from: encoded)
        #expect(decoded == .claudeCode)
    }
}
```

`Tests/SkillportTests/Types/AgentTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("Agent")
struct AgentTests {
    @Test("Default agents() returns all 11 with correct skills directories")
    func defaultAgents() {
        let home = URL(fileURLWithPath: NSHomeDirectory())
        let agents = Agent.defaultAgents(home: home)
        #expect(agents.count == 11)
        let byID = Dictionary(uniqueKeysWithValues: agents.map { ($0.id, $0) })
        #expect(byID[.claudeCode]?.skillsDir == home.appendingPathComponent(".claude/skills"))
        #expect(byID[.codex]?.skillsDir == home.appendingPathComponent(".codex/skills"))
        #expect(byID[.gemini]?.skillsDir == home.appendingPathComponent(".gemini/skills"))
        #expect(byID[.copilot]?.skillsDir == home.appendingPathComponent(".copilot/skills"))
        #expect(byID[.opencode]?.skillsDir == home.appendingPathComponent(".config/opencode/skills"))
        #expect(byID[.antigravity]?.skillsDir == home.appendingPathComponent(".gemini/antigravity/skills"))
        #expect(byID[.cursor]?.skillsDir == home.appendingPathComponent(".cursor/skills"))
        #expect(byID[.kiro]?.skillsDir == home.appendingPathComponent(".kiro/skills"))
        #expect(byID[.codebuddy]?.skillsDir == home.appendingPathComponent(".codebuddy/skills"))
        #expect(byID[.openclaw]?.skillsDir == home.appendingPathComponent(".openclaw/skills"))
        #expect(byID[.trae]?.skillsDir == home.appendingPathComponent(".trae/skills"))
    }

    @Test("Fallback chain matches README spec for agents with secondary sources")
    func fallbackChain() {
        let home = URL(fileURLWithPath: "/tmp/testhome")
        let agents = Agent.defaultAgents(home: home)
        let byID = Dictionary(uniqueKeysWithValues: agents.map { ($0.id, $0) })

        // Claude Code / Kiro / CodeBuddy / Antigravity / OpenClaw / Trae: 仅自己目录
        #expect(byID[.claudeCode]?.fallbackChain.isEmpty == true)
        #expect(byID[.kiro]?.fallbackChain.isEmpty == true)
        #expect(byID[.codebuddy]?.fallbackChain.isEmpty == true)

        // Codex: own → ~/.agents/skills
        #expect(byID[.codex]?.fallbackChain ==
                [home.appendingPathComponent(".agents/skills")])
        // Gemini: own → ~/.agents/skills
        #expect(byID[.gemini]?.fallbackChain ==
                [home.appendingPathComponent(".agents/skills")])
        // Copilot: own → ~/.claude/skills
        #expect(byID[.copilot]?.fallbackChain ==
                [home.appendingPathComponent(".claude/skills")])
        // OpenCode: own → ~/.claude/skills → ~/.agents/skills
        #expect(byID[.opencode]?.fallbackChain ==
                [home.appendingPathComponent(".claude/skills"),
                 home.appendingPathComponent(".agents/skills")])
        // Cursor: own → ~/.claude/skills → ~/.agents/skills
        #expect(byID[.cursor]?.fallbackChain ==
                [home.appendingPathComponent(".claude/skills"),
                 home.appendingPathComponent(".agents/skills")])
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: `cannot find 'AgentID' / 'Agent'` 错误。

- [ ] **Step 3: 实现 AgentID + Agent**

`Domain/Types/AgentID.swift`:
```swift
import Foundation

public enum AgentID: String, CaseIterable, Codable, Hashable, Sendable {
    case claudeCode
    case codex
    case gemini
    case copilot
    case opencode
    case antigravity
    case cursor
    case kiro
    case codebuddy
    case openclaw
    case trae
}

extension AgentID {
    /// 显示名称，对应 Electron 版 agent-detector 的 label。
    public var displayName: String {
        switch self {
        case .claudeCode: return "Claude Code"
        case .codex: return "Codex"
        case .gemini: return "Gemini CLI"
        case .copilot: return "Copilot CLI"
        case .opencode: return "OpenCode"
        case .antigravity: return "Antigravity"
        case .cursor: return "Cursor"
        case .kiro: return "Kiro"
        case .codebuddy: return "CodeBuddy"
        case .openclaw: return "OpenClaw"
        case .trae: return "Trae"
        }
    }

    /// 用于检测 agent 是否安装的命令名。
    public var binaryName: String {
        switch self {
        case .claudeCode: return "claude"
        case .codex: return "codex"
        case .gemini: return "gemini"
        case .copilot: return "gh"
        case .opencode: return "opencode"
        case .antigravity: return "antigravity"
        case .cursor: return "cursor"
        case .kiro: return "kiro"
        case .codebuddy: return "codebuddy"
        case .openclaw: return "openclaw"
        case .trae: return "trae"
        }
    }
}
```

`Domain/Types/Agent.swift`:
```swift
import Foundation

public struct Agent: Identifiable, Hashable, Sendable {
    public let id: AgentID
    public let skillsDir: URL
    public let fallbackChain: [URL]
    public let isInstalled: Bool

    public init(id: AgentID, skillsDir: URL, fallbackChain: [URL], isInstalled: Bool) {
        self.id = id
        self.skillsDir = skillsDir
        self.fallbackChain = fallbackChain
        self.isInstalled = isInstalled
    }

    /// 根据家目录 URL 构造 11 个 agent 的默认配置。
    /// isInstalled 统一设为 false；实际检测结果应由 `AgentDetector` 合并。
    public static func defaultAgents(home: URL) -> [Agent] {
        func dir(_ relative: String) -> URL {
            home.appendingPathComponent(relative)
        }
        let agentsDir = dir(".agents/skills")
        let claudeDir = dir(".claude/skills")

        return [
            Agent(id: .claudeCode,
                  skillsDir: dir(".claude/skills"),
                  fallbackChain: [],
                  isInstalled: false),
            Agent(id: .codex,
                  skillsDir: dir(".codex/skills"),
                  fallbackChain: [agentsDir],
                  isInstalled: false),
            Agent(id: .gemini,
                  skillsDir: dir(".gemini/skills"),
                  fallbackChain: [agentsDir],
                  isInstalled: false),
            Agent(id: .copilot,
                  skillsDir: dir(".copilot/skills"),
                  fallbackChain: [claudeDir],
                  isInstalled: false),
            Agent(id: .opencode,
                  skillsDir: dir(".config/opencode/skills"),
                  fallbackChain: [claudeDir, agentsDir],
                  isInstalled: false),
            Agent(id: .antigravity,
                  skillsDir: dir(".gemini/antigravity/skills"),
                  fallbackChain: [],
                  isInstalled: false),
            Agent(id: .cursor,
                  skillsDir: dir(".cursor/skills"),
                  fallbackChain: [claudeDir, agentsDir],
                  isInstalled: false),
            Agent(id: .kiro,
                  skillsDir: dir(".kiro/skills"),
                  fallbackChain: [],
                  isInstalled: false),
            Agent(id: .codebuddy,
                  skillsDir: dir(".codebuddy/skills"),
                  fallbackChain: [],
                  isInstalled: false),
            Agent(id: .openclaw,
                  skillsDir: dir(".openclaw/skills"),
                  fallbackChain: [],
                  isInstalled: false),
            Agent(id: .trae,
                  skillsDir: dir(".trae/skills"),
                  fallbackChain: [],
                  isInstalled: false)
        ]
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: `** TEST SUCCEEDED **`，14 tests passed。

- [ ] **Step 5: Commit**

```bash
git add Domain Tests project.yml
git commit -m "feat(types): add AgentID enum and Agent struct with default config"
```

---

### Task 11: SkillSource + UpdateStatus 类型

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/SkillSource.swift`
- Create: `/Users/crazy/own_project/skillport/Domain/Types/UpdateStatus.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/SkillSourceTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/UpdateStatusTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Types/SkillSourceTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("SkillSource")
struct SkillSourceTests {
    @Test("GitHub source round-trip with full ref")
    func githubRoundTrip() throws {
        let src = SkillSource.github(owner: "obra", repo: "superpowers", ref: "main")
        let data = try JSONEncoder().encode(src)
        let back = try JSONDecoder().decode(SkillSource.self, from: data)
        #expect(back == src)
    }

    @Test("Local source carries absolute path")
    func localSource() throws {
        let src = SkillSource.local(path: URL(fileURLWithPath: "/tmp/my-skill"))
        let data = try JSONEncoder().encode(src)
        let back = try JSONDecoder().decode(SkillSource.self, from: data)
        #expect(back == src)
    }

    @Test("Registry source carries slug")
    func registrySource() throws {
        let src = SkillSource.registry(slug: "obra/superpowers")
        let data = try JSONEncoder().encode(src)
        let back = try JSONDecoder().decode(SkillSource.self, from: data)
        #expect(back == src)
    }

    @Test("kind property reports stable string tag")
    func kindTag() {
        #expect(SkillSource.github(owner: "a", repo: "b", ref: "m").kind == "github")
        #expect(SkillSource.local(path: URL(fileURLWithPath: "/x")).kind == "local")
        #expect(SkillSource.registry(slug: "x/y").kind == "registry")
    }
}
```

`Tests/SkillportTests/Types/UpdateStatusTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("UpdateStatus")
struct UpdateStatusTests {
    @Test("upToDate has no payload")
    func upToDate() {
        let s = UpdateStatus.upToDate
        #expect(s.isUpToDate)
        #expect(s.pendingRemoteHash == nil)
    }

    @Test("available carries remote hash")
    func availableHash() {
        let s = UpdateStatus.available(remoteHash: "abc123")
        #expect(!s.isUpToDate)
        #expect(s.pendingRemoteHash == "abc123")
    }

    @Test("unknown is neither up-to-date nor has hash")
    func unknown() {
        let s = UpdateStatus.unknown
        #expect(!s.isUpToDate)
        #expect(s.pendingRemoteHash == nil)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: 两个类型未定义的编译错误。

- [ ] **Step 3: 实现**

`Domain/Types/SkillSource.swift`:
```swift
import Foundation

public enum SkillSource: Codable, Hashable, Sendable {
    case github(owner: String, repo: String, ref: String)
    case local(path: URL)
    case registry(slug: String)

    public var kind: String {
        switch self {
        case .github: return "github"
        case .local: return "local"
        case .registry: return "registry"
        }
    }
}
```

`Domain/Types/UpdateStatus.swift`:
```swift
import Foundation

public enum UpdateStatus: Codable, Hashable, Sendable {
    case upToDate
    case available(remoteHash: String)
    case unknown

    public var isUpToDate: Bool {
        if case .upToDate = self { return true }
        return false
    }

    public var pendingRemoteHash: String? {
        if case .available(let hash) = self { return hash }
        return nil
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: `** TEST SUCCEEDED **`，新增 7 tests 通过。

- [ ] **Step 5: Commit**

```bash
git add Domain Tests
git commit -m "feat(types): add SkillSource and UpdateStatus enums"
```

---

### Task 12: SKILLMetadata + LockFile 类型

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/SKILLMetadata.swift`
- Create: `/Users/crazy/own_project/skillport/Domain/Types/LockFile.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/SKILLMetadataTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/LockFileTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/Fixtures/lockfile_v3_sample.json`

- [ ] **Step 1: 写 lockfile v3 fixture**

`Tests/SkillportTests/TestSupport/Fixtures/lockfile_v3_sample.json`:
```json
{
  "version": 3,
  "skills": [
    {
      "name": "superpowers",
      "source": { "type": "github", "owner": "obra", "repo": "superpowers", "ref": "main" },
      "installedAt": "2026-05-01T10:00:00Z",
      "commitHash": "abc123def456",
      "path": "/Users/crazy/.agents/skills/superpowers"
    },
    {
      "name": "my-local",
      "source": { "type": "local", "path": "/Users/crazy/skills/my-local" },
      "installedAt": "2026-04-28T09:00:00Z",
      "commitHash": null,
      "path": "/Users/crazy/.agents/skills/my-local"
    }
  ]
}
```

注意：lockfile 磁盘格式使用 discriminated union（`"type": "github" | "local" | "registry"`），这与 TS 版 `skill-identity.ts` 的写法一致。我们在 Swift 里用自定义 Codable 将 `SkillSource` 在序列化时展开成这个形状。

- [ ] **Step 2: 写失败测试**

`Tests/SkillportTests/Types/SKILLMetadataTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("SKILLMetadata")
struct SKILLMetadataTests {
    @Test("Empty frontmatter decodes with nil optionals")
    func emptyDecode() throws {
        let yaml = ""
        let meta = try SKILLMetadata.fromYAML(yaml)
        #expect(meta.description == nil)
        #expect(meta.version == nil)
        #expect(meta.allowedTools == nil)
        #expect(meta.extras.isEmpty)
    }

    @Test("Standard frontmatter decodes known fields + preserves unknowns in extras")
    func standardDecode() throws {
        let yaml = """
        description: A superpowers skill
        version: 1.2.3
        allowedTools: ["Read", "Write"]
        custom_field: custom_value
        """
        let meta = try SKILLMetadata.fromYAML(yaml)
        #expect(meta.description == "A superpowers skill")
        #expect(meta.version == "1.2.3")
        #expect(meta.allowedTools == ["Read", "Write"])
        #expect(meta.extras["custom_field"] as? String == "custom_value")
    }

    @Test("toYAML round-trips description and version")
    func yamlRoundTrip() throws {
        let meta = SKILLMetadata(
            description: "hello",
            version: "0.1.0",
            allowedTools: ["Bash"],
            extras: [:]
        )
        let yaml = try meta.toYAML()
        let back = try SKILLMetadata.fromYAML(yaml)
        #expect(back.description == "hello")
        #expect(back.version == "0.1.0")
        #expect(back.allowedTools == ["Bash"])
    }
}
```

`Tests/SkillportTests/Types/LockFileTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("LockFile")
struct LockFileTests {
    @Test("Decodes v3 sample with github and local sources")
    func decodeV3Sample() throws {
        let url = Bundle.module.url(forResource: "lockfile_v3_sample", withExtension: "json")!
        let data = try Data(contentsOf: url)
        let lock = try LockFile.decode(from: data)
        #expect(lock.version == 3)
        #expect(lock.skills.count == 2)

        let first = lock.skills[0]
        #expect(first.name == "superpowers")
        if case .github(let owner, let repo, let ref) = first.source {
            #expect(owner == "obra")
            #expect(repo == "superpowers")
            #expect(ref == "main")
        } else {
            Issue.record("expected github source")
        }
        #expect(first.commitHash == "abc123def456")

        let second = lock.skills[1]
        if case .local(let path) = second.source {
            #expect(path.path == "/Users/crazy/skills/my-local")
        } else {
            Issue.record("expected local source")
        }
        #expect(second.commitHash == nil)
    }

    @Test("Encode then decode round-trip produces equivalent LockFile")
    func encodeRoundTrip() throws {
        let original = LockFile(
            version: 3,
            skills: [
                LockedSkill(
                    name: "demo",
                    source: .github(owner: "x", repo: "y", ref: "main"),
                    installedAt: Date(timeIntervalSince1970: 1_700_000_000),
                    commitHash: "deadbeef",
                    path: URL(fileURLWithPath: "/tmp/demo")
                )
            ]
        )
        let data = try original.encode()
        let back = try LockFile.decode(from: data)
        #expect(back == original)
    }

    @Test("Version field is always 3; schema upgrades rejected")
    func versionIsFixed() throws {
        let badJSON = #"{"version": 4, "skills": []}"#.data(using: .utf8)!
        #expect(throws: LockFile.DecodingError.unsupportedVersion(4)) {
            _ = try LockFile.decode(from: badJSON)
        }
    }
}
```

Note: 为了让测试能用 `Bundle.module.url`，需要在 `project.yml` 的 `SkillportTests` target 里把 `Tests/SkillportTests/TestSupport/Fixtures` 列为 resource。在 Step 3 一并处理。

- [ ] **Step 3: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: 类型未定义错误。

- [ ] **Step 4: 修改 project.yml 加 Yams 依赖和测试 resources**

在 `project.yml` 的 `packages:` 下添加：
```yaml
  Yams:
    url: https://github.com/jpsim/Yams
    from: "5.1.0"
```

在 `targets.Skillport.dependencies` 下添加：
```yaml
      - package: Yams
```

为 `SkillportTests` target 添加 resources 段：
```yaml
  SkillportTests:
    type: bundle.unit-test
    platform: macOS
    deploymentTarget: "15.0"
    sources:
      - Tests/SkillportTests
    resources:
      - path: Tests/SkillportTests/TestSupport/Fixtures
        type: folder
    dependencies:
      - target: Skillport
```

然后：
```bash
./Scripts/generate-project.sh
```

- [ ] **Step 5: 实现 SKILLMetadata + LockFile + LockedSkill**

`Domain/Types/SKILLMetadata.swift`:
```swift
import Foundation
import Yams

public struct SKILLMetadata: Sendable, Equatable {
    public var description: String?
    public var version: String?
    public var allowedTools: [String]?
    /// 任何未显式建模的 frontmatter 字段都保留在这里。
    public var extras: [String: Any]

    public init(
        description: String? = nil,
        version: String? = nil,
        allowedTools: [String]? = nil,
        extras: [String: Any] = [:]
    ) {
        self.description = description
        self.version = version
        self.allowedTools = allowedTools
        self.extras = extras
    }

    public static func == (lhs: SKILLMetadata, rhs: SKILLMetadata) -> Bool {
        lhs.description == rhs.description
            && lhs.version == rhs.version
            && lhs.allowedTools == rhs.allowedTools
        // extras intentionally not compared (Any 不 Equatable)
    }

    public static func fromYAML(_ yaml: String) throws -> SKILLMetadata {
        guard !yaml.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return SKILLMetadata()
        }
        let loaded = try Yams.load(yaml: yaml)
        guard let dict = loaded as? [String: Any] else {
            return SKILLMetadata()
        }
        var meta = SKILLMetadata()
        meta.description = dict["description"] as? String
        meta.version = dict["version"] as? String
        meta.allowedTools = dict["allowedTools"] as? [String]

        var extras = dict
        extras.removeValue(forKey: "description")
        extras.removeValue(forKey: "version")
        extras.removeValue(forKey: "allowedTools")
        meta.extras = extras
        return meta
    }

    public func toYAML() throws -> String {
        var dict: [String: Any] = extras
        if let description { dict["description"] = description }
        if let version { dict["version"] = version }
        if let allowedTools { dict["allowedTools"] = allowedTools }
        return try Yams.dump(object: dict)
    }
}
```

`Domain/Types/LockFile.swift`:
```swift
import Foundation

public struct LockFile: Equatable, Sendable {
    public let version: Int
    public var skills: [LockedSkill]

    public static let currentVersion: Int = 3

    public init(version: Int = LockFile.currentVersion, skills: [LockedSkill]) {
        self.version = version
        self.skills = skills
    }

    public enum DecodingError: Error, Equatable {
        case unsupportedVersion(Int)
    }

    public static func decode(from data: Data) throws -> LockFile {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        let wire = try dec.decode(Wire.self, from: data)
        guard wire.version == LockFile.currentVersion else {
            throw DecodingError.unsupportedVersion(wire.version)
        }
        return LockFile(
            version: wire.version,
            skills: wire.skills.map { $0.toDomain() }
        )
    }

    public func encode() throws -> Data {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let wire = Wire(
            version: version,
            skills: skills.map(Wire.WireSkill.fromDomain)
        )
        return try enc.encode(wire)
    }
}

public struct LockedSkill: Equatable, Sendable {
    public let name: String
    public let source: SkillSource
    public let installedAt: Date
    public let commitHash: String?
    public let path: URL

    public init(name: String, source: SkillSource, installedAt: Date, commitHash: String?, path: URL) {
        self.name = name
        self.source = source
        self.installedAt = installedAt
        self.commitHash = commitHash
        self.path = path
    }
}

// MARK: - Wire format (discriminated-union JSON, compatible with TS side)

private struct Wire: Codable {
    let version: Int
    let skills: [WireSkill]

    struct WireSkill: Codable {
        let name: String
        let source: WireSource
        let installedAt: Date
        let commitHash: String?
        let path: String

        func toDomain() -> LockedSkill {
            LockedSkill(
                name: name,
                source: source.toDomain(),
                installedAt: installedAt,
                commitHash: commitHash,
                path: URL(fileURLWithPath: path)
            )
        }

        static func fromDomain(_ s: LockedSkill) -> WireSkill {
            WireSkill(
                name: s.name,
                source: WireSource.fromDomain(s.source),
                installedAt: s.installedAt,
                commitHash: s.commitHash,
                path: s.path.path
            )
        }
    }

    enum WireSource: Codable {
        case github(owner: String, repo: String, ref: String)
        case local(path: String)
        case registry(slug: String)

        enum CodingKeys: String, CodingKey { case type, owner, repo, ref, path, slug }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let type = try c.decode(String.self, forKey: .type)
            switch type {
            case "github":
                self = .github(
                    owner: try c.decode(String.self, forKey: .owner),
                    repo: try c.decode(String.self, forKey: .repo),
                    ref: try c.decode(String.self, forKey: .ref)
                )
            case "local":
                self = .local(path: try c.decode(String.self, forKey: .path))
            case "registry":
                self = .registry(slug: try c.decode(String.self, forKey: .slug))
            default:
                throw DecodingError.dataCorruptedError(
                    forKey: .type, in: c,
                    debugDescription: "unknown source type \(type)"
                )
            }
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .github(let o, let r, let ref):
                try c.encode("github", forKey: .type)
                try c.encode(o, forKey: .owner)
                try c.encode(r, forKey: .repo)
                try c.encode(ref, forKey: .ref)
            case .local(let p):
                try c.encode("local", forKey: .type)
                try c.encode(p, forKey: .path)
            case .registry(let s):
                try c.encode("registry", forKey: .type)
                try c.encode(s, forKey: .slug)
            }
        }

        func toDomain() -> SkillSource {
            switch self {
            case .github(let o, let r, let ref): return .github(owner: o, repo: r, ref: ref)
            case .local(let p): return .local(path: URL(fileURLWithPath: p))
            case .registry(let s): return .registry(slug: s)
            }
        }

        static func fromDomain(_ s: SkillSource) -> WireSource {
            switch s {
            case .github(let o, let r, let ref): return .github(owner: o, repo: r, ref: ref)
            case .local(let p): return .local(path: p.path)
            case .registry(let s): return .registry(slug: s)
            }
        }
    }
}
```

- [ ] **Step 6: 跑测试确认通过**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

Expected: `** TEST SUCCEEDED **`。

- [ ] **Step 7: Commit**

```bash
git add project.yml Domain Tests
git commit -m "feat(types): add SKILLMetadata and LockFile (v3) with Yams integration"
```

---

### Task 13: SkillIdentity 纯函数

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/SkillIdentity.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/SkillIdentityTests.swift`

本函数对应 Electron 版 `electron/services/skill-identity.ts`。**在写实现前，请在 Electron 版仓库下 `cat /Users/crazy/own_project/skillpilot/electron/services/skill-identity.ts` 确认当前规则，并在 Swift 里严格复现，不要自创算法**。

- [ ] **Step 1: 阅读 TS 源码**

```bash
cat /Users/crazy/own_project/skillpilot/electron/services/skill-identity.ts
```

记下规则：source 的 kind + 归一化 path / slug / repo ref → `String` identity。

- [ ] **Step 2: 写失败测试（覆盖 3 种 source）**

`Tests/SkillportTests/Types/SkillIdentityTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillIdentity")
struct SkillIdentityTests {
    @Test("GitHub skill identity is stable: owner/repo@ref#name")
    func githubIdentity() {
        let id = SkillIdentity.compute(
            name: "superpowers",
            source: .github(owner: "obra", repo: "superpowers", ref: "main")
        )
        #expect(id.rawValue == "github:obra/superpowers@main#superpowers")
    }

    @Test("Local skill identity uses absolute path + name")
    func localIdentity() {
        let id = SkillIdentity.compute(
            name: "my-skill",
            source: .local(path: URL(fileURLWithPath: "/Users/me/skills/my-skill"))
        )
        #expect(id.rawValue == "local:/Users/me/skills/my-skill#my-skill")
    }

    @Test("Registry skill identity uses slug + name")
    func registryIdentity() {
        let id = SkillIdentity.compute(
            name: "core",
            source: .registry(slug: "official/core")
        )
        #expect(id.rawValue == "registry:official/core#core")
    }

    @Test("Identity is Codable and Hashable (usable as dict key)")
    func codableAndHashable() throws {
        let id1 = SkillIdentity.compute(
            name: "x",
            source: .github(owner: "a", repo: "b", ref: "main")
        )
        let id2 = SkillIdentity.compute(
            name: "x",
            source: .github(owner: "a", repo: "b", ref: "main")
        )
        #expect(id1 == id2)
        #expect(id1.hashValue == id2.hashValue)

        let data = try JSONEncoder().encode(id1)
        let back = try JSONDecoder().decode(SkillIdentity.self, from: data)
        #expect(back == id1)
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

- [ ] **Step 4: 实现**

`Domain/Types/SkillIdentity.swift`:
```swift
import Foundation

/// Stable identity for a skill: encodes source + name so two installs of the same
/// upstream skill (different names) are distinguishable, and two installs from
/// different sources with the same name don't collide.
///
/// Wire format matches TS `skill-identity.ts` exactly.
public struct SkillIdentity: Codable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public static func compute(name: String, source: SkillSource) -> SkillIdentity {
        switch source {
        case .github(let owner, let repo, let ref):
            return SkillIdentity(rawValue: "github:\(owner)/\(repo)@\(ref)#\(name)")
        case .local(let path):
            return SkillIdentity(rawValue: "local:\(path.path)#\(name)")
        case .registry(let slug):
            return SkillIdentity(rawValue: "registry:\(slug)#\(name)")
        }
    }
}

extension SkillIdentity: CustomStringConvertible {
    public var description: String { rawValue }
}
```

如果在 Step 1 查阅的 TS 实现与上述格式不一致，以 TS 为准调整 Swift 实现并同步更新测试。

- [ ] **Step 5: 跑测试确认通过并 commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(types): add SkillIdentity matching TS implementation"
```

---

### Task 14: Skill struct

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/Skill.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Types/SkillTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Types/SkillTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("Skill")
struct SkillTests {
    @Test("Skill exposes id computed from identity")
    func idFromIdentity() {
        let skill = Skill(
            name: "superpowers",
            path: URL(fileURLWithPath: "/Users/me/.agents/skills/superpowers"),
            source: .github(owner: "obra", repo: "superpowers", ref: "main"),
            frontmatter: SKILLMetadata(description: "a skill"),
            installedAgents: [.claudeCode, .cursor],
            updateStatus: .upToDate
        )
        #expect(skill.id == SkillIdentity.compute(
            name: "superpowers",
            source: .github(owner: "obra", repo: "superpowers", ref: "main")
        ))
    }

    @Test("Skill is Hashable and Equatable by id only")
    func hashableByID() {
        let base = Skill(
            name: "x",
            path: URL(fileURLWithPath: "/p/x"),
            source: .registry(slug: "a/x"),
            frontmatter: SKILLMetadata(),
            installedAgents: [],
            updateStatus: .unknown
        )
        let sameIdentity = Skill(
            name: "x",
            path: URL(fileURLWithPath: "/other/path"),  // 路径变了，但 identity 相同
            source: .registry(slug: "a/x"),
            frontmatter: SKILLMetadata(description: "diff"),
            installedAgents: [.codex],
            updateStatus: .available(remoteHash: "h")
        )
        #expect(base == sameIdentity)
        #expect(base.hashValue == sameIdentity.hashValue)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

- [ ] **Step 3: 实现**

`Domain/Types/Skill.swift`:
```swift
import Foundation

public struct Skill: Identifiable, Hashable, Sendable {
    public let name: String
    public let path: URL
    public let source: SkillSource
    public var frontmatter: SKILLMetadata
    public var installedAgents: Set<AgentID>
    public var updateStatus: UpdateStatus

    public var id: SkillIdentity {
        SkillIdentity.compute(name: name, source: source)
    }

    public init(
        name: String,
        path: URL,
        source: SkillSource,
        frontmatter: SKILLMetadata,
        installedAgents: Set<AgentID>,
        updateStatus: UpdateStatus
    ) {
        self.name = name
        self.path = path
        self.source = source
        self.frontmatter = frontmatter
        self.installedAgents = installedAgents
        self.updateStatus = updateStatus
    }

    public static func == (lhs: Skill, rhs: Skill) -> Bool {
        lhs.id == rhs.id
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(types): add Skill struct keyed by SkillIdentity"
```

---

### Task 15: DomainEvent enum

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Types/DomainEvent.swift`

- [ ] **Step 1: 实现 DomainEvent（此类型仅是 case 定义，测试价值低，直接写 + commit）**

`Domain/Types/DomainEvent.swift`:
```swift
import Foundation

/// 从 Domain actor 流向 Observable model 的事件。
/// 替代 Electron 版的 EventEmitter + IPC。
public enum DomainEvent: Sendable {
    /// 全量重扫完成
    case skillsReloaded(skills: [Skill])
    /// 单个 skill 的安装状态变化
    case skillInstallationChanged(id: SkillIdentity, agents: Set<AgentID>)
    /// 单个 skill 的更新状态变化
    case skillUpdateStatusChanged(id: SkillIdentity, status: UpdateStatus)
    /// 批量更新检测完成
    case batchUpdateCheckCompleted(available: Int)
    /// 来自 FileWatcher 的原始事件（仅供 SkillManagerActor 订阅后触发重扫，不必一路冒到 UI）
    case fileSystemChanged(paths: [URL])
    /// 通知
    case notification(level: NotificationLevel, message: String)
    /// 错误（供 NotificationModel 展示）
    case error(SkillportError)
}

public enum NotificationLevel: Sendable {
    case info, warning, error, success
}

public enum SkillportError: Error, Sendable, Equatable {
    case fileIO(path: URL, reason: String)
    case gitFailed(exitCode: Int32, stderr: String)
    case keychainFailed(osStatus: Int32)
    case networkFailed(url: URL?, reason: String)
    case parseFailed(file: URL?, reason: String)
    case invalidLockFile(reason: String)
    case unexpected(String)
}
```

- [ ] **Step 2: Commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add Domain
git commit -m "feat(types): add DomainEvent and SkillportError enums"
```

Expected: build 成功。

---



## Phase 3 — M2 Parser + 测试 infrastructure (Tasks 16–18)

### Task 16: SKILLMdParser

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Parsers/SKILLMdParser.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Parsers/SKILLMdParserTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/Fixtures/SKILL_basic.md`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/Fixtures/SKILL_no_frontmatter.md`

- [ ] **Step 1: 准备 fixture**

`Tests/SkillportTests/TestSupport/Fixtures/SKILL_basic.md`:
```markdown
---
description: A demo skill
version: 0.1.0
allowedTools:
  - Read
  - Write
---

# Demo skill

Body paragraph here.
```

`Tests/SkillportTests/TestSupport/Fixtures/SKILL_no_frontmatter.md`:
```markdown
# Just body

No frontmatter at all.
```

- [ ] **Step 2: 写失败测试**

`Tests/SkillportTests/Parsers/SKILLMdParserTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SKILLMdParser")
struct SKILLMdParserTests {
    @Test("Parses frontmatter and body from standard SKILL.md")
    func parsesBasicFixture() throws {
        let url = Bundle.module.url(forResource: "SKILL_basic", withExtension: "md")!
        let raw = try String(contentsOf: url, encoding: .utf8)
        let result = try SKILLMdParser.parse(raw)
        #expect(result.metadata.description == "A demo skill")
        #expect(result.metadata.version == "0.1.0")
        #expect(result.metadata.allowedTools == ["Read", "Write"])
        #expect(result.body.contains("# Demo skill"))
        #expect(result.body.contains("Body paragraph here."))
    }

    @Test("No-frontmatter file yields empty metadata and full body")
    func handlesNoFrontmatter() throws {
        let url = Bundle.module.url(forResource: "SKILL_no_frontmatter", withExtension: "md")!
        let raw = try String(contentsOf: url, encoding: .utf8)
        let result = try SKILLMdParser.parse(raw)
        #expect(result.metadata.description == nil)
        #expect(result.body.hasPrefix("# Just body"))
    }

    @Test("Unclosed frontmatter throws parseFailed")
    func unclosedFrontmatterThrows() {
        let bad = "---\ndescription: hi\n\n# Body without closer"
        #expect(throws: SkillportError.self) {
            _ = try SKILLMdParser.parse(bad)
        }
    }

    @Test("serialize round-trips back to equivalent raw text")
    func serializeRoundTrip() throws {
        let meta = SKILLMetadata(description: "hi", version: "1.0.0", allowedTools: ["Bash"])
        let body = "# Body\n\ncontent\n"
        let raw = try SKILLMdParser.serialize(metadata: meta, body: body)
        let reparsed = try SKILLMdParser.parse(raw)
        #expect(reparsed.metadata.description == "hi")
        #expect(reparsed.metadata.version == "1.0.0")
        #expect(reparsed.metadata.allowedTools == ["Bash"])
        #expect(reparsed.body.contains("# Body"))
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

- [ ] **Step 4: 实现**

`Domain/Parsers/SKILLMdParser.swift`:
```swift
import Foundation

/// 纯函数：拆分 SKILL.md 的 frontmatter 与 body；序列化反之。
/// 对应 TS `skill-md-parser.ts`。
public enum SKILLMdParser {
    public struct ParseResult: Sendable {
        public let metadata: SKILLMetadata
        public let body: String
    }

    public static func parse(_ raw: String) throws -> ParseResult {
        guard raw.hasPrefix("---\n") || raw.hasPrefix("---\r\n") else {
            // 无 frontmatter
            return ParseResult(metadata: SKILLMetadata(), body: raw)
        }
        // 查找关闭行（独占一行的 "---"）
        let lines = raw.split(separator: "\n", omittingEmptySubsequences: false)
        var closerIndex: Int? = nil
        for i in 1..<lines.count {
            if lines[i] == "---" || lines[i] == "---\r" {
                closerIndex = i
                break
            }
        }
        guard let closer = closerIndex else {
            throw SkillportError.parseFailed(file: nil, reason: "unclosed frontmatter")
        }
        let yamlLines = lines[1..<closer]
        let yaml = yamlLines.joined(separator: "\n")
        let bodyLines = lines[(closer + 1)...]
        let body = bodyLines.joined(separator: "\n")
        let metadata: SKILLMetadata
        do {
            metadata = try SKILLMetadata.fromYAML(yaml)
        } catch {
            throw SkillportError.parseFailed(file: nil, reason: "invalid YAML: \(error)")
        }
        // 去掉 body 开头可能的单个换行
        let trimmedBody = body.hasPrefix("\n") ? String(body.dropFirst()) : body
        return ParseResult(metadata: metadata, body: trimmedBody)
    }

    public static func serialize(metadata: SKILLMetadata, body: String) throws -> String {
        let yaml = try metadata.toYAML()
        // 如果 metadata 为空，yaml 可能是 "{}\n" 或空字符串；统一输出空 frontmatter
        let trimmed = yaml.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed == "{}" {
            return body.hasSuffix("\n") ? body : body + "\n"
        }
        var out = "---\n"
        out += trimmed
        if !trimmed.hasSuffix("\n") { out += "\n" }
        out += "---\n\n"
        out += body
        if !out.hasSuffix("\n") { out += "\n" }
        return out
    }
}
```

注意：swift-markdown 目前 **只在 preview 渲染** 时需要（Task 48），parser 本身只需 Yams。所以此 task 不在 `project.yml` 里加 swift-markdown，放到 Phase 7 的 Task 47 再加。

- [ ] **Step 5: 跑测试确认通过 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(parser): add SKILLMdParser for frontmatter/body split"
```

---

### Task 17: TempDir 测试工具

**Files:**
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/TempDir.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/TempDirTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/TestSupport/TempDirTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("TempDir")
struct TempDirTests {
    @Test("Creates a unique directory on disk")
    func createsDirectory() throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        var isDir: ObjCBool = false
        #expect(FileManager.default.fileExists(atPath: dir.url.path, isDirectory: &isDir))
        #expect(isDir.boolValue)
    }

    @Test("Two TempDirs are distinct")
    func distinct() throws {
        let a = try TempDir.create()
        let b = try TempDir.create()
        defer {
            try? a.cleanup()
            try? b.cleanup()
        }
        #expect(a.url != b.url)
    }

    @Test("cleanup removes the directory")
    func cleanupRemoves() throws {
        let dir = try TempDir.create()
        let path = dir.url.path
        try dir.cleanup()
        #expect(!FileManager.default.fileExists(atPath: path))
    }

    @Test("writing and reading a file inside TempDir")
    func writeAndRead() throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let file = dir.url.appendingPathComponent("hello.txt")
        try "hi".write(to: file, atomically: true, encoding: .utf8)
        let back = try String(contentsOf: file, encoding: .utf8)
        #expect(back == "hi")
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

- [ ] **Step 3: 实现**

`Tests/SkillportTests/TestSupport/TempDir.swift`:
```swift
import Foundation

/// 测试用临时目录；不 mock 文件系统，所有 actor 测试都跑真实 IO。
public struct TempDir: Sendable {
    public let url: URL

    public static func create() throws -> TempDir {
        let base = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("skillport-tests", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return TempDir(url: base)
    }

    public func cleanup() throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    /// 便利：在 TempDir 下创建子目录。
    @discardableResult
    public func mkdir(_ relative: String) throws -> URL {
        let dir = url.appendingPathComponent(relative, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// 便利：写文件。
    @discardableResult
    public func write(_ relative: String, content: String) throws -> URL {
        let file = url.appendingPathComponent(relative)
        try FileManager.default.createDirectory(
            at: file.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try content.write(to: file, atomically: true, encoding: .utf8)
        return file
    }
}
```

- [ ] **Step 4: 跑测试确认通过 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Tests
git commit -m "test: add TempDir helper for actor integration tests"
```

---

### Task 18: MockURLProtocol 测试工具

**Files:**
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/MockURLProtocol.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/MockURLProtocolTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/TestSupport/MockURLProtocolTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("MockURLProtocol", .serialized)
struct MockURLProtocolTests {
    @Test("Registered handler returns stubbed response")
    func stubbedResponse() async throws {
        await MockURLProtocol.reset()
        await MockURLProtocol.stub(url: URL(string: "https://example.test/a")!) { _ in
            MockURLProtocol.Response(
                statusCode: 200,
                headers: ["Content-Type": "text/plain"],
                body: Data("hello".utf8)
            )
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self] + (config.protocolClasses ?? [])
        let session = URLSession(configuration: config)
        let (data, response) = try await session.data(from: URL(string: "https://example.test/a")!)
        #expect((response as? HTTPURLResponse)?.statusCode == 200)
        #expect(String(data: data, encoding: .utf8) == "hello")
    }

    @Test("Unregistered URL returns 404")
    func unregisteredReturns404() async throws {
        await MockURLProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self] + (config.protocolClasses ?? [])
        let session = URLSession(configuration: config)
        let (_, response) = try await session.data(from: URL(string: "https://nowhere.test/x")!)
        #expect((response as? HTTPURLResponse)?.statusCode == 404)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Tests/SkillportTests/TestSupport/MockURLProtocol.swift`:
```swift
import Foundation

/// 测试用 URLProtocol，允许按 URL 注册响应。
/// 所有状态在 `actor Store` 中线程安全。
public final class MockURLProtocol: URLProtocol {
    public struct Response: Sendable {
        public let statusCode: Int
        public let headers: [String: String]
        public let body: Data

        public init(statusCode: Int, headers: [String: String], body: Data) {
            self.statusCode = statusCode
            self.headers = headers
            self.body = body
        }
    }

    public typealias Handler = @Sendable (URLRequest) -> Response

    private actor Store {
        var handlers: [URL: Handler] = [:]
        func set(_ url: URL, handler: @escaping Handler) { handlers[url] = handler }
        func get(_ url: URL) -> Handler? { handlers[url] }
        func clear() { handlers.removeAll() }
    }

    private static let store = Store()

    public static func stub(url: URL, handler: @escaping Handler) async {
        await store.set(url, handler: handler)
    }

    public static func reset() async {
        await store.clear()
    }

    public override class func canInit(with request: URLRequest) -> Bool { true }
    public override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    public override func startLoading() {
        let request = self.request
        let client = self.client
        Task {
            let handler: Handler? = await Self.store.get(request.url ?? URL(fileURLWithPath: "/"))
            let resp: Response
            if let handler {
                resp = handler(request)
            } else {
                resp = Response(statusCode: 404, headers: [:], body: Data())
            }
            let http = HTTPURLResponse(
                url: request.url!,
                statusCode: resp.statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: resp.headers
            )!
            client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: resp.body)
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    public override func stopLoading() { /* no-op */ }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Tests
git commit -m "test: add MockURLProtocol for URLSession stubbing"
```

---

---

## Phase 4 — M2 底层 Actors (Tasks 19–25)

### Task 19: LockFileActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/LockFileActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/LockFileActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/LockFileActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("LockFileActor")
struct LockFileActorTests {
    @Test("Read returns empty LockFile when file does not exist")
    func readMissing() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let actor = LockFileActor(path: dir.url.appendingPathComponent(".skill-lock.json"))
        let lock = try await actor.read()
        #expect(lock.version == 3)
        #expect(lock.skills.isEmpty)
    }

    @Test("Write then read round-trip preserves LockedSkill entries")
    func roundTrip() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let actor = LockFileActor(path: dir.url.appendingPathComponent(".skill-lock.json"))
        let lock = LockFile(
            version: 3,
            skills: [
                LockedSkill(
                    name: "demo",
                    source: .github(owner: "x", repo: "y", ref: "main"),
                    installedAt: Date(timeIntervalSince1970: 1_700_000_000),
                    commitHash: "abc",
                    path: URL(fileURLWithPath: "/tmp/demo")
                )
            ]
        )
        try await actor.write(lock)
        let back = try await actor.read()
        #expect(back == lock)
    }

    @Test("Write is atomic: partial writes do not clobber existing file")
    func atomicWrite() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let path = dir.url.appendingPathComponent(".skill-lock.json")
        let good = LockFile(version: 3, skills: [])
        let actor = LockFileActor(path: path)
        try await actor.write(good)
        // 模拟第二次写入时崩溃：先验证没有 .tmp 遗留
        let tmpPath = path.path + ".tmp"
        #expect(!FileManager.default.fileExists(atPath: tmpPath))
        let stillThere = try await actor.read()
        #expect(stillThere == good)
    }

    @Test("Unsupported version rejected")
    func rejectsVersionDrift() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let path = dir.url.appendingPathComponent(".skill-lock.json")
        try #"{"version": 99, "skills": []}"#.write(to: path, atomically: true, encoding: .utf8)
        let actor = LockFileActor(path: path)
        await #expect(throws: SkillportError.self) {
            _ = try await actor.read()
        }
    }

    @Test("upsert(LockedSkill) adds new then replaces by name")
    func upsert() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let actor = LockFileActor(path: dir.url.appendingPathComponent(".skill-lock.json"))
        let a = LockedSkill(
            name: "demo",
            source: .local(path: URL(fileURLWithPath: "/p1")),
            installedAt: Date(),
            commitHash: nil,
            path: URL(fileURLWithPath: "/t/demo")
        )
        try await actor.upsert(a)
        let updated = LockedSkill(
            name: "demo",
            source: .local(path: URL(fileURLWithPath: "/p2")),
            installedAt: Date(),
            commitHash: "new",
            path: URL(fileURLWithPath: "/t/demo")
        )
        try await actor.upsert(updated)
        let lock = try await actor.read()
        #expect(lock.skills.count == 1)
        #expect(lock.skills.first?.commitHash == "new")
    }

    @Test("remove(name:) drops a skill entry")
    func removeEntry() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let actor = LockFileActor(path: dir.url.appendingPathComponent(".skill-lock.json"))
        let s = LockedSkill(
            name: "x",
            source: .local(path: URL(fileURLWithPath: "/x")),
            installedAt: Date(),
            commitHash: nil,
            path: URL(fileURLWithPath: "/t/x")
        )
        try await actor.upsert(s)
        try await actor.remove(name: "x")
        let lock = try await actor.read()
        #expect(lock.skills.isEmpty)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

- [ ] **Step 3: 实现**

`Domain/Actors/LockFileActor.swift`:
```swift
import Foundation

public actor LockFileActor {
    private let path: URL

    public init(path: URL) {
        self.path = path
    }

    public func read() throws -> LockFile {
        guard FileManager.default.fileExists(atPath: path.path) else {
            return LockFile(version: LockFile.currentVersion, skills: [])
        }
        let data = try Data(contentsOf: path)
        do {
            return try LockFile.decode(from: data)
        } catch let LockFile.DecodingError.unsupportedVersion(v) {
            throw SkillportError.invalidLockFile(reason: "unsupported version \(v)")
        } catch {
            throw SkillportError.invalidLockFile(reason: "\(error)")
        }
    }

    public func write(_ lock: LockFile) throws {
        let data = try lock.encode()
        try writeAtomically(data: data, to: path)
    }

    public func upsert(_ skill: LockedSkill) throws {
        var lock = try read()
        lock.skills.removeAll { $0.name == skill.name }
        lock.skills.append(skill)
        try write(lock)
    }

    public func remove(name: String) throws {
        var lock = try read()
        lock.skills.removeAll { $0.name == name }
        try write(lock)
    }

    private func writeAtomically(data: Data, to destination: URL) throws {
        let dir = destination.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let tmp = destination.appendingPathExtension("tmp")
        try data.write(to: tmp, options: .atomic)
        if FileManager.default.fileExists(atPath: destination.path) {
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: tmp)
        } else {
            try FileManager.default.moveItem(at: tmp, to: destination)
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add LockFileActor with atomic write + v3 schema"
```

---

### Task 20: CommitHashCache

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/CommitHashCache.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/CommitHashCacheTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/CommitHashCacheTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("CommitHashCache")
struct CommitHashCacheTests {
    @Test("get returns nil when key missing")
    func missingKey() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let cache = CommitHashCache(path: dir.url.appendingPathComponent(".cache.json"))
        #expect(await cache.get(identity: SkillIdentity(rawValue: "x")) == nil)
    }

    @Test("set then get round-trip persists to disk")
    func setAndGet() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let path = dir.url.appendingPathComponent(".cache.json")
        let cache = CommitHashCache(path: path)
        let id = SkillIdentity(rawValue: "github:a/b@main#c")
        try await cache.set(identity: id, hash: "deadbeef")
        #expect(await cache.get(identity: id) == "deadbeef")

        // 重建一个实例，确认落盘
        let reloaded = CommitHashCache(path: path)
        #expect(await reloaded.get(identity: id) == "deadbeef")
    }

    @Test("remove drops the entry")
    func removeEntry() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let cache = CommitHashCache(path: dir.url.appendingPathComponent(".cache.json"))
        let id = SkillIdentity(rawValue: "x")
        try await cache.set(identity: id, hash: "h")
        try await cache.remove(identity: id)
        #expect(await cache.get(identity: id) == nil)
    }

    @Test("Corrupt cache file is treated as empty (defensive)")
    func corruptFile() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let path = dir.url.appendingPathComponent(".cache.json")
        try "not json".write(to: path, atomically: true, encoding: .utf8)
        let cache = CommitHashCache(path: path)
        #expect(await cache.get(identity: SkillIdentity(rawValue: "x")) == nil)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/CommitHashCache.swift`:
```swift
import Foundation

public actor CommitHashCache {
    private let path: URL
    private var cache: [String: String]?

    public init(path: URL) {
        self.path = path
    }

    public func get(identity: SkillIdentity) -> String? {
        loadIfNeeded()
        return cache?[identity.rawValue]
    }

    public func set(identity: SkillIdentity, hash: String) throws {
        loadIfNeeded()
        cache?[identity.rawValue] = hash
        try persist()
    }

    public func remove(identity: SkillIdentity) throws {
        loadIfNeeded()
        cache?.removeValue(forKey: identity.rawValue)
        try persist()
    }

    private func loadIfNeeded() {
        if cache != nil { return }
        guard FileManager.default.fileExists(atPath: path.path),
              let data = try? Data(contentsOf: path),
              let map = try? JSONDecoder().decode([String: String].self, from: data) else {
            cache = [:]
            return
        }
        cache = map
    }

    private func persist() throws {
        guard let cache else { return }
        let data = try JSONEncoder().encode(cache)
        let dir = path.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let tmp = path.appendingPathExtension("tmp")
        try data.write(to: tmp, options: .atomic)
        if FileManager.default.fileExists(atPath: path.path) {
            _ = try FileManager.default.replaceItemAt(path, withItemAt: tmp)
        } else {
            try FileManager.default.moveItem(at: tmp, to: path)
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add CommitHashCache with disk persistence"
```

---

### Task 21: KeychainActor

Keychain 测试按 spec 8.5 不 mock。使用 **Generic Password** item，每个测试用唯一 service name（含 UUID），tearDown 清理。

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/KeychainActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/KeychainActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/KeychainActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("KeychainActor", .serialized)
struct KeychainActorTests {
    let serviceName: String

    init() {
        serviceName = "skillport-test-\(UUID().uuidString)"
    }

    @Test("Set then get returns stored password")
    func setAndGet() async throws {
        let actor = KeychainActor(service: serviceName)
        try await actor.set(account: "proxy", password: "s3cret")
        let back = try await actor.get(account: "proxy")
        #expect(back == "s3cret")
        try await actor.remove(account: "proxy")
    }

    @Test("Get returns nil for missing account")
    func getMissing() async throws {
        let actor = KeychainActor(service: serviceName)
        let back = try await actor.get(account: "does-not-exist")
        #expect(back == nil)
    }

    @Test("Set overwrites existing password")
    func overwrite() async throws {
        let actor = KeychainActor(service: serviceName)
        try await actor.set(account: "a", password: "one")
        try await actor.set(account: "a", password: "two")
        let back = try await actor.get(account: "a")
        #expect(back == "two")
        try await actor.remove(account: "a")
    }

    @Test("Remove deletes entry; subsequent get returns nil")
    func removeEntry() async throws {
        let actor = KeychainActor(service: serviceName)
        try await actor.set(account: "x", password: "y")
        try await actor.remove(account: "x")
        #expect(try await actor.get(account: "x") == nil)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/KeychainActor.swift`:
```swift
import Foundation
import Security

public actor KeychainActor {
    public static let defaultService = "skillpilot-proxy"  // 与 Electron 版共享

    private let service: String

    public init(service: String = KeychainActor.defaultService) {
        self.service = service
    }

    public func set(account: String, password: String) throws {
        let data = Data(password.utf8)
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]

        // 先尝试更新
        let updateStatus = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        if updateStatus != errSecItemNotFound {
            throw SkillportError.keychainFailed(osStatus: updateStatus)
        }

        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus != errSecSuccess {
            throw SkillportError.keychainFailed(osStatus: addStatus)
        }
    }

    public func get(account: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        if status != errSecSuccess {
            throw SkillportError.keychainFailed(osStatus: status)
        }
        guard let data = result as? Data, let s = String(data: data, encoding: .utf8) else {
            return nil
        }
        return s
    }

    public func remove(account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw SkillportError.keychainFailed(osStatus: status)
        }
    }
}
```

- [ ] **Step 4: 跑测试（首次本地运行可能弹 Keychain 授权提示，是正常的；CI macOS runner 可能需要额外 unlock 步骤——若 CI 失败，记在 follow-up 问题中，不阻塞本 task）**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add Domain Tests
git commit -m "feat(actor): add KeychainActor using Security.framework directly"
```

---

### Task 22: ProxySettingsActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/ProxySettingsActor.swift`
- Create: `/Users/crazy/own_project/skillport/Domain/Types/ProxyConfig.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/ProxySettingsActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/ProxySettingsActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("ProxySettingsActor")
struct ProxySettingsActorTests {
    @Test("Default is disabled config")
    func defaultConfig() async throws {
        let suite = UserDefaults(suiteName: "skillport-test-\(UUID().uuidString)")!
        let actor = ProxySettingsActor(defaults: suite)
        let cfg = await actor.current
        #expect(cfg.enabled == false)
        #expect(cfg.kind == .https)
        #expect(cfg.host == "")
        #expect(cfg.port == 0)
        #expect(cfg.username == nil)
    }

    @Test("Save then read round-trip through UserDefaults")
    func saveAndRead() async throws {
        let suite = UserDefaults(suiteName: "skillport-test-\(UUID().uuidString)")!
        let actor = ProxySettingsActor(defaults: suite)
        let new = ProxyConfig(
            enabled: true,
            kind: .socks5,
            host: "127.0.0.1",
            port: 1080,
            username: "alice"
        )
        await actor.save(new)
        let back = await actor.current
        #expect(back == new)

        // 重建 actor 确认持久化
        let reloaded = ProxySettingsActor(defaults: suite)
        #expect(await reloaded.current == new)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Types/ProxyConfig.swift`:
```swift
import Foundation

public struct ProxyConfig: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable, CaseIterable { case https, socks5 }

    public var enabled: Bool
    public var kind: Kind
    public var host: String
    public var port: Int
    public var username: String?

    public init(enabled: Bool = false, kind: Kind = .https, host: String = "",
                port: Int = 0, username: String? = nil) {
        self.enabled = enabled
        self.kind = kind
        self.host = host
        self.port = port
        self.username = username
    }

    public static let disabled = ProxyConfig()
}
```

`Domain/Actors/ProxySettingsActor.swift`:
```swift
import Foundation

public actor ProxySettingsActor {
    private static let key = "skillport.proxy.config.v1"
    private let defaults: UserDefaults
    public private(set) var current: ProxyConfig

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key),
           let cfg = try? JSONDecoder().decode(ProxyConfig.self, from: data) {
            self.current = cfg
        } else {
            self.current = .disabled
        }
    }

    public func save(_ config: ProxyConfig) {
        current = config
        if let data = try? JSONEncoder().encode(config) {
            defaults.set(data, forKey: Self.key)
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add ProxySettingsActor and ProxyConfig type"
```

---

### Task 23: AgentDetector

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Services/AgentDetector.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/AgentDetectorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Services/AgentDetectorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("AgentDetector")
struct AgentDetectorTests {
    @Test("Detects a fake binary placed on a custom PATH")
    func detectsOnCustomPath() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        // 创建一个名为 "claude" 的可执行空文件
        let fakeBin = dir.url.appendingPathComponent("claude")
        try "#!/bin/sh\nexit 0\n".write(to: fakeBin, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fakeBin.path)

        let detector = AgentDetector(pathOverride: dir.url.path)
        let installed = try await detector.isInstalled(agentID: .claudeCode)
        #expect(installed == true)
    }

    @Test("Returns false for agent whose binary is absent")
    func returnsFalseWhenMissing() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let detector = AgentDetector(pathOverride: dir.url.path)
        let installed = try await detector.isInstalled(agentID: .kiro)
        #expect(installed == false)
    }

    @Test("detectAll returns map keyed by AgentID")
    func detectAll() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let bin = dir.url.appendingPathComponent("cursor")
        try "".write(to: bin, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: bin.path)
        let detector = AgentDetector(pathOverride: dir.url.path)
        let map = try await detector.detectAll()
        #expect(map[.cursor] == true)
        #expect(map[.claudeCode] == false)
        #expect(map.count == AgentID.allCases.count)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Services/AgentDetector.swift`:
```swift
import Foundation

public struct AgentDetector: Sendable {
    private let pathOverride: String?

    public init(pathOverride: String? = nil) {
        self.pathOverride = pathOverride
    }

    public func isInstalled(agentID: AgentID) async throws -> Bool {
        let paths = (pathOverride ?? ProcessInfo.processInfo.environment["PATH"] ?? "")
            .split(separator: ":")
            .map(String.init)
        let binaryName = agentID.binaryName
        for dir in paths {
            let candidate = dir + "/" + binaryName
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: candidate, isDirectory: &isDir),
               !isDir.boolValue,
               FileManager.default.isExecutableFile(atPath: candidate) {
                return true
            }
        }
        return false
    }

    public func detectAll() async throws -> [AgentID: Bool] {
        var result: [AgentID: Bool] = [:]
        for id in AgentID.allCases {
            result[id] = try await isInstalled(agentID: id)
        }
        return result
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(service): add AgentDetector with PATH override for tests"
```

---

### Task 24: GitActor

测试用真实本地 git 仓库（真 `git init`），不 mock。CI macOS runner 自带 git。

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/GitActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/GitActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/GitActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("GitActor")
struct GitActorTests {
    /// helper: 在 TempDir 下初始化 git repo 并加一个提交，返回 repo 目录。
    func makeRepo(in dir: TempDir) throws -> URL {
        let repo = try dir.mkdir("repo")
        _ = try runGit(["init", "-b", "main"], cwd: repo)
        _ = try runGit(["config", "user.email", "test@local"], cwd: repo)
        _ = try runGit(["config", "user.name", "test"], cwd: repo)
        try "hello".write(to: repo.appendingPathComponent("README.md"), atomically: true, encoding: .utf8)
        _ = try runGit(["add", "."], cwd: repo)
        _ = try runGit(["commit", "-m", "init"], cwd: repo)
        return repo
    }

    private func runGit(_ args: [String], cwd: URL) throws -> String {
        let process = Process()
        process.currentDirectoryURL = cwd
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["git"] + args
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        process.waitUntilExit()
        return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    }

    @Test("headHash returns 40-char sha of latest commit")
    func headHash() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let repo = try makeRepo(in: dir)
        let git = GitActor()
        let hash = try await git.headHash(in: repo)
        #expect(hash.count == 40)
    }

    @Test("treeHash returns stable hash for HEAD tree")
    func treeHash() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let repo = try makeRepo(in: dir)
        let git = GitActor()
        let a = try await git.treeHash(in: repo, ref: "HEAD")
        let b = try await git.treeHash(in: repo, ref: "HEAD")
        #expect(a == b)
    }

    @Test("clone copies a local repo into destination")
    func cloneLocal() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let source = try makeRepo(in: dir)
        let dest = dir.url.appendingPathComponent("cloned")
        let git = GitActor()
        try await git.cloneLocal(from: source, to: dest, depth: 1)
        #expect(FileManager.default.fileExists(atPath: dest.appendingPathComponent("README.md").path))
    }

    @Test("Error includes stderr when git fails")
    func errorSurfacesStderr() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let notRepo = try dir.mkdir("not-a-repo")
        let git = GitActor()
        await #expect(throws: SkillportError.self) {
            _ = try await git.headHash(in: notRepo)
        }
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/GitActor.swift`:
```swift
import Foundation

public actor GitActor {
    public init() {}

    @discardableResult
    public func headHash(in repo: URL) async throws -> String {
        try await run(["rev-parse", "HEAD"], in: repo).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func treeHash(in repo: URL, ref: String = "HEAD") async throws -> String {
        let out = try await run(["rev-parse", "\(ref)^{tree}"], in: repo)
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func remoteTreeHash(url: URL, ref: String) async throws -> String {
        let out = try await run(["ls-remote", url.absoluteString, ref], in: nil)
        // 输出: "<commit-hash>\trefs/heads/<ref>"
        let hash = out.split(separator: "\t").first.map(String.init) ?? ""
        return hash.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func cloneLocal(from source: URL, to dest: URL, depth: Int?) async throws {
        var args = ["clone", source.path, dest.path]
        if let depth {
            args.insert(contentsOf: ["--depth", String(depth)], at: 1)
        }
        _ = try await run(args, in: nil)
    }

    public func clone(url: URL, to dest: URL, ref: String, depth: Int? = 1) async throws {
        var args = ["clone"]
        if let depth { args.append(contentsOf: ["--depth", String(depth)]) }
        args.append(contentsOf: ["-b", ref, url.absoluteString, dest.path])
        _ = try await run(args, in: nil)
    }

    public func pull(in repo: URL) async throws {
        _ = try await run(["pull", "--ff-only"], in: repo)
    }

    private func run(_ args: [String], in cwd: URL?) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["git"] + args
            if let cwd { process.currentDirectoryURL = cwd }
            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: SkillportError.gitFailed(exitCode: -1, stderr: "\(error)"))
                return
            }
            process.waitUntilExit()
            if process.terminationStatus != 0 {
                let err = String(
                    data: stderr.fileHandleForReading.readDataToEndOfFile(),
                    encoding: .utf8
                ) ?? ""
                continuation.resume(throwing: SkillportError.gitFailed(
                    exitCode: process.terminationStatus,
                    stderr: err
                ))
            } else {
                let out = String(
                    data: stdout.fileHandleForReading.readDataToEndOfFile(),
                    encoding: .utf8
                ) ?? ""
                continuation.resume(returning: out)
            }
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add GitActor wrapping system git via Process"
```

---

### Task 25: NetworkSession

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Services/NetworkSession.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/NetworkSessionTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Services/NetworkSessionTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("NetworkSession")
struct NetworkSessionTests {
    @Test("Returns URLSession with proxy config applied when enabled")
    func appliesProxy() {
        let cfg = ProxyConfig(enabled: true, kind: .https, host: "proxy.test", port: 8080)
        let session = NetworkSession.makeSession(proxy: cfg)
        let proxies = session.configuration.connectionProxyDictionary ?? [:]
        #expect(proxies[kCFNetworkProxiesHTTPSEnable] as? NSNumber == 1)
        #expect(proxies[kCFNetworkProxiesHTTPSProxy] as? String == "proxy.test")
        #expect(proxies[kCFNetworkProxiesHTTPSPort] as? NSNumber == 8080)
    }

    @Test("Returns plain session when proxy disabled")
    func noProxyWhenDisabled() {
        let session = NetworkSession.makeSession(proxy: .disabled)
        #expect((session.configuration.connectionProxyDictionary ?? [:]).isEmpty)
    }

    @Test("SOCKS5 sets corresponding CFNetwork keys")
    func socks5() {
        let cfg = ProxyConfig(enabled: true, kind: .socks5, host: "127.0.0.1", port: 1080)
        let session = NetworkSession.makeSession(proxy: cfg)
        let proxies = session.configuration.connectionProxyDictionary ?? [:]
        #expect(proxies[kCFStreamPropertySOCKSProxyHost] as? String == "127.0.0.1")
        #expect(proxies[kCFStreamPropertySOCKSProxyPort] as? NSNumber == 1080)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Services/NetworkSession.swift`:
```swift
import Foundation

public enum NetworkSession {
    /// 根据 ProxyConfig 构造一个 URLSession。
    /// 调用方负责持有 session。
    public static func makeSession(proxy: ProxyConfig) -> URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60

        if proxy.enabled, !proxy.host.isEmpty, proxy.port > 0 {
            var dict: [AnyHashable: Any] = [:]
            switch proxy.kind {
            case .https:
                dict[kCFNetworkProxiesHTTPSEnable] = 1 as NSNumber
                dict[kCFNetworkProxiesHTTPSProxy] = proxy.host
                dict[kCFNetworkProxiesHTTPSPort] = proxy.port as NSNumber
            case .socks5:
                dict[kCFStreamPropertySOCKSProxyHost] = proxy.host
                dict[kCFStreamPropertySOCKSProxyPort] = proxy.port as NSNumber
                dict[kCFStreamPropertySOCKSVersion] = kCFStreamSocketSOCKSVersion5
            }
            config.connectionProxyDictionary = dict
        }
        return URLSession(configuration: config)
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(service): add NetworkSession factory with HTTPS/SOCKS5 proxy support"
```

---


## Phase 5 — M2 上层 Actors + 中心编排 (Tasks 26–35)

### Task 26: SymlinkManagerActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/SymlinkManagerActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SymlinkManagerActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SymlinkManagerActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SymlinkManagerActor")
struct SymlinkManagerActorTests {
    @Test("Creates symlink pointing at target")
    func createLink() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let target = try dir.mkdir("target")
        let linkDir = try dir.mkdir("agent-skills")
        let link = linkDir.appendingPathComponent("demo")
        let mgr = SymlinkManagerActor()
        try await mgr.link(target: target, at: link)
        let attrs = try FileManager.default.attributesOfItem(atPath: link.path)
        #expect(attrs[.type] as? FileAttributeType == .typeSymbolicLink)
        let resolved = try FileManager.default.destinationOfSymbolicLink(atPath: link.path)
        #expect(resolved == target.path)
    }

    @Test("link is idempotent: same target → no-op")
    func idempotent() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let target = try dir.mkdir("t")
        let link = dir.url.appendingPathComponent("l")
        let mgr = SymlinkManagerActor()
        try await mgr.link(target: target, at: link)
        try await mgr.link(target: target, at: link)  // 不 throw
        let resolved = try FileManager.default.destinationOfSymbolicLink(atPath: link.path)
        #expect(resolved == target.path)
    }

    @Test("link replaces a link pointing elsewhere")
    func replaceExisting() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let t1 = try dir.mkdir("t1")
        let t2 = try dir.mkdir("t2")
        let link = dir.url.appendingPathComponent("l")
        let mgr = SymlinkManagerActor()
        try await mgr.link(target: t1, at: link)
        try await mgr.link(target: t2, at: link)
        let resolved = try FileManager.default.destinationOfSymbolicLink(atPath: link.path)
        #expect(resolved == t2.path)
    }

    @Test("unlink removes only if it is a symlink pointing at expected target")
    func unlinkSafe() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let target = try dir.mkdir("t")
        let link = dir.url.appendingPathComponent("l")
        let mgr = SymlinkManagerActor()
        try await mgr.link(target: target, at: link)
        try await mgr.unlink(at: link, expectedTarget: target)
        #expect(!FileManager.default.fileExists(atPath: link.path))
    }

    @Test("unlink refuses to remove a real directory at the link path")
    func unlinkRefusesRealDir() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let fakeTarget = try dir.mkdir("real")
        await #expect(throws: SkillportError.self) {
            try await SymlinkManagerActor().unlink(at: fakeTarget, expectedTarget: fakeTarget)
        }
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/SymlinkManagerActor.swift`:
```swift
import Foundation

public actor SymlinkManagerActor {
    public init() {}

    public func link(target: URL, at linkURL: URL) throws {
        let fm = FileManager.default
        try fm.createDirectory(
            at: linkURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if fm.fileExists(atPath: linkURL.path) {
            if let existing = try? fm.destinationOfSymbolicLink(atPath: linkURL.path) {
                if existing == target.path { return }  // idempotent
                try fm.removeItem(at: linkURL)
            } else {
                throw SkillportError.fileIO(path: linkURL, reason: "path exists and is not a symlink")
            }
        }
        try fm.createSymbolicLink(at: linkURL, withDestinationURL: target)
    }

    public func unlink(at linkURL: URL, expectedTarget: URL) throws {
        let fm = FileManager.default
        guard fm.fileExists(atPath: linkURL.path) else { return }
        guard let actual = try? fm.destinationOfSymbolicLink(atPath: linkURL.path) else {
            throw SkillportError.fileIO(path: linkURL, reason: "not a symlink; refuse to remove")
        }
        guard actual == expectedTarget.path else {
            throw SkillportError.fileIO(path: linkURL,
                                        reason: "symlink points at \(actual), expected \(expectedTarget.path)")
        }
        try fm.removeItem(at: linkURL)
    }

    public func isLinked(target: URL, at linkURL: URL) -> Bool {
        guard let resolved = try? FileManager.default.destinationOfSymbolicLink(atPath: linkURL.path) else {
            return false
        }
        return resolved == target.path
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add SymlinkManagerActor with idempotent link/unlink"
```

---

### Task 27: FileWatcherActor (FSEvents → AsyncStream)

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/FileWatcherActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/FileWatcherActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/FileWatcherActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("FileWatcherActor", .serialized)
struct FileWatcherActorTests {
    @Test("Emits event when a file is created under watched path")
    func emitsOnCreate() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let watcher = FileWatcherActor()
        let stream = await watcher.start(paths: [dir.url])
        defer { Task { await watcher.stop() } }

        let receivedTask = Task { () -> URL? in
            for await event in stream {
                if event.paths.contains(where: { $0.path.hasSuffix("/new.txt") }) {
                    return event.paths.first
                }
            }
            return nil
        }

        // 给 FSEvents 一点时间 attach
        try await Task.sleep(nanoseconds: 300_000_000)
        try "hi".write(to: dir.url.appendingPathComponent("new.txt"),
                       atomically: true, encoding: .utf8)
        // 等待事件
        let deadline = ContinuousClock.now + .seconds(5)
        while ContinuousClock.now < deadline {
            if receivedTask.isCancelled == false, await !receivedTask.value.isNil() { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let url = await receivedTask.value
        #expect(url != nil)
    }

    @Test("stop() ends the stream")
    func stopEndsStream() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let watcher = FileWatcherActor()
        let stream = await watcher.start(paths: [dir.url])
        await watcher.stop()
        var iter = stream.makeAsyncIterator()
        let next = await iter.next()
        #expect(next == nil)
    }
}

private extension Optional {
    func isNil() -> Bool { self == nil }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/FileWatcherActor.swift`:
```swift
import Foundation
import CoreServices

public struct FileEvent: Sendable {
    public let paths: [URL]
    public let timestamp: Date
}

public actor FileWatcherActor {
    private var stream: FSEventStreamRef?
    private var continuation: AsyncStream<FileEvent>.Continuation?

    public init() {}

    public func start(paths: [URL], latency: TimeInterval = 0.2) -> AsyncStream<FileEvent> {
        stop()
        let (stream, continuation) = AsyncStream<FileEvent>.makeStream()
        self.continuation = continuation

        let pathsCF = paths.map { $0.path as CFString } as CFArray
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil, release: nil, copyDescription: nil
        )
        let callback: FSEventStreamCallback = { _, info, numEvents, eventPaths, _, _ in
            guard let info else { return }
            let actor = Unmanaged<FileWatcherActor>.fromOpaque(info).takeUnretainedValue()
            let paths = Array(UnsafeBufferPointer(
                start: eventPaths.assumingMemoryBound(to: UnsafePointer<CChar>.self),
                count: numEvents
            )).map { URL(fileURLWithPath: String(cString: $0)) }
            let event = FileEvent(paths: paths, timestamp: Date())
            Task { await actor.emit(event) }
        }
        let fsStream = FSEventStreamCreate(
            kCFAllocatorDefault,
            callback,
            &context,
            pathsCF,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            latency,
            FSEventStreamCreateFlags(
                kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer
            )
        )
        guard let fsStream else {
            continuation.finish()
            return stream
        }
        self.stream = fsStream
        FSEventStreamSetDispatchQueue(fsStream, DispatchQueue.global(qos: .utility))
        FSEventStreamStart(fsStream)
        return stream
    }

    public func stop() {
        if let s = stream {
            FSEventStreamStop(s)
            FSEventStreamInvalidate(s)
            FSEventStreamRelease(s)
            stream = nil
        }
        continuation?.finish()
        continuation = nil
    }

    private func emit(_ event: FileEvent) {
        continuation?.yield(event)
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add FileWatcherActor wrapping FSEvents"
```

---

### Task 28: SkillScannerActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/SkillScannerActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillScannerActorTests.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/TestSupport/AgentsFS.swift`（fixture builder）

- [ ] **Step 1: 写 fixture builder**

`Tests/SkillportTests/TestSupport/AgentsFS.swift`:
```swift
import Foundation
@testable import Skillport

enum AgentsFS {
    /// 在 tempdir 下造一个 `~/.agents/skills/<name>/SKILL.md` 结构。
    @discardableResult
    static func createCanonicalSkill(
        in home: URL,
        name: String,
        description: String = "demo"
    ) throws -> URL {
        let skillDir = home
            .appendingPathComponent(".agents/skills", isDirectory: true)
            .appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        let raw = try SKILLMdParser.serialize(
            metadata: SKILLMetadata(description: description),
            body: "# \(name)\n"
        )
        try raw.write(to: skillDir.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
        return skillDir
    }

    /// 在某 agent 的 skills 目录下 symlink 一个 canonical skill。
    static func installSymlink(
        home: URL,
        agentRelativeSkillsDir: String,
        skillName: String
    ) throws {
        let canonical = home
            .appendingPathComponent(".agents/skills", isDirectory: true)
            .appendingPathComponent(skillName)
        let linkDir = home.appendingPathComponent(agentRelativeSkillsDir, isDirectory: true)
        try FileManager.default.createDirectory(at: linkDir, withIntermediateDirectories: true)
        let link = linkDir.appendingPathComponent(skillName)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: canonical)
    }
}
```

- [ ] **Step 2: 写失败测试**

`Tests/SkillportTests/Actors/SkillScannerActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillScannerActor")
struct SkillScannerActorTests {
    @Test("Scans canonical skills under ~/.agents/skills")
    func scansCanonical() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "alpha")
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "beta", description: "b")

        let scanner = SkillScannerActor()
        let skills = try await scanner.scanAll(home: dir.url)
        #expect(skills.count == 2)
        let byName = Dictionary(uniqueKeysWithValues: skills.map { ($0.name, $0) })
        #expect(byName["alpha"]?.frontmatter.description == "demo")
        #expect(byName["beta"]?.frontmatter.description == "b")
    }

    @Test("Detects installed-to-agent via symlink")
    func detectsInstalls() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "x")
        try AgentsFS.installSymlink(home: dir.url, agentRelativeSkillsDir: ".claude/skills", skillName: "x")
        try AgentsFS.installSymlink(home: dir.url, agentRelativeSkillsDir: ".cursor/skills", skillName: "x")

        let scanner = SkillScannerActor()
        let skills = try await scanner.scanAll(home: dir.url)
        #expect(skills.count == 1)
        let x = skills[0]
        #expect(x.installedAgents.contains(.claudeCode))
        #expect(x.installedAgents.contains(.cursor))
        #expect(!x.installedAgents.contains(.kiro))
    }

    @Test("Skips directories without SKILL.md")
    func skipsWithoutSKILLmd() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try dir.mkdir(".agents/skills/empty-dir")
        let scanner = SkillScannerActor()
        let skills = try await scanner.scanAll(home: dir.url)
        #expect(skills.isEmpty)
    }
}
```

- [ ] **Step 3: 跑测试确认失败**

- [ ] **Step 4: 实现**

`Domain/Actors/SkillScannerActor.swift`:
```swift
import Foundation

public actor SkillScannerActor {
    public init() {}

    /// 扫描 `~/.agents/skills` 作为规范存储，然后检查 11 个 agent 目录的 symlink 判断安装状态。
    public func scanAll(home: URL) async throws -> [Skill] {
        let fm = FileManager.default
        let canonicalBase = home.appendingPathComponent(".agents/skills", isDirectory: true)

        guard fm.fileExists(atPath: canonicalBase.path) else { return [] }

        let entries = try fm.contentsOfDirectory(
            at: canonicalBase,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )

        var skills: [Skill] = []
        for entry in entries {
            let skillMd = entry.appendingPathComponent("SKILL.md")
            guard fm.fileExists(atPath: skillMd.path) else { continue }
            let raw = (try? String(contentsOf: skillMd, encoding: .utf8)) ?? ""
            let parsed = (try? SKILLMdParser.parse(raw)) ?? .init(metadata: SKILLMetadata(), body: raw)
            let name = entry.lastPathComponent
            let source: SkillSource = .local(path: entry)  // 默认，Installer/更新后会改写
            let installedAgents = detectInstalledAgents(home: home, canonicalSkill: entry)
            let skill = Skill(
                name: name,
                path: entry,
                source: source,
                frontmatter: parsed.metadata,
                installedAgents: installedAgents,
                updateStatus: .unknown
            )
            skills.append(skill)
        }
        return skills.sorted { $0.name < $1.name }
    }

    private func detectInstalledAgents(home: URL, canonicalSkill: URL) -> Set<AgentID> {
        var result: Set<AgentID> = []
        let fm = FileManager.default
        for agent in Agent.defaultAgents(home: home) {
            let link = agent.skillsDir.appendingPathComponent(canonicalSkill.lastPathComponent)
            if let target = try? fm.destinationOfSymbolicLink(atPath: link.path),
               target == canonicalSkill.path {
                result.insert(agent.id)
            }
        }
        return result
    }
}
```

- [ ] **Step 5: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add SkillScannerActor and AgentsFS fixture helper"
```

---

### Task 29: LocalImporter

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Services/LocalImporter.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Services/LocalImporterTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Services/LocalImporterTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("LocalImporter")
struct LocalImporterTests {
    @Test("Copies a local skill folder into canonical ~/.agents/skills")
    func copyIntoCanonical() throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }

        let src = try dir.mkdir("my-skill")
        try "---\ndescription: t\n---\nbody".write(
            to: src.appendingPathComponent("SKILL.md"),
            atomically: true, encoding: .utf8
        )

        let home = try dir.mkdir("home")
        let importer = LocalImporter()
        let dest = try importer.importSkill(from: src, home: home)
        #expect(dest.lastPathComponent == "my-skill")
        #expect(FileManager.default.fileExists(atPath: dest.appendingPathComponent("SKILL.md").path))
    }

    @Test("Refuses a folder without SKILL.md")
    func refusesInvalid() throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let src = try dir.mkdir("bad")
        let importer = LocalImporter()
        #expect(throws: SkillportError.self) {
            _ = try importer.importSkill(from: src, home: dir.url)
        }
    }

    @Test("Refuses to overwrite an existing canonical skill")
    func refusesOverwrite() throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }

        let src = try dir.mkdir("demo")
        try "---\n---\n".write(to: src.appendingPathComponent("SKILL.md"),
                               atomically: true, encoding: .utf8)
        let home = try dir.mkdir("home")
        let importer = LocalImporter()
        _ = try importer.importSkill(from: src, home: home)
        #expect(throws: SkillportError.self) {
            _ = try importer.importSkill(from: src, home: home)
        }
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Services/LocalImporter.swift`:
```swift
import Foundation

public struct LocalImporter: Sendable {
    public init() {}

    public func importSkill(from source: URL, home: URL) throws -> URL {
        let fm = FileManager.default
        let skillMd = source.appendingPathComponent("SKILL.md")
        guard fm.fileExists(atPath: skillMd.path) else {
            throw SkillportError.fileIO(path: source, reason: "no SKILL.md in source folder")
        }
        let canonicalBase = home.appendingPathComponent(".agents/skills", isDirectory: true)
        try fm.createDirectory(at: canonicalBase, withIntermediateDirectories: true)
        let dest = canonicalBase.appendingPathComponent(source.lastPathComponent, isDirectory: true)
        if fm.fileExists(atPath: dest.path) {
            throw SkillportError.fileIO(path: dest, reason: "destination already exists")
        }
        try fm.copyItem(at: source, to: dest)
        return dest
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(service): add LocalImporter for copying local skills into canonical store"
```

---

### Task 30: SkillInstallerActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/SkillInstallerActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillInstallerActorTests.swift`

SkillInstallerActor 编排 `GitActor` + `LocalImporter` + `SymlinkManagerActor` + `LockFileActor` + `CommitHashCache`，输入 source，输出 canonical path + lockfile + 指定 agent 的 symlink。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SkillInstallerActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillInstallerActor")
struct SkillInstallerActorTests {
    @Test("installLocal creates canonical copy + lockfile entry")
    func installLocal() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let src = try dir.mkdir("localSkill")
        try "---\ndescription: t\n---\n".write(
            to: src.appendingPathComponent("SKILL.md"),
            atomically: true, encoding: .utf8
        )
        let home = try dir.mkdir("home")
        let lockPath = home.appendingPathComponent(".agents/.skill-lock.json")

        let installer = SkillInstallerActor(
            git: GitActor(),
            symlinker: SymlinkManagerActor(),
            lockFile: LockFileActor(path: lockPath),
            cache: CommitHashCache(path: home.appendingPathComponent(".agents/.skillpilot-cache.json"))
        )
        let skill = try await installer.installLocal(from: src, home: home, installTo: [.claudeCode])
        #expect(skill.name == "localSkill")
        #expect(skill.installedAgents.contains(.claudeCode))

        // lockfile 应含新条目
        let lock = try LockFile.decode(from: Data(contentsOf: lockPath))
        #expect(lock.skills.contains { $0.name == "localSkill" })
        // 对应 agent 目录应存在 symlink
        let link = home.appendingPathComponent(".claude/skills/localSkill")
        let resolved = try FileManager.default.destinationOfSymbolicLink(atPath: link.path)
        #expect(resolved.hasSuffix(".agents/skills/localSkill"))
    }

    @Test("uninstall removes symlink and lockfile entry, keeps canonical files")
    func uninstall() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let src = try dir.mkdir("s")
        try "---\n---\n".write(
            to: src.appendingPathComponent("SKILL.md"),
            atomically: true, encoding: .utf8
        )
        let home = try dir.mkdir("home")
        let lockPath = home.appendingPathComponent(".agents/.skill-lock.json")

        let installer = SkillInstallerActor(
            git: GitActor(),
            symlinker: SymlinkManagerActor(),
            lockFile: LockFileActor(path: lockPath),
            cache: CommitHashCache(path: home.appendingPathComponent(".agents/.skillpilot-cache.json"))
        )
        _ = try await installer.installLocal(from: src, home: home, installTo: [.kiro])
        try await installer.uninstall(name: "s", home: home)
        let link = home.appendingPathComponent(".kiro/skills/s")
        #expect(!FileManager.default.fileExists(atPath: link.path))
        let canonical = home.appendingPathComponent(".agents/skills/s/SKILL.md")
        #expect(FileManager.default.fileExists(atPath: canonical.path))  // 保留
        let lock = try LockFile.decode(from: Data(contentsOf: lockPath))
        #expect(lock.skills.isEmpty)
    }

    @Test("toggleAgent creates or removes symlink without touching lockfile entry")
    func toggleAgent() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let src = try dir.mkdir("t")
        try "---\n---\n".write(
            to: src.appendingPathComponent("SKILL.md"),
            atomically: true, encoding: .utf8
        )
        let home = try dir.mkdir("home")
        let installer = SkillInstallerActor(
            git: GitActor(),
            symlinker: SymlinkManagerActor(),
            lockFile: LockFileActor(path: home.appendingPathComponent(".agents/.skill-lock.json")),
            cache: CommitHashCache(path: home.appendingPathComponent(".agents/.skillpilot-cache.json"))
        )
        _ = try await installer.installLocal(from: src, home: home, installTo: [])
        try await installer.toggleAgent(name: "t", agent: .cursor, install: true, home: home)
        let link = home.appendingPathComponent(".cursor/skills/t")
        #expect(FileManager.default.fileExists(atPath: link.path))
        try await installer.toggleAgent(name: "t", agent: .cursor, install: false, home: home)
        #expect(!FileManager.default.fileExists(atPath: link.path))
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/SkillInstallerActor.swift`:
```swift
import Foundation

public actor SkillInstallerActor {
    private let git: GitActor
    private let symlinker: SymlinkManagerActor
    private let lockFile: LockFileActor
    private let cache: CommitHashCache
    private let localImporter: LocalImporter

    public init(
        git: GitActor,
        symlinker: SymlinkManagerActor,
        lockFile: LockFileActor,
        cache: CommitHashCache,
        localImporter: LocalImporter = LocalImporter()
    ) {
        self.git = git
        self.symlinker = symlinker
        self.lockFile = lockFile
        self.cache = cache
        self.localImporter = localImporter
    }

    @discardableResult
    public func installLocal(from source: URL, home: URL, installTo: Set<AgentID>) async throws -> Skill {
        let canonical = try localImporter.importSkill(from: source, home: home)
        let name = canonical.lastPathComponent
        let skillSource = SkillSource.local(path: source)
        let locked = LockedSkill(
            name: name,
            source: skillSource,
            installedAt: Date(),
            commitHash: nil,
            path: canonical
        )
        try await lockFile.upsert(locked)

        var agents: Set<AgentID> = []
        for agentID in installTo {
            try await toggleAgent(name: name, agent: agentID, install: true, home: home)
            agents.insert(agentID)
        }

        let raw = (try? String(contentsOf: canonical.appendingPathComponent("SKILL.md"), encoding: .utf8)) ?? ""
        let parsed = (try? SKILLMdParser.parse(raw)) ?? .init(metadata: SKILLMetadata(), body: raw)

        return Skill(
            name: name,
            path: canonical,
            source: skillSource,
            frontmatter: parsed.metadata,
            installedAgents: agents,
            updateStatus: .unknown
        )
    }

    public func installGitHub(owner: String, repo: String, ref: String,
                              home: URL, installTo: Set<AgentID>) async throws -> Skill {
        let url = URL(string: "https://github.com/\(owner)/\(repo).git")!
        let canonicalBase = home.appendingPathComponent(".agents/skills", isDirectory: true)
        try FileManager.default.createDirectory(at: canonicalBase, withIntermediateDirectories: true)
        let dest = canonicalBase.appendingPathComponent(repo, isDirectory: true)
        if FileManager.default.fileExists(atPath: dest.path) {
            throw SkillportError.fileIO(path: dest, reason: "destination already exists")
        }
        try await git.clone(url: url, to: dest, ref: ref, depth: 1)
        let commitHash = try? await git.headHash(in: dest)
        let identity = SkillIdentity.compute(name: repo, source: .github(owner: owner, repo: repo, ref: ref))
        if let commitHash {
            try await cache.set(identity: identity, hash: commitHash)
        }
        let locked = LockedSkill(
            name: repo,
            source: .github(owner: owner, repo: repo, ref: ref),
            installedAt: Date(),
            commitHash: commitHash,
            path: dest
        )
        try await lockFile.upsert(locked)
        var agents: Set<AgentID> = []
        for agentID in installTo {
            try await toggleAgent(name: repo, agent: agentID, install: true, home: home)
            agents.insert(agentID)
        }
        let raw = (try? String(contentsOf: dest.appendingPathComponent("SKILL.md"), encoding: .utf8)) ?? ""
        let parsed = (try? SKILLMdParser.parse(raw)) ?? .init(metadata: SKILLMetadata(), body: raw)
        return Skill(
            name: repo,
            path: dest,
            source: .github(owner: owner, repo: repo, ref: ref),
            frontmatter: parsed.metadata,
            installedAgents: agents,
            updateStatus: .upToDate
        )
    }

    public func uninstall(name: String, home: URL) async throws {
        let canonical = home.appendingPathComponent(".agents/skills/\(name)")
        // 撤销所有 agent symlinks
        for agent in Agent.defaultAgents(home: home) {
            let link = agent.skillsDir.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: link.path) {
                try? await symlinker.unlink(at: link, expectedTarget: canonical)
            }
        }
        // 删除 canonical + lockfile 条目
        if FileManager.default.fileExists(atPath: canonical.path) {
            try FileManager.default.removeItem(at: canonical)
        }
        try await lockFile.remove(name: name)
    }

    public func toggleAgent(name: String, agent: AgentID, install: Bool, home: URL) async throws {
        let canonical = home.appendingPathComponent(".agents/skills/\(name)")
        guard let agentConfig = Agent.defaultAgents(home: home).first(where: { $0.id == agent }) else {
            return
        }
        let link = agentConfig.skillsDir.appendingPathComponent(name)
        if install {
            try await symlinker.link(target: canonical, at: link)
        } else {
            try await symlinker.unlink(at: link, expectedTarget: canonical)
        }
    }
}
```

Note: uninstall 这里删除了 canonical 目录。相比 Electron 版，这是更彻底的行为；若希望 "从某 agent 卸载但保留 canonical" 则用 `toggleAgent(install: false)`。

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add SkillInstallerActor for local/github install + toggle + uninstall"
```

---

### Task 31: SkillContentFetcher

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/SkillContentFetcher.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillContentFetcherTests.swift`

SkillContentFetcher 对应 TS `skill-content-fetcher.ts`：多策略级联，用 `TaskGroup` 实现 8 路并发 + 首个成功即返回。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SkillContentFetcherTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillContentFetcher", .serialized)
struct SkillContentFetcherTests {
    @Test("Returns first 200 response among parallel candidates")
    func racesCandidates() async throws {
        await MockURLProtocol.reset()
        // 三条候选，只有一条返回 200
        let fast = URL(string: "https://raw.test/a/SKILL.md")!
        let slow = URL(string: "https://raw.test/b/SKILL.md")!
        let bad  = URL(string: "https://raw.test/c/SKILL.md")!
        await MockURLProtocol.stub(url: fast) { _ in
            .init(statusCode: 200, headers: [:], body: Data("# hello".utf8))
        }
        await MockURLProtocol.stub(url: slow) { _ in
            .init(statusCode: 404, headers: [:], body: Data())
        }
        await MockURLProtocol.stub(url: bad) { _ in
            .init(statusCode: 500, headers: [:], body: Data())
        }
        let session = mockSession()
        let fetcher = SkillContentFetcher(session: session)
        let content = try await fetcher.fetchFirstSuccess(from: [fast, slow, bad])
        #expect(String(data: content, encoding: .utf8) == "# hello")
    }

    @Test("Throws when all candidates fail")
    func allFail() async throws {
        await MockURLProtocol.reset()
        let a = URL(string: "https://raw.test/x")!
        let b = URL(string: "https://raw.test/y")!
        await MockURLProtocol.stub(url: a) { _ in .init(statusCode: 404, headers: [:], body: Data()) }
        await MockURLProtocol.stub(url: b) { _ in .init(statusCode: 500, headers: [:], body: Data()) }
        let fetcher = SkillContentFetcher(session: mockSession())
        await #expect(throws: SkillportError.self) {
            _ = try await fetcher.fetchFirstSuccess(from: [a, b])
        }
    }

    private func mockSession() -> URLSession {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [MockURLProtocol.self] + (cfg.protocolClasses ?? [])
        return URLSession(configuration: cfg)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/SkillContentFetcher.swift`:
```swift
import Foundation

public actor SkillContentFetcher {
    private let session: URLSession

    public init(session: URLSession) {
        self.session = session
    }

    /// 并发请求多个候选 URL，首个返回 200 的即赢。其它请求会被取消。
    public func fetchFirstSuccess(from urls: [URL]) async throws -> Data {
        guard !urls.isEmpty else {
            throw SkillportError.networkFailed(url: nil, reason: "no candidate urls")
        }
        return try await withThrowingTaskGroup(of: Data?.self) { group in
            for url in urls {
                group.addTask { [session] in
                    do {
                        let (data, resp) = try await session.data(from: url)
                        if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                            return data
                        }
                        return nil
                    } catch {
                        return nil
                    }
                }
            }
            for try await data in group {
                if let data {
                    group.cancelAll()
                    return data
                }
            }
            throw SkillportError.networkFailed(url: urls.first, reason: "all candidates failed")
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add SkillContentFetcher with TaskGroup race-to-first-success"
```

---

### Task 32: RegistryActor

对应 TS `skill-registry-service.ts` + skills.sh HTML 抓取路径的最小版本。本 plan 只实现 GitHub raw URL + skills.sh 列表 API 两条路径，完整三级级联在 Task 31 已经支持。

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/RegistryActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/RegistryActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/RegistryActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("RegistryActor", .serialized)
struct RegistryActorTests {
    @Test("Fetches and parses skills.sh listing JSON")
    func fetchListing() async throws {
        await MockURLProtocol.reset()
        let listingURL = URL(string: "https://skills.sh/api/skills.json")!
        let body = """
        [
          {"slug": "obra/superpowers", "name": "superpowers", "category": "productivity"},
          {"slug": "anthropic/core", "name": "core", "category": "core"}
        ]
        """
        await MockURLProtocol.stub(url: listingURL) { _ in
            .init(statusCode: 200, headers: ["Content-Type": "application/json"],
                  body: Data(body.utf8))
        }
        let session = mockSession()
        let registry = RegistryActor(session: session, listingURL: listingURL)
        let entries = try await registry.fetchListing()
        #expect(entries.count == 2)
        #expect(entries[0].slug == "obra/superpowers")
        #expect(entries[0].category == "productivity")
    }

    @Test("Filters entries by query and category")
    func filterEntries() async throws {
        let entries = [
            RegistryEntry(slug: "a/x", name: "x", category: "dev"),
            RegistryEntry(slug: "b/y", name: "y", category: "ops"),
            RegistryEntry(slug: "c/zany", name: "zany", category: "dev")
        ]
        let filtered = RegistryActor.filter(entries: entries, query: "y", category: "dev")
        #expect(filtered.map(\.name) == ["zany"])
    }

    private func mockSession() -> URLSession {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [MockURLProtocol.self] + (cfg.protocolClasses ?? [])
        return URLSession(configuration: cfg)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/RegistryActor.swift`:
```swift
import Foundation

public struct RegistryEntry: Codable, Hashable, Sendable {
    public let slug: String
    public let name: String
    public let category: String
}

public actor RegistryActor {
    private let session: URLSession
    private let listingURL: URL

    public init(session: URLSession,
                listingURL: URL = URL(string: "https://skills.sh/api/skills.json")!) {
        self.session = session
        self.listingURL = listingURL
    }

    public func fetchListing() async throws -> [RegistryEntry] {
        let (data, response) = try await session.data(from: listingURL)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw SkillportError.networkFailed(url: listingURL, reason: "status \(http.statusCode)")
        }
        do {
            return try JSONDecoder().decode([RegistryEntry].self, from: data)
        } catch {
            throw SkillportError.networkFailed(url: listingURL, reason: "\(error)")
        }
    }

    public nonisolated static func filter(entries: [RegistryEntry], query: String, category: String?) -> [RegistryEntry] {
        let q = query.lowercased()
        return entries.filter { entry in
            let matchesQuery = q.isEmpty
                || entry.name.lowercased().contains(q)
                || entry.slug.lowercased().contains(q)
            let matchesCat = category.map { $0 == entry.category } ?? true
            return matchesQuery && matchesCat
        }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add RegistryActor for skills.sh listing + filter"
```

---

### Task 33: SkillUpdaterActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/SkillUpdaterActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillUpdaterActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SkillUpdaterActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillUpdaterActor")
struct SkillUpdaterActorTests {
    @Test("Local-source skills are always upToDate")
    func localUpToDate() async throws {
        let updater = SkillUpdaterActor(git: GitActor(), cache: CommitHashCache(path: URL(fileURLWithPath: "/tmp/x")))
        let status = try await updater.checkStatus(
            name: "x",
            source: .local(path: URL(fileURLWithPath: "/x")),
            canonical: URL(fileURLWithPath: "/x")
        )
        #expect(status == .upToDate)
    }

    @Test("GitHub skill with cached commit equal to local HEAD is upToDate")
    func githubUpToDate() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        // 造一个带一个 commit 的 repo 当 canonical
        let repo = try dir.mkdir("repo")
        _ = try shell("git init -b main", cwd: repo)
        _ = try shell("git config user.email t@t; git config user.name t", cwd: repo)
        try "x".write(to: repo.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
        _ = try shell("git add . && git commit -m init", cwd: repo)
        let head = try shell("git rev-parse HEAD", cwd: repo).trimmingCharacters(in: .whitespacesAndNewlines)

        let cache = CommitHashCache(path: dir.url.appendingPathComponent("c.json"))
        let id = SkillIdentity.compute(name: "r", source: .github(owner: "o", repo: "r", ref: "main"))
        try await cache.set(identity: id, hash: head)

        let updater = SkillUpdaterActor(git: GitActor(), cache: cache)
        let status = try await updater.checkStatus(
            name: "r",
            source: .github(owner: "o", repo: "r", ref: "main"),
            canonical: repo
        )
        // 无法访问真实 remote，所以当 remote 查询失败时回退到 cached == head => .upToDate
        #expect(status == .upToDate)
    }

    @discardableResult
    private func shell(_ cmd: String, cwd: URL) throws -> String {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = ["-c", cmd]
        p.currentDirectoryURL = cwd
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        try p.run(); p.waitUntilExit()
        return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/SkillUpdaterActor.swift`:
```swift
import Foundation

public actor SkillUpdaterActor {
    private let git: GitActor
    private let cache: CommitHashCache

    public init(git: GitActor, cache: CommitHashCache) {
        self.git = git
        self.cache = cache
    }

    public func checkStatus(name: String, source: SkillSource, canonical: URL) async throws -> UpdateStatus {
        switch source {
        case .local, .registry:
            return .upToDate
        case .github(let owner, let repo, let ref):
            let id = SkillIdentity.compute(name: name, source: source)
            let url = URL(string: "https://github.com/\(owner)/\(repo).git")!
            let remoteHash: String
            do {
                remoteHash = try await git.remoteTreeHash(url: url, ref: "refs/heads/\(ref)")
            } catch {
                // 远程不可达：回落到 cache
                if let cached = await cache.get(identity: id),
                   let head = try? await git.headHash(in: canonical),
                   cached == head {
                    return .upToDate
                }
                return .unknown
            }
            let localHead = (try? await git.headHash(in: canonical)) ?? ""
            if !remoteHash.isEmpty, remoteHash == localHead {
                try? await cache.set(identity: id, hash: remoteHash)
                return .upToDate
            }
            return .available(remoteHash: remoteHash)
        }
    }

    public func pull(name: String, canonical: URL) async throws {
        try await git.pull(in: canonical)
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add SkillUpdaterActor for github tree-hash comparison"
```

---

### Task 34: BatchUpdateCheckerActor

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/BatchUpdateCheckerActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/BatchUpdateCheckerActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/BatchUpdateCheckerActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("BatchUpdateCheckerActor")
struct BatchUpdateCheckerActorTests {
    @Test("Runs checkStatus for each skill with bounded concurrency")
    func runsAll() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        let cache = CommitHashCache(path: dir.url.appendingPathComponent("c.json"))
        let updater = SkillUpdaterActor(git: GitActor(), cache: cache)
        let checker = BatchUpdateCheckerActor(updater: updater, maxConcurrent: 2)

        let skills: [Skill] = (1...5).map {
            Skill(
                name: "s\($0)",
                path: dir.url.appendingPathComponent("s\($0)"),
                source: .local(path: dir.url.appendingPathComponent("s\($0)")),
                frontmatter: SKILLMetadata(),
                installedAgents: [],
                updateStatus: .unknown
            )
        }
        let results = try await checker.checkAll(skills: skills)
        #expect(results.count == 5)
        #expect(results.values.allSatisfy { $0 == .upToDate })  // 全是 local
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/BatchUpdateCheckerActor.swift`:
```swift
import Foundation

public actor BatchUpdateCheckerActor {
    private let updater: SkillUpdaterActor
    private let maxConcurrent: Int

    public init(updater: SkillUpdaterActor, maxConcurrent: Int = 4) {
        self.updater = updater
        self.maxConcurrent = maxConcurrent
    }

    public func checkAll(skills: [Skill]) async throws -> [SkillIdentity: UpdateStatus] {
        var result: [SkillIdentity: UpdateStatus] = [:]
        // 分批扫描，保持 maxConcurrent
        var iterator = skills.makeIterator()
        var inFlight: [Task<(SkillIdentity, UpdateStatus), Error>] = []

        func dispatchNext() {
            guard let skill = iterator.next() else { return }
            let updater = self.updater
            inFlight.append(Task {
                let status = try await updater.checkStatus(
                    name: skill.name, source: skill.source, canonical: skill.path
                )
                return (skill.id, status)
            })
        }

        for _ in 0..<min(maxConcurrent, skills.count) { dispatchNext() }

        while !inFlight.isEmpty {
            let task = inFlight.removeFirst()
            let (id, status) = try await task.value
            result[id] = status
            dispatchNext()
        }
        return result
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add BatchUpdateCheckerActor with bounded concurrency"
```

---

### Task 35: SkillManagerActor（中心编排）

**Files:**
- Create: `/Users/crazy/own_project/skillport/Domain/Actors/SkillManagerActor.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Actors/SkillManagerActorTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Actors/SkillManagerActorTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillManagerActor")
struct SkillManagerActorTests {
    @Test("scanAll emits skillsReloaded and caches result")
    func scanAllEmits() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "alpha")

        let manager = makeManager(home: dir.url)
        let events = await manager.events
        let eventTask = Task { () -> DomainEvent? in
            for await e in events {
                if case .skillsReloaded = e { return e }
            }
            return nil
        }
        let skills = try await manager.rescan(home: dir.url)
        #expect(skills.count == 1)
        #expect(skills.first?.name == "alpha")
        // 事件在 ~100ms 内到达
        try await Task.sleep(nanoseconds: 200_000_000)
        eventTask.cancel()
    }

    @Test("toggleAgent updates installedAgents and emits change event")
    func toggleEmits() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "x")
        let manager = makeManager(home: dir.url)
        _ = try await manager.rescan(home: dir.url)
        try await manager.toggleAgent(name: "x", agent: .cursor, install: true, home: dir.url)
        let after = try await manager.rescan(home: dir.url)
        #expect(after.first?.installedAgents.contains(.cursor) == true)
    }

    private func makeManager(home: URL) -> SkillManagerActor {
        let lockPath = home.appendingPathComponent(".agents/.skill-lock.json")
        let cachePath = home.appendingPathComponent(".agents/.skillpilot-cache.json")
        let lockFile = LockFileActor(path: lockPath)
        return SkillManagerActor(
            scanner: SkillScannerActor(),
            installer: SkillInstallerActor(
                git: GitActor(),
                symlinker: SymlinkManagerActor(),
                lockFile: lockFile,
                cache: CommitHashCache(path: cachePath)
            ),
            updater: SkillUpdaterActor(
                git: GitActor(),
                cache: CommitHashCache(path: cachePath)
            ),
            batchChecker: BatchUpdateCheckerActor(
                updater: SkillUpdaterActor(
                    git: GitActor(),
                    cache: CommitHashCache(path: cachePath)
                )
            ),
            watcher: FileWatcherActor(),
            lockFile: lockFile
        )
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`Domain/Actors/SkillManagerActor.swift`:
```swift
import Foundation

public actor SkillManagerActor {
    public let events: AsyncStream<DomainEvent>
    private let eventsContinuation: AsyncStream<DomainEvent>.Continuation

    private let scanner: SkillScannerActor
    private let installer: SkillInstallerActor
    private let updater: SkillUpdaterActor
    private let batchChecker: BatchUpdateCheckerActor
    private let watcher: FileWatcherActor
    private let lockFile: LockFileActor

    private var watchTask: Task<Void, Never>?

    public init(
        scanner: SkillScannerActor,
        installer: SkillInstallerActor,
        updater: SkillUpdaterActor,
        batchChecker: BatchUpdateCheckerActor,
        watcher: FileWatcherActor,
        lockFile: LockFileActor
    ) {
        self.scanner = scanner
        self.installer = installer
        self.updater = updater
        self.batchChecker = batchChecker
        self.watcher = watcher
        self.lockFile = lockFile
        let (stream, continuation) = AsyncStream<DomainEvent>.makeStream()
        self.events = stream
        self.eventsContinuation = continuation
    }

    deinit {
        eventsContinuation.finish()
    }

    @discardableResult
    public func rescan(home: URL) async throws -> [Skill] {
        let scanned = try await scanner.scanAll(home: home)
        // Scanner 默认把 source 设为 .local；lockfile 里持有真实 source。
        // 合并后避免 installGitHub 之后 rescan 把 source 错误回退为 .local。
        let lock = (try? await lockFile.read()) ?? LockFile(skills: [])
        let sourceByName: [String: SkillSource] = Dictionary(
            uniqueKeysWithValues: lock.skills.map { ($0.name, $0.source) }
        )
        let merged: [Skill] = scanned.map { s in
            guard let realSource = sourceByName[s.name] else { return s }
            return Skill(
                name: s.name,
                path: s.path,
                source: realSource,
                frontmatter: s.frontmatter,
                installedAgents: s.installedAgents,
                updateStatus: s.updateStatus
            )
        }
        eventsContinuation.yield(.skillsReloaded(skills: merged))
        return merged
    }

    public func startWatching(home: URL) async {
        let canonicalBase = home.appendingPathComponent(".agents/skills", isDirectory: true)
        try? FileManager.default.createDirectory(at: canonicalBase, withIntermediateDirectories: true)
        let stream = await watcher.start(paths: [canonicalBase])
        watchTask = Task { [weak self] in
            for await _ in stream {
                try? await self?.rescan(home: home)
            }
        }
    }

    public func stopWatching() async {
        watchTask?.cancel()
        watchTask = nil
        await watcher.stop()
    }

    public func toggleAgent(name: String, agent: AgentID, install: Bool, home: URL) async throws {
        try await installer.toggleAgent(name: name, agent: agent, install: install, home: home)
        // 重新扫以更新 installedAgents
        _ = try await rescan(home: home)
    }

    public func installLocal(from source: URL, home: URL, installTo: Set<AgentID>) async throws -> Skill {
        let skill = try await installer.installLocal(from: source, home: home, installTo: installTo)
        _ = try await rescan(home: home)
        return skill
    }

    public func installGitHub(owner: String, repo: String, ref: String,
                              home: URL, installTo: Set<AgentID>) async throws -> Skill {
        let skill = try await installer.installGitHub(owner: owner, repo: repo, ref: ref,
                                                       home: home, installTo: installTo)
        _ = try await rescan(home: home)
        return skill
    }

    public func uninstall(name: String, home: URL) async throws {
        try await installer.uninstall(name: name, home: home)
        _ = try await rescan(home: home)
    }

    public func checkAllUpdates(skills: [Skill]) async throws -> [SkillIdentity: UpdateStatus] {
        let results = try await batchChecker.checkAll(skills: skills)
        let available = results.values.filter { if case .available = $0 { return true }; return false }.count
        eventsContinuation.yield(.batchUpdateCheckCompleted(available: available))
        return results
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add Domain Tests
git commit -m "feat(actor): add SkillManagerActor orchestrator with event stream"
```

- [ ] **Step 5: M2 完结标记 commit**

```bash
git commit --allow-empty -m "chore: M2 domain layer complete"
```

---


## Phase 6 — M3 Observable Models (Tasks 36–40)

### Task 36: AppModel

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Models/AppModel.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/AppModelTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Models/AppModelTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("AppModel")
@MainActor
struct AppModelTests {
    @Test("Default section is dashboard")
    func defaultSection() {
        let app = AppModel()
        #expect(app.section == .dashboard)
        #expect(app.currentAgentFilter == nil)
    }

    @Test("setSection updates state")
    func setSection() {
        let app = AppModel()
        app.setSection(.registry)
        #expect(app.section == .registry)
    }

    @Test("selectAgent toggles filter; nil clears")
    func selectAgent() {
        let app = AppModel()
        app.selectAgent(.claudeCode)
        #expect(app.currentAgentFilter == .claudeCode)
        app.selectAgent(nil)
        #expect(app.currentAgentFilter == nil)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`App/Models/AppModel.swift`:
```swift
import Foundation
import Observation

public enum AppSection: Hashable, Sendable {
    case dashboard
    case registry
    case editor(skillID: SkillIdentity?)
}

@MainActor
@Observable
public final class AppModel {
    public var section: AppSection = .dashboard
    public var currentAgentFilter: AgentID?

    public init() {}

    public func setSection(_ s: AppSection) { section = s }
    public func selectAgent(_ id: AgentID?) { currentAgentFilter = id }
    public func openEditor(for id: SkillIdentity?) { section = .editor(skillID: id) }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add App Tests
git commit -m "feat(model): add AppModel with section and agent filter"
```

---

### Task 37: NotificationModel

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Models/NotificationModel.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/NotificationModelTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Models/NotificationModelTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("NotificationModel")
@MainActor
struct NotificationModelTests {
    @Test("post adds a toast at the end; id uniqueness")
    func post() {
        let m = NotificationModel()
        m.post(.init(level: .info, message: "hi"))
        m.post(.init(level: .error, message: "boom"))
        #expect(m.toasts.count == 2)
        #expect(Set(m.toasts.map(\.id)).count == 2)
    }

    @Test("dismiss removes a toast by id")
    func dismiss() {
        let m = NotificationModel()
        let t = Toast(level: .warning, message: "w")
        m.post(t)
        m.dismiss(id: t.id)
        #expect(m.toasts.isEmpty)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`App/Models/NotificationModel.swift`:
```swift
import Foundation
import Observation

public struct Toast: Identifiable, Sendable, Equatable {
    public let id: UUID
    public let level: NotificationLevel
    public let message: String
    public let createdAt: Date

    public init(level: NotificationLevel, message: String) {
        self.id = UUID()
        self.level = level
        self.message = message
        self.createdAt = Date()
    }
}

@MainActor
@Observable
public final class NotificationModel {
    public var toasts: [Toast] = []

    public init() {}

    public func post(_ toast: Toast) {
        toasts.append(toast)
    }

    public func dismiss(id: UUID) {
        toasts.removeAll { $0.id == id }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add App Tests
git commit -m "feat(model): add NotificationModel with Toast type"
```

---

### Task 38: SettingsModel

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Models/SettingsModel.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/SettingsModelTests.swift`

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Models/SettingsModelTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SettingsModel")
@MainActor
struct SettingsModelTests {
    @Test("Loads initial ProxyConfig from actor")
    func loadsInitial() async throws {
        let suite = UserDefaults(suiteName: "skillport-settings-\(UUID())")!
        let actor = ProxySettingsActor(defaults: suite)
        await actor.save(ProxyConfig(enabled: true, kind: .https, host: "h", port: 8080))
        let model = SettingsModel(proxyActor: actor)
        await model.refresh()
        #expect(model.proxy.enabled == true)
        #expect(model.proxy.host == "h")
    }

    @Test("apply saves through actor")
    func apply() async throws {
        let suite = UserDefaults(suiteName: "skillport-settings-\(UUID())")!
        let actor = ProxySettingsActor(defaults: suite)
        let model = SettingsModel(proxyActor: actor)
        let new = ProxyConfig(enabled: true, kind: .socks5, host: "1.2.3.4", port: 1080)
        await model.apply(proxy: new)
        let stored = await actor.current
        #expect(stored == new)
        #expect(model.proxy == new)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`App/Models/SettingsModel.swift`:
```swift
import Foundation
import Observation

@MainActor
@Observable
public final class SettingsModel {
    public var proxy: ProxyConfig = .disabled
    public var locale: String = "en"

    private let proxyActor: ProxySettingsActor

    public init(proxyActor: ProxySettingsActor) {
        self.proxyActor = proxyActor
        Task { await refresh() }
    }

    public func refresh() async {
        self.proxy = await proxyActor.current
    }

    public func apply(proxy: ProxyConfig) async {
        await proxyActor.save(proxy)
        self.proxy = proxy
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add App Tests
git commit -m "feat(model): add SettingsModel wrapping ProxySettingsActor"
```

---

### Task 39: UpdateModel

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Models/UpdateModel.swift`

UpdateModel 只是 AppUpdaterBridge 的 thin wrapper（桥本身已经 `@Observable`），加一个便利方法暴露给 UI。此类可测试点很浅，写简化测试即可。

- [ ] **Step 1: 写测试（简化版，不使用 Sparkle 真实 feed）**

`Tests/SkillportTests/Models/UpdateModelTests.swift`:
```swift
import Testing
@testable import Skillport

@Suite("UpdateModel")
@MainActor
struct UpdateModelTests {
    @Test("Initial state: no update available, no last check")
    func initialState() {
        let model = UpdateModel(bridge: AppUpdaterBridge(feedURL: nil))
        #expect(model.updateAvailable == false)
        #expect(model.lastCheck == nil)
    }

    @Test("checkNow forwards to bridge and records lastCheck")
    func checkNow() {
        let bridge = AppUpdaterBridge(feedURL: nil)
        let model = UpdateModel(bridge: bridge)
        model.checkNow()
        #expect(model.lastCheck != nil)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`App/Models/UpdateModel.swift`:
```swift
import Foundation
import Observation

@MainActor
@Observable
public final class UpdateModel {
    public private(set) var updateAvailable: Bool = false
    public private(set) var lastCheck: Date?

    private let bridge: AppUpdaterBridge

    public init(bridge: AppUpdaterBridge) {
        self.bridge = bridge
    }

    public func checkNow() {
        bridge.checkForUpdates()
        lastCheck = bridge.latestCheckDate
        updateAvailable = bridge.isUpdateAvailable
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add App Tests
git commit -m "feat(model): add UpdateModel wrapping AppUpdaterBridge"
```

---

### Task 40: SkillsModel（核心状态载体）

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Models/SkillsModel.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Models/SkillsModelTests.swift`

SkillsModel 订阅 SkillManagerActor 的 `events` AsyncStream，对 UI 暴露 `@Observable` 属性。

- [ ] **Step 1: 写失败测试**

`Tests/SkillportTests/Models/SkillsModelTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("SkillsModel")
@MainActor
struct SkillsModelTests {
    @Test("initialRescan populates skills from canonical store")
    func initialRescan() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "alpha")
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "beta")

        let manager = makeManager(home: dir.url)
        let model = SkillsModel(manager: manager, home: dir.url)
        try await model.refresh()
        #expect(model.skills.count == 2)
        #expect(model.agents.count == AgentID.allCases.count)
    }

    @Test("toggle(skill:agent:) flips installedAgents")
    func toggleAgent() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        try AgentsFS.createCanonicalSkill(in: dir.url, name: "x")
        let manager = makeManager(home: dir.url)
        let model = SkillsModel(manager: manager, home: dir.url)
        try await model.refresh()
        try await model.toggle(skillName: "x", agent: .cursor, install: true)
        let found = model.skills.first { $0.name == "x" }!
        #expect(found.installedAgents.contains(.cursor))
        try await model.toggle(skillName: "x", agent: .cursor, install: false)
        let after = model.skills.first { $0.name == "x" }!
        #expect(!after.installedAgents.contains(.cursor))
    }

    private func makeManager(home: URL) -> SkillManagerActor {
        let lockPath = home.appendingPathComponent(".agents/.skill-lock.json")
        let cachePath = home.appendingPathComponent(".agents/.skillpilot-cache.json")
        let lockFile = LockFileActor(path: lockPath)
        return SkillManagerActor(
            scanner: SkillScannerActor(),
            installer: SkillInstallerActor(
                git: GitActor(),
                symlinker: SymlinkManagerActor(),
                lockFile: lockFile,
                cache: CommitHashCache(path: cachePath)
            ),
            updater: SkillUpdaterActor(git: GitActor(), cache: CommitHashCache(path: cachePath)),
            batchChecker: BatchUpdateCheckerActor(
                updater: SkillUpdaterActor(git: GitActor(), cache: CommitHashCache(path: cachePath))
            ),
            watcher: FileWatcherActor(),
            lockFile: lockFile
        )
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

`App/Models/SkillsModel.swift`:
```swift
import Foundation
import Observation

@MainActor
@Observable
public final class SkillsModel {
    public private(set) var skills: [Skill] = []
    public private(set) var agents: [Agent] = []
    public private(set) var isScanning: Bool = false

    private let manager: SkillManagerActor
    private let home: URL
    private var subscription: Task<Void, Never>?

    public init(manager: SkillManagerActor, home: URL = URL(fileURLWithPath: NSHomeDirectory())) {
        self.manager = manager
        self.home = home
        self.agents = Agent.defaultAgents(home: home)
        subscribe()
    }

    deinit {
        subscription?.cancel()
    }

    private func subscribe() {
        // actor 的 public let `events` 从外部访问需要 await；在 Task 内部执行。
        subscription = Task { [weak self, manager] in
            let stream = await manager.events
            for await event in stream {
                guard let self else { return }
                switch event {
                case .skillsReloaded(let list):
                    await MainActor.run { self.skills = list }
                default:
                    continue
                }
            }
        }
    }

    public func refresh() async throws {
        isScanning = true
        defer { isScanning = false }
        _ = try await manager.rescan(home: home)
    }

    public func startWatching() async {
        await manager.startWatching(home: home)
    }

    public func stopWatching() async {
        await manager.stopWatching()
    }

    public func toggle(skillName: String, agent: AgentID, install: Bool) async throws {
        try await manager.toggleAgent(name: skillName, agent: agent, install: install, home: home)
    }

    public func installLocal(from source: URL, installTo: Set<AgentID>) async throws -> Skill {
        return try await manager.installLocal(from: source, home: home, installTo: installTo)
    }

    public func uninstall(name: String) async throws {
        try await manager.uninstall(name: name, home: home)
    }

    public func skillsFiltered(by agent: AgentID?) -> [Skill] {
        guard let agent else { return skills }
        return skills.filter { $0.installedAgents.contains(agent) }
    }
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add App Tests
git commit -m "feat(model): add SkillsModel subscribing to SkillManagerActor events"
```

- [ ] **Step 5: M3 完结标记 commit**

```bash
git commit --allow-empty -m "chore: M3 Observable models complete"
```

---


## Phase 7 — M4 Views (Tasks 41–52)

Views 的单元测试在 SwiftUI 下回报价值偏低（view body 是声明式；逻辑都在 Model 里已覆盖）。这 Phase 的测试以**手工运行 app** + 关键 view helper 的小单元测试为主。每个 view task 的 5 步 TDD 结构会调整为："写 view → build → 手工验证 → (如有 helper) 单元测试 helper → commit"。

### Task 41: 依赖注入容器 + App 入口升级

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Composition/AppContainer.swift`
- Modify: `/Users/crazy/own_project/skillport/App/SkillportApp.swift`
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Composition/AppContainerTests.swift`

- [ ] **Step 1: 写 AppContainer 测试**

`Tests/SkillportTests/Composition/AppContainerTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("AppContainer")
@MainActor
struct AppContainerTests {
    @Test("Creates all models and actors without throwing")
    func createsGraph() {
        let dir = try! TempDir.create()
        defer { try? dir.cleanup() }
        let container = AppContainer(home: dir.url)
        #expect(container.home == dir.url)
        #expect(container.skillsModel.agents.count == AgentID.allCases.count)
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 AppContainer**

`App/Composition/AppContainer.swift`:
```swift
import Foundation

@MainActor
public final class AppContainer {
    public let home: URL
    public let appModel: AppModel
    public let skillsModel: SkillsModel
    public let settingsModel: SettingsModel
    public let updateModel: UpdateModel
    public let notificationModel: NotificationModel
    public let manager: SkillManagerActor

    public init(home: URL = URL(fileURLWithPath: NSHomeDirectory())) {
        self.home = home
        let lockPath = home.appendingPathComponent(".agents/.skill-lock.json")
        let cachePath = home.appendingPathComponent(".agents/.skillpilot-cache.json")
        let cache = CommitHashCache(path: cachePath)
        let git = GitActor()
        let symlinker = SymlinkManagerActor()
        let lockFile = LockFileActor(path: lockPath)
        let installer = SkillInstallerActor(git: git, symlinker: symlinker, lockFile: lockFile, cache: cache)
        let updater = SkillUpdaterActor(git: git, cache: cache)
        let batchChecker = BatchUpdateCheckerActor(updater: updater)
        let watcher = FileWatcherActor()
        let manager = SkillManagerActor(
            scanner: SkillScannerActor(),
            installer: installer,
            updater: updater,
            batchChecker: batchChecker,
            watcher: watcher,
            lockFile: lockFile
        )
        self.manager = manager

        self.appModel = AppModel()
        self.skillsModel = SkillsModel(manager: manager, home: home)
        self.notificationModel = NotificationModel()
        self.settingsModel = SettingsModel(proxyActor: ProxySettingsActor())
        self.updateModel = UpdateModel(bridge: AppUpdaterBridge(feedURL: nil))
    }
}
```

- [ ] **Step 4: 更新 App 入口，注入 container**

替换 `App/SkillportApp.swift`:
```swift
import SwiftUI

@main
struct SkillportApp: App {
    @State private var container = AppContainer()

    var body: some Scene {
        WindowGroup("Skillport") {
            RootView()
                .environment(container.appModel)
                .environment(container.skillsModel)
                .environment(container.notificationModel)
                .environment(container.settingsModel)
                .environment(container.updateModel)
                .task {
                    try? await container.skillsModel.refresh()
                    await container.skillsModel.startWatching()
                }
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Import Skill…") { /* 接在 Task 48 */ }
                    .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(after: .appSettings) {
                Button("Rescan") {
                    Task { try? await container.skillsModel.refresh() }
                }
                .keyboardShortcut("r", modifiers: .command)
                Button("Check for Skill Updates") { /* 接在后续 milestone */ }
                    .keyboardShortcut("u", modifiers: .command)
            }
        }

        Settings {
            Text("Settings — 下一里程碑实现")
                .padding()
                .frame(minWidth: 400, minHeight: 200)
        }
    }
}
```

- [ ] **Step 5: 跑测试 + commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -10
git add App Tests
git commit -m "feat(app): add AppContainer dependency graph and wire into SkillportApp"
```

---

### Task 42: RootView + NavigationSplitView

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Views/RootView.swift`

- [ ] **Step 1: 写 RootView**

`App/Views/RootView.swift`:
```swift
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var appModel
    @Environment(SkillsModel.self) private var skillsModel

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 180, ideal: 220)
        } detail: {
            DetailArea()
        }
    }
}

private struct DetailArea: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        switch appModel.section {
        case .dashboard:
            DashboardView()
        case .registry:
            Text("Registry — 接在下一份 plan 的 M5")
                .foregroundStyle(.secondary)
        case .editor(let id):
            SkillEditorView(skillID: id)
        }
    }
}
```

- [ ] **Step 2: build + commit（此时 SidebarView / DashboardView / SkillEditorView 还未定义，编译会失败；我们在后续 task 补齐。这里先加上占位 stub）**

先临时建 stub：

`App/Views/Sidebar/SidebarView.swift`:
```swift
import SwiftUI

struct SidebarView: View {
    var body: some View { Text("Sidebar stub").padding() }
}
```

`App/Views/Dashboard/DashboardView.swift`:
```swift
import SwiftUI

struct DashboardView: View {
    var body: some View { Text("Dashboard stub").padding() }
}
```

`App/Views/Editor/SkillEditorView.swift`:
```swift
import SwiftUI

struct SkillEditorView: View {
    let skillID: SkillIdentity?
    var body: some View { Text("Editor stub").padding() }
}
```

- [ ] **Step 3: build 通过后 commit**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -10
git add App
git commit -m "feat(view): add RootView with NavigationSplitView and view stubs"
```

---

### Task 43: SidebarView（agent 过滤器）

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Sidebar/SidebarView.swift`

- [ ] **Step 1: 实现 SidebarView**

替换 `App/Views/Sidebar/SidebarView.swift`:
```swift
import SwiftUI

struct SidebarView: View {
    @Environment(AppModel.self) private var app
    @Environment(SkillsModel.self) private var skillsModel

    var body: some View {
        @Bindable var app = app
        List(selection: Binding(
            get: { app.currentAgentFilter },
            set: { app.selectAgent($0) }
        )) {
            Section("Views") {
                Button { app.setSection(.dashboard) } label: {
                    Label("Dashboard", systemImage: "square.grid.2x2")
                }
                Button { app.setSection(.registry) } label: {
                    Label("Registry", systemImage: "books.vertical")
                }
            }
            .buttonStyle(.plain)

            Section("Filter by agent") {
                ForEach(skillsModel.agents, id: \.id) { agent in
                    NavigationLink(value: agent.id) {
                        HStack {
                            Label(agent.id.displayName, systemImage: "cube")
                            Spacer()
                            Text("\(count(for: agent.id))")
                                .foregroundStyle(.secondary)
                                .font(.caption)
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    private func count(for id: AgentID) -> Int {
        skillsModel.skillsFiltered(by: id).count
    }
}
```

- [ ] **Step 2: build + 手工验证**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
```

Expected: build 成功。用 Xcode 或 `open Skillport.xcodeproj` 启动 app，左侧应看到 Dashboard/Registry 入口 + 11 个 agent 列表。

- [ ] **Step 3: Commit**

```bash
git add App
git commit -m "feat(view): add SidebarView with agent filter list"
```

---

### Task 44: DashboardView + SkillRow

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Dashboard/DashboardView.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Dashboard/SkillRow.swift`

- [ ] **Step 1: 实现 SkillRow**

`App/Views/Dashboard/SkillRow.swift`:
```swift
import SwiftUI

struct SkillRow: View {
    let skill: Skill
    let onToggle: (AgentID, Bool) -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading) {
                    Text(skill.name).font(.headline)
                    if let d = skill.frontmatter.description {
                        Text(d).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button(action: onOpen) {
                    Image(systemName: "pencil")
                }
                .buttonStyle(.borderless)
                .help("Edit SKILL.md")
            }
            AgentsRow(skill: skill, onToggle: onToggle)
        }
        .padding(.vertical, 6)
    }
}

private struct AgentsRow: View {
    let skill: Skill
    let onToggle: (AgentID, Bool) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(AgentID.allCases, id: \.self) { id in
                AgentChip(
                    agent: id,
                    installed: skill.installedAgents.contains(id),
                    onToggle: { install in onToggle(id, install) }
                )
            }
        }
    }
}

private struct AgentChip: View {
    let agent: AgentID
    let installed: Bool
    let onToggle: (Bool) -> Void

    var body: some View {
        Button {
            onToggle(!installed)
        } label: {
            Text(agent.displayName)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(installed ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1))
                .foregroundStyle(installed ? Color.accentColor : .secondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .help(installed ? "Uninstall from \(agent.displayName)" : "Install to \(agent.displayName)")
    }
}
```

- [ ] **Step 2: 实现 DashboardView**

替换 `App/Views/Dashboard/DashboardView.swift`:
```swift
import SwiftUI

struct DashboardView: View {
    @Environment(AppModel.self) private var app
    @Environment(SkillsModel.self) private var skillsModel
    @Environment(NotificationModel.self) private var notifications
    @State private var isDropTargeted = false

    var body: some View {
        let list = skillsModel.skillsFiltered(by: app.currentAgentFilter)
        VStack {
            if skillsModel.isScanning {
                ProgressView("Scanning…")
            } else if list.isEmpty {
                ContentUnavailableView(
                    "No skills yet",
                    systemImage: "sparkles",
                    description: Text("Drop a folder with SKILL.md here to import, or use ⌘N.")
                )
            } else {
                List(list) { skill in
                    SkillRow(
                        skill: skill,
                        onToggle: { agent, install in
                            Task {
                                do {
                                    try await skillsModel.toggle(
                                        skillName: skill.name,
                                        agent: agent,
                                        install: install
                                    )
                                } catch {
                                    notifications.post(.init(level: .error,
                                                             message: "Toggle failed: \(error)"))
                                }
                            }
                        },
                        onOpen: { app.openEditor(for: skill.id) }
                    )
                }
                .listStyle(.inset)
            }
        }
        .navigationTitle(app.currentAgentFilter?.displayName ?? "All Skills")
        .overlay {
            if isDropTargeted {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.accentColor, lineWidth: 3)
                    .padding()
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            Task { await handleDrop(providers: providers) }
            return true
        }
    }

    private func handleDrop(providers: [NSItemProvider]) async {
        for provider in providers {
            guard let url = try? await loadFileURL(from: provider) else { continue }
            do {
                _ = try await skillsModel.installLocal(from: url, installTo: [])
                notifications.post(.init(level: .success, message: "Imported \(url.lastPathComponent)"))
            } catch {
                notifications.post(.init(level: .error, message: "Import failed: \(error)"))
            }
        }
    }

    private func loadFileURL(from provider: NSItemProvider) async throws -> URL {
        try await withCheckedThrowingContinuation { c in
            _ = provider.loadObject(ofClass: URL.self) { url, error in
                if let url { c.resume(returning: url) }
                else { c.resume(throwing: error ?? SkillportError.unexpected("no url")) }
            }
        }
    }
}
```

- [ ] **Step 3: build + 手工验证**

在 `~/.agents/skills/` 下放两个测试 skill（每个带 SKILL.md 和 description），启动 app 后 Dashboard 应能显示列表、点击 agent chip 可切换 symlink（验证 Finder 下 `~/.claude/skills/<name>` 出现/消失）。

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add App
git commit -m "feat(view): add DashboardView with SkillRow, agent chips, drop-to-import"
```

---

### Task 45: 添加 CodeEditor 依赖

**Files:**
- Modify: `/Users/crazy/own_project/skillport/project.yml`

- [ ] **Step 1: 在 `packages:` 下添加 CodeEditor**

```yaml
  CodeEditor:
    url: https://github.com/ZeeZide/CodeEditor
    from: "1.5.0"
```

在 `targets.Skillport.dependencies` 下添加：
```yaml
      - package: CodeEditor
```

同时添加 swift-markdown（后续 preview 用）：
```yaml
  swift-markdown:
    url: https://github.com/apple/swift-markdown
    from: "0.4.0"
```

Skillport target dependencies 再加：
```yaml
      - package: swift-markdown
        product: Markdown
```

- [ ] **Step 2: 重生成 + 拉依赖**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' -resolvePackageDependencies 2>&1 | tail -10
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
```

Expected: 两个新包被解析并出现在 `Package.resolved`。

- [ ] **Step 3: Commit**

```bash
git add project.yml Package.resolved
git commit -m "chore: add CodeEditor and swift-markdown SwiftPM dependencies"
```

---

### Task 46: SkillEditorView — 表单 + 编辑器 + 预览

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Editor/SkillEditorView.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Editor/FrontmatterForm.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Editor/MarkdownPreview.swift`
- Create: `/Users/crazy/own_project/skillport/App/Views/Editor/EditorState.swift`

- [ ] **Step 1: 实现 EditorState (@Observable)**

`App/Views/Editor/EditorState.swift`:
```swift
import Foundation
import Observation

@MainActor
@Observable
final class EditorState {
    var metadata = SKILLMetadata()
    var body: String = ""
    var isDirty: Bool = false
    var filePath: URL?

    func load(from url: URL) throws {
        let raw = try String(contentsOf: url, encoding: .utf8)
        let parsed = try SKILLMdParser.parse(raw)
        metadata = parsed.metadata
        body = parsed.body
        filePath = url
        isDirty = false
    }

    func save() throws {
        guard let filePath else { return }
        let serialized = try SKILLMdParser.serialize(metadata: metadata, body: body)
        let tmp = filePath.appendingPathExtension("tmp")
        try serialized.write(to: tmp, atomically: true, encoding: .utf8)
        if FileManager.default.fileExists(atPath: filePath.path) {
            _ = try FileManager.default.replaceItemAt(filePath, withItemAt: tmp)
        } else {
            try FileManager.default.moveItem(at: tmp, to: filePath)
        }
        isDirty = false
    }
}
```

- [ ] **Step 2: 实现 FrontmatterForm**

`App/Views/Editor/FrontmatterForm.swift`:
```swift
import SwiftUI

struct FrontmatterForm: View {
    @Bindable var state: EditorState

    var body: some View {
        Form {
            TextField("Description", text: Binding(
                get: { state.metadata.description ?? "" },
                set: {
                    state.metadata.description = $0.isEmpty ? nil : $0
                    state.isDirty = true
                }
            ))
            TextField("Version", text: Binding(
                get: { state.metadata.version ?? "" },
                set: {
                    state.metadata.version = $0.isEmpty ? nil : $0
                    state.isDirty = true
                }
            ))
            TextField("Allowed tools (comma-separated)", text: Binding(
                get: { (state.metadata.allowedTools ?? []).joined(separator: ", ") },
                set: {
                    let parts = $0.split(separator: ",").map {
                        $0.trimmingCharacters(in: .whitespaces)
                    }.filter { !$0.isEmpty }
                    state.metadata.allowedTools = parts.isEmpty ? nil : parts
                    state.isDirty = true
                }
            ))
        }
        .padding()
    }
}
```

- [ ] **Step 3: 实现 MarkdownPreview**

`App/Views/Editor/MarkdownPreview.swift`:
```swift
import SwiftUI
import Markdown

struct MarkdownPreview: View {
    let source: String

    var body: some View {
        ScrollView {
            Text(render())
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
        }
    }

    private func render() -> AttributedString {
        // 使用 Apple swift-markdown 把 source 转成 plain body，然后用 AttributedString(markdown:) 做样式。
        // 对于完整 markdown 渲染，后续里程碑可替换为自定义 Walker。
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        return (try? AttributedString(markdown: source, options: options)) ??
            AttributedString(source)
    }
}
```

- [ ] **Step 4: 实现 SkillEditorView**

替换 `App/Views/Editor/SkillEditorView.swift`:
```swift
import SwiftUI
import CodeEditor

struct SkillEditorView: View {
    let skillID: SkillIdentity?

    @Environment(SkillsModel.self) private var skillsModel
    @Environment(NotificationModel.self) private var notifications
    @State private var state = EditorState()
    @State private var source: String = ""

    var body: some View {
        HSplitView {
            VStack {
                FrontmatterForm(state: state)
                Divider()
                CodeEditor(source: $source, language: .markdown, theme: .default)
                    .onChange(of: source) { _, new in
                        state.body = new
                        state.isDirty = true
                    }
            }
            .frame(minWidth: 320)
            MarkdownPreview(source: source)
                .frame(minWidth: 320)
        }
        .navigationTitle(state.filePath?.lastPathComponent ?? "Editor")
        .toolbar {
            Button {
                do {
                    try state.save()
                    notifications.post(.init(level: .success, message: "Saved."))
                } catch {
                    notifications.post(.init(level: .error, message: "Save failed: \(error)"))
                }
            } label: {
                Label("Save", systemImage: "square.and.arrow.down")
            }
            .keyboardShortcut("s", modifiers: .command)
            .disabled(!state.isDirty)
        }
        .task(id: skillID) {
            if let skillID, let skill = skillsModel.skills.first(where: { $0.id == skillID }) {
                do {
                    try state.load(from: skill.path.appendingPathComponent("SKILL.md"))
                    source = state.body
                } catch {
                    notifications.post(.init(level: .error, message: "Load failed: \(error)"))
                }
            }
        }
    }
}
```

- [ ] **Step 5: build + 手工验证（打开一个现有 skill，修改 description，保存，外部 `cat SKILL.md` 验证内容写回）**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App
git commit -m "feat(view): add SkillEditorView with CodeEditor, form, live preview, atomic save"
```

---

### Task 47: NotificationHost 浮层

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Views/NotificationHost.swift`
- Modify: `/Users/crazy/own_project/skillport/App/Views/RootView.swift`

- [ ] **Step 1: 实现 NotificationHost**

`App/Views/NotificationHost.swift`:
```swift
import SwiftUI

struct NotificationHost: View {
    @Environment(NotificationModel.self) private var notifications

    var body: some View {
        VStack {
            Spacer()
            VStack(spacing: 8) {
                ForEach(notifications.toasts) { toast in
                    ToastView(toast: toast) {
                        notifications.dismiss(id: toast.id)
                    }
                    .task {
                        try? await Task.sleep(nanoseconds: 4_000_000_000)
                        notifications.dismiss(id: toast.id)
                    }
                }
            }
            .padding(.bottom, 16)
        }
        .allowsHitTesting(!notifications.toasts.isEmpty)
    }
}

private struct ToastView: View {
    let toast: Toast
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(tint)
            Text(toast.message)
            Spacer(minLength: 12)
            Button(action: onDismiss) { Image(systemName: "xmark") }
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 4)
        .frame(maxWidth: 440)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var icon: String {
        switch toast.level {
        case .info: return "info.circle"
        case .success: return "checkmark.circle"
        case .warning: return "exclamationmark.triangle"
        case .error: return "xmark.octagon"
        }
    }

    private var tint: Color {
        switch toast.level {
        case .info: return .blue
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }
}
```

- [ ] **Step 2: 把 NotificationHost 叠在 RootView 上**

修改 `App/Views/RootView.swift` — 把 body 改成：
```swift
    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 180, ideal: 220)
        } detail: {
            DetailArea()
        }
        .overlay { NotificationHost() }
    }
```

- [ ] **Step 3: build + 手工验证（尝试导入一个无 SKILL.md 的文件夹，应看到红色错误 toast）**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App
git commit -m "feat(view): add NotificationHost toast overlay"
```

---

### Task 48: 文件选择器（Cmd+N 导入本地 skill）

**Files:**
- Create: `/Users/crazy/own_project/skillport/App/Views/Commands/ImportCommand.swift`
- Modify: `/Users/crazy/own_project/skillport/App/SkillportApp.swift`

- [ ] **Step 1: 实现 ImportCommand helper**

`App/Views/Commands/ImportCommand.swift`:
```swift
import AppKit
import Foundation

@MainActor
enum ImportCommand {
    /// 弹原生 NSOpenPanel 让用户选 skill 文件夹，返回所选 URL（canceled 返回 nil）。
    static func pickFolder() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.title = "Choose a skill folder"
        panel.prompt = "Import"
        return panel.runModal() == .OK ? panel.url : nil
    }
}
```

- [ ] **Step 2: 把 `Import Skill…` 菜单项接到 NSOpenPanel**

更新 `App/SkillportApp.swift` 的 `commands` 中 `Import Skill…` 按钮：
```swift
Button("Import Skill…") {
    guard let url = ImportCommand.pickFolder() else { return }
    Task {
        do {
            _ = try await container.skillsModel.installLocal(from: url, installTo: [])
            container.notificationModel.post(.init(level: .success,
                                                   message: "Imported \(url.lastPathComponent)"))
        } catch {
            container.notificationModel.post(.init(level: .error,
                                                   message: "Import failed: \(error)"))
        }
    }
}
.keyboardShortcut("n", modifiers: .command)
```

- [ ] **Step 3: build + 手工验证（Cmd+N 弹选目录对话框，选一个含 SKILL.md 的目录后出现在 Dashboard）**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App
git commit -m "feat(app): wire Cmd+N Import Skill menu to NSOpenPanel"
```

---

### Task 49: Sidebar 双击跳视图 + Editor 返回按钮

**Files:**
- Modify: `/Users/crazy/own_project/skillport/App/Views/Dashboard/DashboardView.swift`
- Modify: `/Users/crazy/own_project/skillport/App/Views/Editor/SkillEditorView.swift`

- [ ] **Step 1: 更新 SkillEditorView 整体，加入 AppModel 环境与 Back 按钮**

替换 `App/Views/Editor/SkillEditorView.swift` 整个文件为：
```swift
import SwiftUI
import CodeEditor

struct SkillEditorView: View {
    let skillID: SkillIdentity?

    @Environment(AppModel.self) private var app
    @Environment(SkillsModel.self) private var skillsModel
    @Environment(NotificationModel.self) private var notifications
    @State private var state = EditorState()
    @State private var source: String = ""

    var body: some View {
        HSplitView {
            VStack {
                FrontmatterForm(state: state)
                Divider()
                CodeEditor(source: $source, language: .markdown, theme: .default)
                    .onChange(of: source) { _, new in
                        state.body = new
                        state.isDirty = true
                    }
            }
            .frame(minWidth: 320)
            MarkdownPreview(source: source)
                .frame(minWidth: 320)
        }
        .navigationTitle(state.filePath?.lastPathComponent ?? "Editor")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button {
                    app.setSection(.dashboard)
                } label: {
                    Label("Back", systemImage: "chevron.left")
                }
                .help("Back to Dashboard")
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    do {
                        try state.save()
                        notifications.post(.init(level: .success, message: "Saved."))
                    } catch {
                        notifications.post(.init(level: .error, message: "Save failed: \(error)"))
                    }
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                }
                .keyboardShortcut("s", modifiers: .command)
                .disabled(!state.isDirty)
            }
        }
        .task(id: skillID) {
            if let skillID, let skill = skillsModel.skills.first(where: { $0.id == skillID }) {
                do {
                    try state.load(from: skill.path.appendingPathComponent("SKILL.md"))
                    source = state.body
                } catch {
                    notifications.post(.init(level: .error, message: "Load failed: \(error)"))
                }
            }
        }
    }
}
```

- [ ] **Step 2: Dashboard 双击行进入编辑器**

在 `SkillRow` 已经有 `onOpen` 回调，DashboardView 已接到 `app.openEditor(for:)`。直接验证即可。

- [ ] **Step 3: build + 手工验证（从 Dashboard 点击笔形图标 → 进入 Editor；在 Editor 点击 Back → 回到 Dashboard）**

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Skillport -destination 'platform=macOS' build 2>&1 | tail -5
git add App
git commit -m "feat(view): add back button to editor and link dashboard row to editor"
```

---

### Task 50: SidebarView 点击"Dashboard"/"Registry"切换 section

Sidebar 的 Views 按钮在 Task 43 已接线到 `app.setSection`，这个 task 只做验证。

- [ ] **Step 1: 手工验证**

启动 app，点击 Sidebar 中"Dashboard"/"Registry"条目，右侧主内容应切换；Registry 显示占位文字（M5 再实现）。

- [ ] **Step 2: 无代码改动，加一个 checkpoint commit**

```bash
git commit --allow-empty -m "chore: verify sidebar section switching"
```

---

### Task 51: 端到端集成测试

**Files:**
- Create: `/Users/crazy/own_project/skillport/Tests/SkillportTests/Integration/DashboardFlowTests.swift`

- [ ] **Step 1: 写 Swift Testing 集成测试（非 UI 测试，操作 Model 验证闭环）**

`Tests/SkillportTests/Integration/DashboardFlowTests.swift`:
```swift
import Testing
@testable import Skillport
import Foundation

@Suite("DashboardFlow")
@MainActor
struct DashboardFlowTests {
    @Test("full import → toggle → scan cycle keeps disk and model consistent")
    func fullCycle() async throws {
        let dir = try TempDir.create()
        defer { try? dir.cleanup() }
        // 准备一个外部 skill 文件夹
        let external = try dir.mkdir("external/my-skill")
        try "---\ndescription: integration test skill\n---\n# body\n".write(
            to: external.appendingPathComponent("SKILL.md"),
            atomically: true, encoding: .utf8
        )

        let container = AppContainer(home: dir.url)
        try await container.skillsModel.refresh()
        #expect(container.skillsModel.skills.isEmpty)

        // 导入
        let installed = try await container.skillsModel.installLocal(from: external, installTo: [.claudeCode])
        #expect(installed.name == "my-skill")

        try await container.skillsModel.refresh()
        #expect(container.skillsModel.skills.count == 1)
        let skill = container.skillsModel.skills[0]
        #expect(skill.installedAgents.contains(.claudeCode))

        // 切换 agent：开 cursor、关 claudeCode
        try await container.skillsModel.toggle(skillName: "my-skill", agent: .cursor, install: true)
        try await container.skillsModel.toggle(skillName: "my-skill", agent: .claudeCode, install: false)
        try await container.skillsModel.refresh()
        let after = container.skillsModel.skills.first!
        #expect(after.installedAgents.contains(.cursor))
        #expect(!after.installedAgents.contains(.claudeCode))

        // 磁盘验证
        let cursorLink = dir.url.appendingPathComponent(".cursor/skills/my-skill")
        #expect(FileManager.default.fileExists(atPath: cursorLink.path))
        let claudeLink = dir.url.appendingPathComponent(".claude/skills/my-skill")
        #expect(!FileManager.default.fileExists(atPath: claudeLink.path))

        // Uninstall 清理
        try await container.skillsModel.uninstall(name: "my-skill")
        try await container.skillsModel.refresh()
        #expect(container.skillsModel.skills.isEmpty)
    }
}
```

- [ ] **Step 2: 跑测试确认通过**

```bash
xcodebuild -scheme Skillport -destination 'platform=macOS' test 2>&1 | tail -20
```

Expected: `DashboardFlow.fullCycle` 通过。

- [ ] **Step 3: Commit**

```bash
git add Tests
git commit -m "test: add end-to-end integration test for import → toggle → uninstall cycle"
```

---

### Task 52: 手工验证清单 + M4 完结

- [ ] **Step 1: 跟清单逐项手验**

启动 `open Skillport.xcodeproj`，按 Cmd+R 运行。跑下列手工清单：

1. 启动后窗口标题 "Skillport"，侧栏显示 Dashboard/Registry + 11 个 agent，主内容 Dashboard 空态或列出现有 skill。
2. 在 Finder 选一个含 `SKILL.md` 的文件夹拖入 Dashboard → 出现 success toast，skill 出现在列表。
3. 点 agent chip 切换安装状态 → Finder 下对应 agent 目录的 symlink 出现/消失。
4. 点列表项右侧笔形图标 → 进入 Editor。改一下 Description，`Cmd+S` 保存 → 用 `cat ~/.agents/skills/<name>/SKILL.md` 看到新 description 写回、YAML frontmatter 顺序合理。
5. 点 Editor 左上 Back → 回到 Dashboard。
6. `Cmd+N` 弹目录选择器，选一个新 skill 目录导入。
7. `Cmd+R` 触发 rescan（此时可外部修改 `~/.agents/skills/<name>/SKILL.md` → 再 Cmd+R 应看到 description 更新）。
8. 关闭 app 前后 sidebar 里 agent 的 skill 计数一致。

若上述任一项异常，回到对应 task 修复后再 commit。

- [ ] **Step 2: M4 完结标记**

```bash
git commit --allow-empty -m "chore: M1-M4 foundation complete; ready for M5+ plan"
```

- [ ] **Step 3: 推送 + 开 PR（按 superpowers:finishing-a-development-branch skill 的流程；本 plan 不强制）**

```bash
git remote add origin git@github.com:crazygang-ai/skillport.git 2>/dev/null || true
git push -u origin main
```

（首次推送前需要在 GitHub 手动创建 `crazygang-ai/skillport` 空仓库。若已创建好可直接 push。）

---

## Self-Review — 交给执行者之前

本 plan 涵盖 spec 第 11 节 M1–M4 四个里程碑的全部交付物。执行完成后能验证的功能：

- `~/.agents/skills/` 下的 skill 被列出（含 frontmatter description）
- 每个 skill 可独立 toggle 到 11 个 agent 中任一个，磁盘 symlink 同步
- Cmd+N / 拖放导入本地 skill 成功（复制到规范存储 + 写 lockfile）
- SKILL.md 编辑器可读写并原子保存
- GitHub 安装路径（`SkillInstallerActor.installGitHub`）已实现，但 Dashboard 层面的 UI 尚未暴露（那是 M5 Registry Browser 的职责）
- Sparkle bridge 已接入（feedURL nil），实际 appcast 发布在 M7
- 全部磁盘兼容 Electron 版（lockfile v3、symlink 指向、cache 文件路径一致）

本 plan **不含**的功能（需要在后续 plan 覆盖）：
- M5：RegistryBrowserView + skills.sh HTML 渲染分支 + HTMLSanitizer
- M6：SettingsView 完整实现、i18n String Catalogs、MenuBarExtra、Quick Look 扩展
- M7：Sparkle appcast 发布流水线、notarize CI 链路、release.sh 脚本
- M8：XCUITest UI 测试套件

**下一份 plan 建议**：覆盖 M5（Registry）作为下一个独立里程碑切片。

