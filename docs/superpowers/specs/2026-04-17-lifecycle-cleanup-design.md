# Lifecycle Cleanup — 对称化组件关闭协议

**Date**: 2026-04-17
**Scope**: 3 处组件(AppUpdater、setupIpcHandlers、notificationStore)
**Status**: Approved

## 背景与动机

项目目前有一个已成立的关闭协议:`SkillManager.destroy()` 在 `app.on('will-quit')` 中调用(`electron/main/index.ts:114`)。但另外两个 main 进程组件没跟上这个协议:

- `AppUpdater` 在构造函数里注册 6 个 `electron-updater` 监听器,无 `destroy` 方法
- `setupIpcHandlers` 向 `SkillManager` / `AppUpdater` 注册 4 个事件 handler,并维护一个 `stateChangedTimer`,没有 cleanup 出口

renderer 侧的 `notificationStore` 对每条非持久通知建 `setTimeout`,用户手动关闭时未清除对应 timer——不是泄漏(timer 最长持有 12s 且 filter 幂等),但**语义不对**:用户关闭后不应再有一个"回声"timer 在后台跑。

这次工作**不是灭火级泄漏修复**,而是补齐关闭协议的对称性、为后续可测试性铺路。

## 非目标

- 不引入 `Disposable` 抽象或类似的通用生命周期模式(3 个点位不值得)
- 不卸载 `ipcMain.handle(...)`(仅在 app 退出时执行,无意义)
- 不改动 `SkillManager` / `FileSystemWatcher` 的现有关闭逻辑

## 设计

### 1. `AppUpdater.destroy()`

**文件**: `electron/services/app-updater.ts`

新增 `destroy()` 方法,幂等,清理两层监听:

```ts
export class AppUpdater extends EventEmitter {
  private disposed = false

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.updater.removeAllListeners()
    this.removeAllListeners()
  }
}
```

- `this.updater.removeAllListeners()` 清掉构造函数注册的 6 个 `electron-updater` 事件监听
- `this.removeAllListeners()` 清掉 `handlers.ts` 订阅的 `'stateChanged'` listener
- `disposed` 守卫保证幂等,多次调用不抛

不新增 `ensureNotDisposed` 守卫到 `checkForUpdates` / `downloadUpdate` 等方法——`will-quit` 之后这些方法不会被调用。

### 2. `setupIpcHandlers` 返回 cleanup 函数

**文件**: `electron/ipc/handlers.ts`

- 签名从 `void` 改为 `() => void`
- 4 个事件 handler 提成具名函数(文件内局部作用域),便于 `.off(...)`
- cleanup 函数关闭 `stateChangedTimer` 并移除 4 个事件订阅

```ts
export function setupIpcHandlers(
  skillManager: SkillManager,
  appUpdater: AppUpdater,
): () => void {
  // 所有 ipcMain.handle(...) 保持不变

  let stateChangedTimer: ReturnType<typeof setTimeout> | undefined

  const onWatcherChanged = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.WATCHER.ON_CHANGE)
      }
    }
  }

  const onStateChanged = () => {
    if (stateChangedTimer) clearTimeout(stateChangedTimer)
    stateChangedTimer = setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.SKILL.ON_STATE_CHANGED)
        }
      }
    }, 100)
  }

  const onRefreshFailed = (message: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SKILL.ON_REFRESH_FAILED, message)
      }
    }
  }

  const onUpdaterState = (state: AppUpdateState) => {
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

  return () => {
    if (stateChangedTimer) {
      clearTimeout(stateChangedTimer)
      stateChangedTimer = undefined
    }
    skillManager.off('watcherChanged', onWatcherChanged)
    skillManager.off('stateChanged', onStateChanged)
    skillManager.off('refreshFailed', onRefreshFailed)
    appUpdater.off('stateChanged', onUpdaterState)
  }
}
```

必要时从 `../../shared/types` 引入 `AppUpdateState` 类型(如果尚未导入)。

### 3. `notificationStore` — 追踪 timer

**文件**: `src/stores/notificationStore.ts`

在 store 模块作用域维护一个 `Map<id, timeoutHandle>`:

```ts
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (type, message, action, options) => {
    const id = String(++nextId)
    const notification: Notification = { /* ... */ }
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

`timers` 故意放在 store 模块作用域(和 `nextId` 同级),与现有代码风格一致。

### 4. `main/index.ts` 串联

**文件**: `electron/main/index.ts`

- 用变量接住 `setupIpcHandlers` 的返回值
- 在 `will-quit` 里按"订阅者→监听器拥有者"的顺序释放:先 cleanup IPC 订阅,再 destroy `AppUpdater`,最后 destroy `SkillManager`(保留现有顺序中的最后一项)

```ts
let cleanupIpc: (() => void) | null = null

app.whenReady().then(async () => {
  // ...
  cleanupIpc = setupIpcHandlers(skillManager, appUpdater)
  createWindow()
  // ...
})

app.on('will-quit', () => {
  cleanupIpc?.()
  cleanupIpc = null
  appUpdater?.destroy()
  skillManager?.destroy()
})
```

## 测试

### 新增 `tests/unit/app-updater.test.ts`

使用构造函数的 `options.updater` 参数注入一个最小 `EventEmitter` mock,覆盖:

- **destroy 幂等**:连续两次 `destroy()` 不抛
- **destroy 后事件不改 state**:`destroy()` 后让 mock `emit('update-available', {...})`,`getState()` 仍为 destroy 前的状态
- **destroy 清理自身订阅者**:`appUpdater.on('stateChanged', spy)` → `destroy()` → 人为触发 `setState`(通过暴露的方法或其他路径)不再调用 spy。若没有干净的触发路径,此子项可用 `removeAllListeners` 的调用验证代替

### 新增 `tests/unit/notification-store.test.ts`

使用 `vitest` 的 fake timers(`vi.useFakeTimers()`):

- **非持久通知 delay 后自动移除**:add → `advanceTimersByTime(4000)` → 列表为空
- **手动 remove 后 timer 被清**:add → `removeNotification(id)` → `advanceTimersByTime(4000)` → 不抛且列表保持空、内部 `timers` 为空(间接验证:不 advance 时列表也为空)
- **持久通知不建 timer**:add with `persistent: true` → `advanceTimersByTime(20000)` → 通知仍在

### 不加的测试

- `setupIpcHandlers` cleanup 的集成测试:需 Electron runtime,成本高。改动简单直白,代码审查即可。

## 验收标准

- [ ] `AppUpdater.destroy()` 存在且幂等;destroy 后事件不修改 state
- [ ] `setupIpcHandlers` 返回 `() => void`;`main/index.ts` 在 `will-quit` 里按顺序调用
- [ ] `notificationStore.removeNotification` 清对应 timer;持久通知不建 timer
- [ ] 新增 2 个单测文件,`pnpm test` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过

## 风险与回滚

- 改动面小,3 个文件 + 2 个测试文件 + 1 处 `main/index.ts` 调整
- 无数据迁移、无协议变更、无用户可见行为变化
- 回滚即 `git revert`

## 不做的事

- 不引入 `Disposable` 抽象
- 不调 `ipcMain.removeHandler`(退出时无意义)
- 不改 `SkillManager` / `FileSystemWatcher`
- 不加 `ensureNotDisposed` 防御到 `AppUpdater` 的业务方法
