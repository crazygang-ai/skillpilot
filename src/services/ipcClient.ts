import type { ElectronAPI } from '../../electron/preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

/**
 * Deep proxy over window.electronAPI that:
 * - Transparently passes through when the preload bridge is injected
 * - Returns nested proxies for namespace access (e.g. api.updater)
 * - Throws a clear diagnostic error when a method is actually invoked
 *   but the bridge is missing
 */
function createBridgeProxy(path: string[] = []): ElectronAPI {
  return new Proxy((() => {}) as unknown as ElectronAPI, {
    get(_target, prop: string) {
      // Ignore symbol access and toJSON (used by devtools / React internals)
      if (typeof prop === 'symbol' || prop === 'toJSON') return undefined

      const bridge = window.electronAPI
      if (bridge) {
        // Bridge exists — drill down to the real value
        let value: unknown = bridge
        for (const segment of [...path, prop]) {
          value = (value as Record<string, unknown>)?.[segment]
        }
        return value
      }

      // Bridge missing — return a deeper proxy so chained access doesn't crash
      return createBridgeProxy([...path, prop])
    },

    apply(_target, _thisArg, args) {
      const bridge = window.electronAPI
      if (bridge) {
        // Bridge available — resolve and call the real function
        let value: unknown = bridge
        for (const segment of path) {
          value = (value as Record<string, unknown>)?.[segment]
        }
        if (typeof value === 'function') {
          return (value as (...a: unknown[]) => unknown)(...args)
        }
      }

      // Bridge missing or target is not a function
      const fullPath = `electronAPI.${path.join('.')}`
      throw new Error(
        `[SkillPilot] ${fullPath}() is not available: preload bridge was not injected. ` +
        `This usually means the preload script failed to load (check sandbox/contextIsolation settings).`
      )
    },
  })
}

const api: ElectronAPI = createBridgeProxy()

export default api
