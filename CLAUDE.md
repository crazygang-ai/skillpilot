# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 构建与运行

```bash
pnpm install             # 安装依赖 (pnpm@10.32.1)
pnpm dev                 # Vite + preload watch + Electron (concurrently)
pnpm test                # 单元测试 (vitest, run 模式)
pnpm test:watch          # 单元测试 watch 模式
pnpm test -- <pattern>   # 运行单个测试文件或名称匹配
pnpm test:e2e            # Playwright E2E（会先 build）
pnpm typecheck           # 同时校验 renderer + main（两套 tsconfig）
pnpm lint                # ESLint
pnpm format              # Prettier 写入
pnpm build:mac           # 打包 .dmg/.zip（不发布）
pnpm release {patch|minor|major}  # 改版号 + tag + push，CI 负责构建发布
```

Dev 服务器在 `http://localhost:5173`。Electron 会等 Vite server 和 preload 产物都就绪后再启动。

## 架构

Electron 应用，三套独立 tsconfig：`tsconfig.json` (renderer)、`tsconfig.electron.json` (main)、`vite.preload.config.ts` (preload bundle)。

- **中心编排器**：`electron/services/skill-manager.ts` —— class，继承 `EventEmitter`，组合其它 service，并 emit 事件给 renderer（通过 IPC 订阅）。
- **Services**：`electron/services/` 下 20 个模块。大多是导出的 async function，只有 `SkillManager` 和 `FileSystemWatcher` 是 class。
- **IPC 四层桥**：Main handlers (`electron/ipc/`) → Preload (`contextBridge`) → `src/services/ipcClient` → React hooks (`src/hooks/`，共 5 个)。通道名遵循 `domain:action`（如 `skill:scanAll`）。
- **状态**：Zustand（`src/stores/` 下 4 个 store：`appStore`、`notificationStore`、`settingsStore`、`updateStore`）管 UI 状态；异步/服务端数据走 React Query（上述 hooks）。
- **视图**：`src/views/` 下的 `Dashboard`、`RegistryBrowser`、`SettingsModal`、`SkillEditorView`。
- **协议**：注册 `skillpilot://` URL scheme（见 `package.json` → `build.protocols`）。

## 支持的 Agent（11 个）

Claude Code、Codex、Gemini CLI、Copilot CLI、OpenCode、Antigravity、Cursor、Kiro、CodeBuddy、OpenClaw、Trae。每个 agent 有独立的 skills 目录，以及各自的读取优先级链 —— 精确的 fallback 顺序见 README.md 的 "Supported Agents" 表（部分 agent 会以 `~/.agents/skills/` 或 `~/.claude/skills/` 作为次级来源）。

## 关键文件系统路径（用户家目录）

- `~/.agents/skills/` —— 共享 skill 的规范存储（大多数 symlink 的目标）
- `~/.agents/.skill-lock.json` —— 锁文件，**version 3**
- `~/.agents/.skillpilot-cache.json` —— 用于更新检测的 commit hash 缓存

文件系统**就是**数据库：skill 就是包含 `SKILL.md` 的目录；按 agent 安装通过 symlink 进入该 agent 的 skills 目录实现。

## 内容抓取策略

Registry skill 文档（`skill-content-fetcher.ts`）采用多策略级联：

1. GitHub raw URL —— 8 条候选路径并发，通过 `Promise.any` 取最快返回
2. skills.sh 页面 HTML 抽取（解析 RSC payload）
3. GitHub Tree API 发现 —— 兜底方案，受 rate limit 限制

来自 skills.sh 的 HTML 内容会加前缀哨兵 `<!-- HTML -->`，让 renderer 分支处理：HTML 路径走 `dangerouslySetInnerHTML` + `.markdown-body` CSS（用 `dompurify` 清洗）；其它情况走 `react-markdown` + `remark-gfm`。

## 约定

- **原子写**：先写 `.tmp`，再 `fs.renameSync()`，绝不原地覆盖。
- **YAML** 只用 `js-yaml`；**文件监听**只用 `chokidar`。
- **密钥**：代理密码走 `keychain-service.ts`（基于 `keytar` 的 macOS Keychain），禁止明文写入配置。
- **网络**：带代理的请求统一走 `network-session-provider.ts`（支持 `https-proxy-agent` 与 `socks-proxy-agent`）。
- **i18n**：英文（`en`）+ 简体中文（`zh`），i18next 管理；所有用户可见字符串放 locale 文件，不允许硬编码。
- **测试**：单元测试在 `tests/unit/`（vitest + jsdom），E2E 在 `tests/e2e/`（Playwright，驱动打包后的产物）。

## 发布流程

`pnpm release <bump>` 会本地跑 typecheck + 单元测试，修改 `package.json` 版本，commit、打 tag 并 push。随后 GitHub Actions 构建签名 + 公证的 `.dmg` / `.zip`，并创建**草稿** release。App 内自动更新只有在草稿被手动发布后才能看到。
