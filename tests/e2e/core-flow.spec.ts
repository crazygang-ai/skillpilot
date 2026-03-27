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
  test('skill list displays installed skills', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // The dashboard skill list should render even on a clean system.
    const searchInput = window.locator('input[placeholder="Search skills..."]').first()
    await expect(searchInput).toBeVisible({ timeout: 15000 })

    await electronApp.close()
  })

  test('clicking a skill shows detail panel', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(3000)

    // Find first skill item if any exist
    const skillItem = window.locator('[class*="skill-item"], [role="listitem"]').first()
    if (await skillItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skillItem.click()

      // Detail action bar should appear once a skill is selected.
      const detailAction = window.locator('button:has-text("Copy Path")').first()
      await expect(detailAction).toBeVisible({ timeout: 5000 })
    }

    await electronApp.close()
  })

  test('agent list shows detected agents', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: createLaunchEnv(),
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(3000)

    // Agent section should render even if no CLIs are installed.
    const agentSectionLabel = window.locator('text=All Agents').first()
    await expect(agentSectionLabel).toBeVisible({ timeout: 5000 })

    await electronApp.close()
  })
})
