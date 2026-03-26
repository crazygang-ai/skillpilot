## Build & Run

```bash
pnpm install        # Install dependencies
pnpm dev            # Start dev server + Electron
pnpm test           # Run unit tests (vitest)
pnpm test:e2e       # Run E2E tests (playwright)
pnpm build:mac      # Build macOS app
pnpm typecheck      # Type-check both renderer and main process
```

## Architecture

- **Central Orchestrator**: `electron/services/skill-manager.ts` (class, extends EventEmitter)
- **Services**: 18 modules in `electron/services/` — most are exported async functions, only `SkillManager` and `FileSystemWatcher` are classes
- **IPC Bridge**: 4-layer pattern: Main → Preload → ipcClient → React hooks
- **State**: Zustand (4 stores) + React Query (3 hooks)
- **Views**: Dashboard, RegistryBrowser, ClawHubBrowser, SettingsModal, SkillEditorView

## Supported Agents (11)

Claude Code, Codex, Gemini CLI, Copilot CLI, OpenCode, Antigravity, Cursor, Kiro, CodeBuddy, OpenClaw, Trae

## Key Directories

- `~/.agents/skills/` — Shared skill canonical storage
- `~/.agents/.skill-lock.json` — Lock file (version 3)
- `~/.agents/.skillpilot-cache.json` — Commit hash cache

## Content Fetching Strategy

Registry/ClawHub skill docs use a multi-strategy approach:
1. GitHub raw URLs (8 candidates in parallel via `Promise.any`)
2. skills.sh / clawhub.ai page HTML extraction (RSC payload)
3. GitHub Tree API discovery (fallback, subject to rate limits)

HTML content from skills.sh/ClawHub is prefixed with `<!-- HTML -->` so the frontend can distinguish and render with `dangerouslySetInnerHTML` + `.markdown-body` CSS. Markdown content is rendered via `react-markdown`.

## Conventions

- IPC channels use `domain:action` naming (e.g., `skill:scanAll`)
- Use `js-yaml` for YAML parsing, `chokidar` for file watching
- Atomic file writes: write to `.tmp` then `fs.renameSync()`
- i18n: English (`en`) + Simplified Chinese (`zh`) via i18next
- Tests: 15 unit tests (`tests/unit/`), 3 E2E tests (`tests/e2e/`)
