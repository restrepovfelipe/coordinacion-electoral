import { test, expect, type Page } from '@playwright/test'
import { getBootstrapToken, createQaUser, deleteQaUser, loginViaApi } from './helpers/auth'

let adminToken: string
let testUser: { id: number; username: string; password: string }

test.describe('Scenario A — SUPER_ADMIN', () => {
  test.beforeAll(async () => {
    adminToken = await getBootstrapToken()
    testUser = await createQaUser(adminToken, { role: 'SUPER_ADMIN' })
  })

  test.afterAll(async () => {
    if (testUser) await deleteQaUser(adminToken, testUser.id, testUser.username)
  })

  test('A1 — login and see dashboard', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await expect(page).toHaveURL('/')
    await expect(page.getByText(/antioquia/i)).toBeVisible()
  })

  test('A2 — drill into municipio', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    // Navigate to a municipio page
    await page.goto('/municipio/medellin')
    await expect(page.getByRole('heading', { name: /medellín/i })).toBeVisible({ timeout: 10_000 })
  })

  test('A3 — testigos page loads with Sin puesto filter', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/testigos')
    await expect(page.getByText(/testigos/i)).toBeVisible()
    // Click "Sin puesto" chip
    const sinPuestoChip = page.getByRole('button', { name: /sin puesto/i })
    await expect(sinPuestoChip).toBeVisible({ timeout: 10_000 })
    await sinPuestoChip.click()
  })

  test('A4 — priorizacion page renders ranked list', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/priorizacion')
    await expect(page.getByText(/puestos prioritarios/i)).toBeVisible()
  })

  test('A5 — usuarios page accessible for SUPER_ADMIN', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.goto('/usuarios')
    await expect(page.getByText(/usuarios/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /crear usuario/i })).toBeVisible({ timeout: 10_000 })
  })

  test('A6 — logout navigates to /login', async ({ page }) => {
    await loginViaApi(page, testUser.username, testUser.password)
    await page.getByRole('button', { name: /cerrar sesión/i }).click()
    await expect(page).toHaveURL('/login', { timeout: 10_000 })
  })
})
