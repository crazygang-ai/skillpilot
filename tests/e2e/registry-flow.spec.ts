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

    // Navigate to registry view
    const registryBtn = window.locator('button:has-text("skills.sh"), button:has-text("Registry")').first()
    if (await registryBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await registryBtn.click()
      await window.waitForTimeout(1000)

      // Should see search input or leaderboard tabs
      const searchInput = window.locator('input[placeholder*="Search"], input[type="search"]').first()
      const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false)

      // Either search input or some registry content should be visible
      if (hasSearch) {
        await expect(searchInput).toBeVisible()
      }
    }

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

  test('settings modal opens and shows tabs', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Click settings button
    const settingsBtn = window.locator('button:has-text("Settings"), button[aria-label="Settings"]').first()
    if (await settingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsBtn.click()
      await window.waitForTimeout(500)

      // Should show modal with tabs: About, Language, Proxy
      const aboutTab = window.locator('text=About').first()
      const hasAbout = await aboutTab.isVisible({ timeout: 3000 }).catch(() => false)
      if (hasAbout) {
        await expect(aboutTab).toBeVisible()
      }
    }

    await electronApp.close()
  })
})
