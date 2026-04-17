# Lifecycle Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `AppUpdater`、`setupIpcHandlers`、`notificationStore` 补齐与 `SkillManager.destroy()` 对称的关闭协议,消除事件订阅和 timer 的悬挂。

**Architecture:** 采用内联 `destroy` / cleanup 函数模式(不引入 `Disposable` 抽象)。`AppUpdater` 新增幂等 `destroy()`;`setupIpcHandlers` 由返回 `void` 改为返回 `() => void`;`notificationStore` 用 Map 追踪 timer;`main/index.ts` 的 `will-quit` 按序调用三者。

**Tech Stack:** TypeScript、Electron、vitest、Zustand、Node EventEmitter。

**Spec:** `docs/superpowers/specs/2026-04-17-lifecycle-cleanup-design.md`

---

## File Structure

**修改:**
- `electron/services/app-updater.ts` — 新增 `destroy()` + `disposed` 字段
- `electron/ipc/handlers.ts` — 签名改返回 cleanup;4 个事件 handler 提成具名常量
- `electron/main/index.ts` — 接住 cleanup 返回值;`will-quit` 调用三者
- `src/stores/notificationStore.ts` — 模块级 `timers` Map;`addNotification` 登记、`removeNotification` 清理

**扩展测试:**
- `tests/unit/app-updater.test.ts` — 追加 `describe('AppUpdater.destroy()')` 块

**新增测试:**
- `tests/unit/notification-store.test.ts` — 覆盖 timer 行为

---

## Task 1: AppUpdater.destroy() — 失败测试先行

**Files:**
- Modify: `tests/unit/app-updater.test.ts` (append 新 describe block)

- [ ] **Step 1.1: 追加失败测试**

在 `tests/unit/app-updater.test.ts` 文件末尾(`describe('AppUpdater')` 闭合后**之外**)追加:

```typescript
describe('AppUpdater.destroy()', () => {
  it('是幂等的,连续调用不抛', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    expect(() => {
      service.destroy()
      service.destroy()
    }).not.toThrow()
  })

  it('destroy 后 updater 事件不再改变 state', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    service.destroy()
    const before = service.getState()

    updater.emit('update-available', { version: '0.1.2' })
    updater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1000,
      transferred: 420,
      total: 1000,
    })
    updater.emit('error', new Error('boom'))

    expect(service.getState()).toEqual(before)
  })

  it('destroy 后自身订阅者不再被调用', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })
    const spy = vi.fn()
    service.on('stateChanged', spy)

    service.destroy()

    updater.emit('update-available', { version: '0.1.2' })

    expect(spy).not.toHaveBeenCalled()
  })

  it('unsupported build 也可以安全 destroy', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: false,
      updater,
    })

    expect(() => service.destroy()).not.toThrow()
  })
})
```

- [ ] **Step 1.2: 运行测试确认失败**

Run: `pnpm test -- app-updater`
Expected: FAIL,报错类似 `service.destroy is not a function`(4 个新测试全失败,原有 6 个仍通过)。

- [ ] **Step 1.3: Commit(红)**

```bash
git add tests/unit/app-updater.test.ts
git commit -m "test: add failing tests for AppUpdater.destroy()"
```

---

## Task 2: AppUpdater.destroy() — 实现

**Files:**
- Modify: `electron/services/app-updater.ts` (类字段 + 新方法)

- [ ] **Step 2.1: 添加 `disposed` 字段和 `destroy()` 方法**

在 `electron/services/app-updater.ts` 的 `AppUpdater` 类中:

1. 在 `private state: AppUpdateState` 声明下方(约第 22 行后)新增字段:

```typescript
  private disposed = false
```

2. 在 `setState` 方法上方(即 `private` 方法区内)新增公开方法:

```typescript
  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.updater.removeAllListeners()
    this.removeAllListeners()
  }
```

注意:`destroy()` 是公开方法,放在 `getState()` 附近也可,但放 `setState` 前能保持"公开 API 在前、私有方法在后"的惯例(现有文件是公开方法靠前)。按现有文件布局,**放在 `quitAndInstall()` 方法后、`ensureSupported()` 前**:

```typescript
  async quitAndInstall(): Promise<void> {
    // ...existing...
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.updater.removeAllListeners()
    this.removeAllListeners()
  }

  private ensureSupported(): void {
    // ...existing...
  }
```

- [ ] **Step 2.2: 运行测试确认通过**

Run: `pnpm test -- app-updater`
Expected: PASS,全部 10 个测试通过(原 6 + 新 4)。

- [ ] **Step 2.3: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 2.4: Commit(绿)**

```bash
git add electron/services/app-updater.ts
git commit -m "feat: add idempotent destroy() to AppUpdater"
```

---

## Task 3: notificationStore — 失败测试先行

**Files:**
- Create: `tests/unit/notification-store.test.ts`

- [ ] **Step 3.1: 创建新测试文件**

写入 `tests/unit/notification-store.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from '../../src/stores/notificationStore'

describe('notificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 重置 store 到初始状态(zustand 的 create 无内置 reset,手动清空)
    useNotificationStore.setState({ notifications: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('非持久通知在 delay 后被自动移除', () => {
    useNotificationStore.getState().addNotification('info', 'hello')
    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    vi.advanceTimersByTime(4000)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('带 action 的非持久通知使用 12s delay', () => {
    useNotificationStore
      .getState()
      .addNotification('info', 'with action', { label: 'Undo', onClick: () => {} })

    vi.advanceTimersByTime(4000)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    vi.advanceTimersByTime(8000)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('手动 removeNotification 清理对应 timer', () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout')

    useNotificationStore.getState().addNotification('info', 'manual')
    const id = useNotificationStore.getState().notifications[0].id

    clearSpy.mockClear()
    useNotificationStore.getState().removeNotification(id)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    clearSpy.mockRestore()
  })

  it('persistent 通知不建 timer', () => {
    useNotificationStore
      .getState()
      .addNotification('info', 'persistent', undefined, { persistent: true })

    vi.advanceTimersByTime(30000)

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
  })

  it('multiple 通知各自独立追踪 timer', () => {
    const store = useNotificationStore.getState()
    store.addNotification('info', 'a')
    store.addNotification('info', 'b')
    store.addNotification('info', 'c')

    expect(useNotificationStore.getState().notifications).toHaveLength(3)

    const idB = useNotificationStore.getState().notifications[1].id
    useNotificationStore.getState().removeNotification(idB)
    expect(useNotificationStore.getState().notifications).toHaveLength(2)

    vi.advanceTimersByTime(4000)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
```

- [ ] **Step 3.2: 运行测试确认失败**

Run: `pnpm test -- notification-store`
Expected: "手动 removeNotification 清理对应 timer" 失败(当前实现未调 `clearTimeout`,断言 `Expected 1, Received 0`)。其余测试可能在当前实现下已通过(因为 `filter` 幂等),但第 3 个测试明确表明需要实现。

- [ ] **Step 3.3: Commit(红)**

```bash
git add tests/unit/notification-store.test.ts
git commit -m "test: add failing tests for notificationStore timer lifecycle"
```

---

## Task 4: notificationStore — 实现 timer Map

**Files:**
- Modify: `src/stores/notificationStore.ts`

- [ ] **Step 4.1: 用 Map 追踪 timer**

完整替换 `src/stores/notificationStore.ts` 文件内容为:

```typescript
import { create } from 'zustand'

interface Notification {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  presentation?: 'toast' | 'modal'
  persistent?: boolean
  action?: { label: string; onClick: () => void }
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (
    type: Notification['type'],
    message: string,
    action?: Notification['action'],
    options?: { presentation?: 'toast' | 'modal'; persistent?: boolean },
  ) => void
  removeNotification: (id: string) => void
}

let nextId = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (type, message, action, options) => {
    const id = String(++nextId)
    const notification: Notification = {
      id,
      type,
      message,
      action,
      presentation: options?.presentation ?? 'toast',
      persistent: options?.persistent ?? false,
    }
    set((state) => ({ notifications: [...state.notifications, notification] }))

    if (!notification.persistent) {
      const delay = action ? 12000 : 4000
      const handle = setTimeout(() => {
        timers.delete(id)
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      }, delay)
      timers.set(id, handle)
    }
  },
  removeNotification: (id) => {
    const handle = timers.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.delete(id)
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },
}))
```

- [ ] **Step 4.2: 运行测试确认通过**

Run: `pnpm test -- notification-store`
Expected: PASS,全部 5 个测试通过。

- [ ] **Step 4.3: Commit(绿)**

```bash
git add src/stores/notificationStore.ts
git commit -m "fix: clear notification timer on manual dismiss"
```

---

## Task 5: setupIpcHandlers — 改为返回 cleanup

**Files:**
- Modify: `electron/ipc/handlers.ts` (签名 + 4 个事件 handler 重构)

无测试(理由:需 Electron 运行时,E2E 成本过高;改动是机械重构,代码审查足够)。

- [ ] **Step 5.1: 重构签名与事件订阅**

打开 `electron/ipc/handlers.ts`。

**5.1.a** 把函数签名从 `: void` 改为 `: () => void`:

```typescript
export function setupIpcHandlers(skillManager: SkillManager, appUpdater: AppUpdater): () => void {
```

**5.1.b** 将文件末尾(`// ---- Forward events to renderer ----` 之后)的**四段匿名 `.on(...)`** 整段(从第 157 行到第 192 行,以当前 `main` branch 为准)替换为:

```typescript
  // ---- Forward events to renderer ----
  let stateChangedTimer: ReturnType<typeof setTimeout> | undefined

  const onWatcherChanged = (): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.WATCHER.ON_CHANGE)
      }
    }
  }

  const onStateChanged = (): void => {
    if (stateChangedTimer) clearTimeout(stateChangedTimer)
    stateChangedTimer = setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.SKILL.ON_STATE_CHANGED)
        }
      }
    }, 100)
  }

  const onRefreshFailed = (message: string): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SKILL.ON_REFRESH_FAILED, message)
      }
    }
  }

  const onUpdaterState = (state: AppUpdateState): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.UPDATER.ON_STATE_CHANGED, state)
      }
    }
  }

  skillManager.on('watcherChanged', onWatcherChanged)
  skillManager.on('stateChanged', onStateChanged)
  skillManager.on('refreshFailed', onRefreshFailed)
  appUpdater.on('stateChanged', onUpdaterState)

  return (): void => {
    if (stateChangedTimer) {
      clearTimeout(stateChangedTimer)
      stateChangedTimer = undefined
    }
    skillManager.off('watcherChanged', onWatcherChanged)
    skillManager.off('stateChanged', onStateChanged)
    skillManager.off('refreshFailed', onRefreshFailed)
    appUpdater.off('stateChanged', onUpdaterState)
  }
```

**5.1.c** 顶部 import 区补充 `AppUpdateState` 类型(查看现有 `import` 列表,在 `import { type LeaderboardCategory } from '../../shared/types'` 同一行扩展,或新增一行):

找到:

```typescript
import { type LeaderboardCategory } from '../../shared/types'
```

改为:

```typescript
import { type LeaderboardCategory, type AppUpdateState } from '../../shared/types'
```

- [ ] **Step 5.2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

若报错 `AppUpdateState` 未从 `shared/types` 导出,回看 `shared/types.ts` 中实际导出名(spec 里该类型是已存在的,参见 `app-updater.ts` 第 4 行已在用)。

- [ ] **Step 5.3: Lint**

Run: `pnpm lint`
Expected: PASS。

- [ ] **Step 5.4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "refactor: setupIpcHandlers returns cleanup function"
```

---

## Task 6: main/index.ts — 串联 cleanup

**Files:**
- Modify: `electron/main/index.ts`

- [ ] **Step 6.1: 接住 cleanup 返回值并在 will-quit 调用**

在 `electron/main/index.ts` 中:

**6.1.a** 在模块顶部的 `let appUpdater: AppUpdater | null = null` 下方(约第 13 行后)新增:

```typescript
let cleanupIpc: (() => void) | null = null
```

**6.1.b** 在 `app.whenReady().then(async () => { ... })` 内,把:

```typescript
  setupIpcHandlers(skillManager, appUpdater)
```

改为:

```typescript
  cleanupIpc = setupIpcHandlers(skillManager, appUpdater)
```

**6.1.c** 把文件末尾的 `will-quit` 处理器:

```typescript
app.on('will-quit', () => {
  skillManager?.destroy()
})
```

改为:

```typescript
app.on('will-quit', () => {
  cleanupIpc?.()
  cleanupIpc = null
  appUpdater?.destroy()
  skillManager?.destroy()
})
```

顺序说明:先断订阅(cleanupIpc)→ 再断监听源头(appUpdater.destroy)→ 最后 SkillManager.destroy()(保持与现有顺序末位一致)。

- [ ] **Step 6.2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 6.3: Commit**

```bash
git add electron/main/index.ts
git commit -m "fix: wire IPC cleanup and AppUpdater.destroy in will-quit"
```

---

## Task 7: 最终验收

- [ ] **Step 7.1: 跑全套单元测试**

Run: `pnpm test`
Expected: PASS,全部测试通过,新增 `app-updater.test.ts` 共 10 个 + `notification-store.test.ts` 共 5 个。

- [ ] **Step 7.2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS(两套 tsconfig 都通过)。

- [ ] **Step 7.3: Lint**

Run: `pnpm lint`
Expected: PASS。

- [ ] **Step 7.4: (可选) 手动冒烟**

启动 dev 模式,观察应用正常打开、通知弹出与消失、`Cmd+Q` 退出时控制台无未捕获错误。

```bash
pnpm dev
```

按 `Cmd+Q` 退出。

预期:退出日志无 "Unhandled promise rejection"、无 "MaxListenersExceeded" 之类告警。

- [ ] **Step 7.5: 最终 push(可选,若需创建 PR)**

```bash
git log --oneline -7
git push
```

---

## 验收标准回顾(对照 spec)

- [x] `AppUpdater.destroy()` 存在且幂等;destroy 后事件不修改 state — Task 1 & 2
- [x] `setupIpcHandlers` 返回 `() => void`;`main/index.ts` 在 `will-quit` 里按顺序调用 — Task 5 & 6
- [x] `notificationStore.removeNotification` 清对应 timer;持久通知不建 timer — Task 3 & 4
- [x] 新增/扩展 2 个测试文件,`pnpm test` 通过 — Task 7.1
- [x] `pnpm typecheck` 通过 — Task 7.2
- [x] `pnpm lint` 通过 — Task 7.3
