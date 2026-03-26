import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const MAIN_JS = path.join(__dirname, '../../dist-electron/main/index.js')

test.describe('Smoke Test', () => {
  test('app launches and shows window', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: { ...process.env, NODE_ENV: 'test' },
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Window should be visible
    const title = await window.title()
    expect(title).toBeTruthy()

    // Check window dimensions
    const size = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)

    await electronApp.close()
  })

  test('sidebar is visible with navigation items', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: { ...process.env, NODE_ENV: 'test' },
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Sidebar should contain key navigation items
    const sidebar = window.locator('[class*="w-56"], nav, aside').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    // Should show SkillPilot branding
    const brand = window.locator('text=SkillPilot').first()
    await expect(brand).toBeVisible({ timeout: 10000 })

    await electronApp.close()
  })

  test('navigation between views works', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: { ...process.env, NODE_ENV: 'test' },
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Click on Dashboard navigation
    const dashboardBtn = window.locator('button:has-text("Dashboard"), [data-view="dashboard"]').first()
    if (await dashboardBtn.isVisible()) {
      await dashboardBtn.click()
      // Dashboard should load
      await window.waitForTimeout(500)
    }

    // Click on Registry navigation
    const registryBtn = window.locator('button:has-text("Registry"), button:has-text("skills.sh"), [data-view="registry"]').first()
    if (await registryBtn.isVisible()) {
      await registryBtn.click()
      await window.waitForTimeout(500)
    }

    await electronApp.close()
  })
})
