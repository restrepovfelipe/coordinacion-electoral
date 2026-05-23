import { test, expect } from '@playwright/test'
import { getBootstrapToken, createQaUser, deleteQaUser, loginViaApi } from './helpers/auth'

let adminToken: string
let testUser: { id: number; username: string; password: string }

test.describe('Scenario B — REGIONAL_COORDINATOR', () => {
  test.beforeAll(async () => {
    adminToken = await getBootstrapToken()
    testUser = await createQaUser(adminToken, { role: 'REGIONAL_COORDINATOR' })
  })

  test.afterAll(async () => {
    if (testUser) await deleteQaUser(adminToken, testUser.id, testUser.username)
  })

  test('B1 — login and see dashboard', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await expect(page).toHaveURL('/')
  })

  test('B2 — testigos page accessible', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/testigos')
    await expect(page.getByRole('heading', { name: /testigos/i })).toBeVisible({ timeout: 10_000 })
  })

  test('B3 — usuarios page accessible for REGIONAL_COORDINATOR', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/usuarios')
    await expect(page.getByText(/usuarios/i)).toBeVisible({ timeout: 10_000 })
  })
})
