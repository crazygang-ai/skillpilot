import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const PRELOAD_BUNDLE = path.resolve(__dirname, '../../dist-electron/electron/preload/index.js')

describe('preload bundle contract', () => {
  it('bundle file exists after build', () => {
    expect(fs.existsSync(PRELOAD_BUNDLE)).toBe(true)
  })

  it('only requires "electron" as external module', () => {
    const content = fs.readFileSync(PRELOAD_BUNDLE, 'utf-8')
    // Extract all require() calls
    const requires = [...content.matchAll(/require\(["']([^"']+)["']\)/g)].map(m => m[1])

    expect(requires.length).toBeGreaterThan(0) // at least require('electron')
    for (const req of requires) {
      expect(req).toBe('electron')
    }
  })

  it('does not contain runtime require for shared/ipc', () => {
    const content = fs.readFileSync(PRELOAD_BUNDLE, 'utf-8')
    expect(content).not.toMatch(/require\(.*shared\/ipc/)
  })

  it('contains contextBridge.exposeInMainWorld call', () => {
    const content = fs.readFileSync(PRELOAD_BUNDLE, 'utf-8')
    expect(content).toMatch(/contextBridge\.exposeInMainWorld/)
  })

  it('exposes electronAPI as the bridge name', () => {
    const content = fs.readFileSync(PRELOAD_BUNDLE, 'utf-8')
    expect(content).toMatch(/exposeInMainWorld\(["']electronAPI["']/)
  })
})
