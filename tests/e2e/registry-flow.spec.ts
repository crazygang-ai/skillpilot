import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const MAIN_JS = path.join(__dirname, '../../dist-electron/electron/main/index.js')

function createLaunchEnv() {
  const env = { ...process.env, NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

test.describe('Registry Flow', () => {
  test('navigates to skills.sh registry browser', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const registryBtn = window.locator('[data-testid="nav-registry"]')
    await expect(registryBtn).toBeVisible({ timeout: 5000 })
    await registryBtn.click()

    const searchInput = window.locator('input[placeholder*="Search"]').first()
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await electronApp.close()
  })

  test('sidebar only shows supported top-level views', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const navButtons = window.locator('[data-testid^="nav-"]')
    await expect(navButtons).toHaveCount(3)

    await electronApp.close()
  })

  test('settings view opens and shows tabs', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const settingsBtn = window.locator('[data-testid="nav-settings"]')
    await expect(settingsBtn).toBeVisible({ timeout: 5000 })
    await settingsBtn.click()

    const aboutTab = window.locator('text=About').first()
    await expect(aboutTab).toBeVisible({ timeout: 5000 })

    await electronApp.close()
  })
})
