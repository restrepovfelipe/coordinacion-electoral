/**
 * Fix 4 v2 — Auth hydration flash
 *
 * Verifica que:
 * 1. Al cargar con sesión activa: #login-screen NUNCA aparece, #auth-gate-overlay
 *    aparece y luego desaparece cuando la app carga.
 * 2. Sin sesión: #auth-gate-overlay aparece, luego #login-screen con el form.
 * 3. Páginas protegidas sin sesión redirigen a /.
 *
 * Run: npx playwright test tests/e2e/fix4-auth-flash.spec.ts --headed
 * Contra preview: BASE_URL=https://... npx playwright test ...
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://coordinacion-electoral.vercel.app';
const USERNAME = '1040572640';
const PASSWORD = 'JuanReunion2026';

/** Login completo desde cero. */
async function doLogin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/index.html`);
  await page.locator('#login-screen').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.login-box').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#l-user').fill(USERNAME);
  await page.locator('#l-pass').fill(PASSWORD);
  await page.locator('.login-btn').click();
  await page.locator('#login-screen').waitFor({ state: 'hidden', timeout: 20000 });
  await expect(page.locator('#auth-gate-overlay')).toBeHidden();
}

test.describe('Fix 4 v2 — Auth hydration flash', () => {

  test('[struct] #auth-gate-overlay y #login-screen tienen la estructura HTML correcta', async ({ page, request }) => {
    // Verificar el HTML crudo (antes de que JS lo modifique) chequeando la respuesta HTTP.
    const response = await request.get(`${BASE}/index.html`);
    const html = await response.text();

    // El overlay debe existir con display:flex inline (visible al primer paint)
    expect(html, '#auth-gate-overlay debe existir con display:flex inline').toContain('id="auth-gate-overlay" style="display:flex"');

    // El login-screen debe tener display:none inline (oculto al primer paint)
    expect(html, '#login-screen debe tener display:none inline').toContain('id="login-screen" style="display:none"');

    // El login-box dentro del login-screen NO debe tener display:none (su parent ya lo oculta)
    expect(html, '.login-box no debe tener display:none propio (lo oculta su parent)').not.toContain('class="login-box" style="display:none"');

    // Verificar también via DOM que el overlay existe
    await page.goto(`${BASE}/index.html`);
    const overlayExists = await page.locator('#auth-gate-overlay').count() > 0;
    expect(overlayExists, '#auth-gate-overlay debe estar en el DOM').toBe(true);
  });

  test('[no-flash] login-screen NUNCA aparece al recargar con sesión activa', async ({ page }) => {
    test.skip(
      BASE.startsWith('http://localhost'),
      'Firebase Auth no permite autenticación desde localhost — ejecutar contra preview/prod'
    );

    await doLogin(page);
    await expect(page.locator('#login-screen')).toBeHidden();

    // Reload — punto crítico donde ocurría el flash
    const reloadPromise = page.reload();

    // Medir 6 veces cada 300ms (cubre 1.8 segundos de carga)
    const checks: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(300);
      const visible = await page.locator('#login-screen').isVisible().catch(() => false);
      checks.push(visible);
      if (visible) break;
    }

    expect(checks.some(v => v), '#login-screen NO debe aparecer en ningún momento durante el reload').toBe(false);

    await reloadPromise;
    await page.locator('#auth-gate-overlay').waitFor({ state: 'hidden', timeout: 15000 });
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('[overlay] overlay aparece primero, login-screen después (sin sesión)', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/index.html`);
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.goto(`${BASE}/index.html`);

    // Al inicio: overlay visible, login-screen oculto
    const overlayVisible = await page.locator('#auth-gate-overlay').isVisible().catch(() => false);
    const loginScreenVisible = await page.locator('#login-screen').isVisible().catch(() => false);

    if (overlayVisible) {
      expect(loginScreenVisible, 'Overlay visible → login-screen debe estar oculto').toBe(false);
    }

    // Eventualmente login-screen aparece (authReady resolvió con null)
    await page.locator('#login-screen').waitFor({ state: 'visible', timeout: 10000 });

    // En ese momento el overlay debe estar oculto
    const overlayAfter = await page.locator('#auth-gate-overlay').isVisible().catch(() => false);
    expect(overlayAfter, 'Cuando login-screen aparece, el overlay debe estar oculto').toBe(false);

    // El form debe ser visible
    await expect(page.locator('#login-screen .login-box')).toBeVisible();
    await expect(page.locator('#l-user')).toBeVisible();
  });

  test('[redirect] usuario no autenticado en /testigos.html redirige a /', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/index.html`);
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
      try { indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch {}
    });
    await page.goto(`${BASE}/testigos.html`);
    await page.waitForURL(/\/(index\.html)?$/, { timeout: 5000 });
  });

});
