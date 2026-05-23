import { test, expect } from '@playwright/test'
import { getBootstrapToken, createQaUser, deleteQaUser, loginViaApi } from './helpers/auth'

let adminToken: string
let testUser: { id: number; username: string; password: string }

test.describe('Scenario C — PUESTO_COORDINATOR', () => {
  test.beforeAll(async () => {
    adminToken = await getBootstrapToken()
    // PUESTO_COORDINATOR requires a puesto scope — use puesto id=1 as test scope
    testUser = await createQaUser(adminToken, { role: 'PUESTO_COORDINATOR', scopeType: 'PUESTO', scopeId: 1 })
  })

  test.afterAll(async () => {
    if (testUser) await deleteQaUser(adminToken, testUser.id, testUser.username)
  })

  test('C1 — login succeeds', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await expect(page).toHaveURL('/')
  })

  test('C2 — /usuarios returns access denied', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/usuarios')
    await expect(page.getByText(/no tienes acceso/i)).toBeVisible({ timeout: 10_000 })
  })

  test('C3 — /testigos returns access denied (non-admin)', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/testigos')
    await expect(page.getByText(/no tienes acceso/i)).toBeVisible({ timeout: 10_000 })
  })
})
