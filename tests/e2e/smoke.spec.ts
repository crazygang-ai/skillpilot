import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const MAIN_JS = path.join(__dirname, '../../dist-electron/electron/main/index.js')

function createLaunchEnv() {
  const env = { ...process.env, NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

test.describe('Smoke Test', () => {
  test('app launches and shows window', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const title = await window.title()
    expect(title).toBeTruthy()

    await expect(window.locator('#root')).toBeAttached()

    await electronApp.close()
  })

  test('sidebar is visible with navigation items', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const sidebar = window.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    const brand = window.locator('text=SkillPilot').first()
    await expect(brand).toBeVisible({ timeout: 10000 })

    await electronApp.close()
  })

  test('navigation between views works', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const dashboardBtn = window.locator('[data-testid="nav-dashboard"]')
    await expect(dashboardBtn).toBeVisible({ timeout: 10000 })
    await dashboardBtn.click()

    const registryBtn = window.locator('[data-testid="nav-registry"]')
    await expect(registryBtn).toBeVisible({ timeout: 5000 })
    await registryBtn.click()

    await electronApp.close()
  })
})
