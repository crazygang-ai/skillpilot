import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const MAIN_JS = path.join(__dirname, '../../dist-electron/electron/main/index.js')

function createLaunchEnv() {
  const env = { ...process.env, NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

test.describe('Core Flow', () => {
  test('skill list displays search input on dashboard', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const searchInput = window.locator('input[placeholder*="Search skills"]').first()
    await expect(searchInput).toBeVisible({ timeout: 15000 })

    await electronApp.close()
  })

  test('agent list shows detected agents section', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const agentSectionLabel = window.locator('text=All Agents').first()
    await expect(agentSectionLabel).toBeVisible({ timeout: 10000 })

    await electronApp.close()
  })
})
