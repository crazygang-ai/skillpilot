import { EventEmitter } from 'events'
import * as chokidar from 'chokidar'
import { FILE_WATCHER_DEBOUNCE_MS } from '../utils/constants'

export class FileSystemWatcher extends EventEmitter {
  private watcher: ReturnType<typeof chokidar.watch> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private watchedPaths: string[] = []

  startWatching(paths: string[]): void {
    const filtered = paths.filter(Boolean).sort()
    if (
      this.watcher &&
      filtered.length === this.watchedPaths.length &&
      filtered.every((p, i) => p === this.watchedPaths[i])
    ) {
      return
    }
    this.stopWatching()
    this.watchedPaths = filtered

    if (this.watchedPaths.length === 0) return

    this.watcher = chokidar.watch(this.watchedPaths, {
      depth: 1,
      ignoreInitial: true,
      ignorePermissionErrors: true,
    })

    this.watcher.on('all', () => {
      this.debouncedNotify()
    })
  }

  stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.watchedPaths = []
  }

  private debouncedNotify(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.emit('change')
    }, FILE_WATCHER_DEBOUNCE_MS)
  }
}
