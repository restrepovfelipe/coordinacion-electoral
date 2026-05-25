/**
 * Fix 4 — Auth hydration flash
 * Verifica que al recargar como usuario autenticado NO aparece el form de login.
 * Verifica que usuario no autenticado es redirigido a index.html.
 *
 * Run: npx playwright test tests/e2e/fix4-auth-flash.spec.ts --headed
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://coordinacion-electoral.vercel.app';
const USERNAME = '1040572640';
const PASSWORD = 'JuanReunion2026';

async function loginAndWait(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/index.html`);
  // El spinner debe aparecer primero, NO el login-box
  const loginBoxEarly = await page.locator('#login-screen .login-box').isVisible().catch(() => false);
  expect(loginBoxEarly, 'El login-box NO debe ser visible antes de que authReady resuelva').toBe(false);

  // Esperar a que el login form sea visible (authReady resolvió, no hay sesión o hay sesión)
  await page.locator('#login-screen .login-box').waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => {
      // Si el login-box nunca aparece, significa que había sesión y ya entró al app — eso está bien
    });

  // Si el login-box apareció, hacer login
  const loginVisible = await page.locator('#login-screen .login-box').isVisible().catch(() => false);
  if (loginVisible) {
    await page.locator('#l-user').fill(USERNAME);
    await page.locator('#l-pass').fill(PASSWORD);
    await page.locator('.login-btn').click();
    // Esperar a que el login-screen desaparezca
    await page.locator('#login-screen').waitFor({ state: 'hidden', timeout: 15000 });
  }
}

test.describe('Fix 4 — Auth hydration flash', () => {

  test('no flash del login al recargar como usuario autenticado', async ({ page }) => {
    // Paso 1: Login normal
    await loginAndWait(page);

    // Paso 2: Reload y medir
    await page.reload();

    // Inmediatamente después del reload (dentro de 1.5s), el login-box NO debe estar visible.
    // El spinner de authReady sí puede estar visible — eso es correcto.
    const loginBoxFlash = await page.locator('#login-screen .login-box')
      .isVisible({ timeout: 1500 })
      .catch(() => false);

    expect(loginBoxFlash, 'El login-box NO debe flashear al recargar con sesión activa').toBe(false);

    // Verificar que eventualmente se oculta el login-screen entero (la app cargó)
    await page.locator('#login-screen').waitFor({ state: 'hidden', timeout: 12000 });
  });

  test('usuario no autenticado es redirigido al intentar acceder a /testigos.html', async ({ page, context }) => {
    // Limpiar sesión
    await context.clearCookies();
    // Limpiar IndexedDB de Firebase
    await page.goto(`${BASE}/index.html`);
    await page.evaluate(() => {
      try { indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch {}
      try { indexedDB.deleteDatabase('firebase-heartbeat-database'); } catch {}
      localStorage.clear();
    });

    // Ir a una página protegida
    await page.goto(`${BASE}/testigos.html`);

    // Debe redirigir a / (index.html) dentro de 5s
    await page.waitForURL(/\/(index\.html)?$/, { timeout: 5000 });
  });

  test('spinner aparece inmediatamente al cargar index.html (sin sesión)', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/index.html`);
    await page.evaluate(() => {
      try { indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch {}
      localStorage.clear();
    });
    await page.goto(`${BASE}/index.html`);

    // El spinner debe estar visible inmediatamente
    const spinnerVisible = await page.locator('#auth-gate-spinner').isVisible().catch(() => false);
    // Si authReady ya resolvió muy rápido, el login-box podría ya estar visible — también OK
    const loginBoxVisible = await page.locator('#login-screen .login-box').isVisible().catch(() => false);

    expect(spinnerVisible || loginBoxVisible, 'Debe mostrar spinner O login-box, nunca nada').toBe(true);

    // Verificar que el login-box NUNCA aparece antes de que el spinner desaparezca
    if (spinnerVisible && !loginBoxVisible) {
      // Esperar a la transición
      await page.locator('#login-screen .login-box').waitFor({ state: 'visible', timeout: 8000 });
      // En este punto el spinner debería haberse ocultado
      const spinnerStillVisible = await page.locator('#auth-gate-spinner').isVisible().catch(() => false);
      expect(spinnerStillVisible, 'El spinner debe ocultarse cuando aparece el login-box').toBe(false);
    }
  });

});
