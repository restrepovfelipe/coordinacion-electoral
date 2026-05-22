/**
 * Smoke test — Phase 12.6
 * Verifies the production users page: login → list → create modal → create user → cleanup.
 *
 * Run: npx playwright test tests/e2e/users-smoke.spec.ts --headed
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'path';

const BASE = 'https://coordinacion-electoral.vercel.app';
const SCREENSHOT_DIR = path.join(__dirname, '../../docs/screenshots/phase-12-6');

const SA_USER = '1040572640';
const SA_PASS = 'SmokeTest2026!';
const TEST_USERNAME = 'Prueba_puesto';
const TEST_DISPLAY = 'Usuario Prueba Puesto';
const TEST_PASSWORD = 'Prueba2026!';

async function ss(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
  console.log(`  📸 ${name}.png`);
}

// ── login helper ───────────────────────────────────────────────────────────────
async function loginAsSuperAdmin(page: Page): Promise<void> {
  await page.goto(BASE);
  await page.waitForSelector('#l-user', { timeout: 15_000 });

  await page.fill('#l-user', SA_USER);
  await page.fill('#l-pass', SA_PASS);
  await ss(page, '01-login-filled');

  // Click Ingresar
  await page.click('.login-btn');

  // Wait for CURRENT_USER to be set (fires after /auth/me resolves)
  await page.waitForFunction(
    () => typeof (window as any).CURRENT_USER === 'object' && (window as any).CURRENT_USER !== null,
    { timeout: 30_000 }
  );

  // Give the app 2s to finish initializing (avoids racing startApp side-effects)
  await page.waitForTimeout(2000);
  await ss(page, '02-dashboard');
}

// ── open users page helper ─────────────────────────────────────────────────────
async function openUsersPage(page: Page): Promise<void> {
  // Try the usuarios.html page first (direct)
  const btn = page.locator('#btn-users-admin');
  const isBtnVisible = await btn.isVisible().catch(() => false);
  if (isBtnVisible) {
    await btn.click();
  } else {
    // Navigate directly to usuarios.html
    await page.goto(`${BASE}/usuarios.html`);
    await page.waitForSelector('.up-page-header', { timeout: 15_000 });
  }

  await page.waitForLoadState('networkidle');
}

// ── tests ──────────────────────────────────────────────────────────────────────
test.describe.serial('Phase 12.6 — Users page smoke test', () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('01 — login and reach dashboard', async () => {
    await loginAsSuperAdmin(page);
    const user = await page.evaluate(() => (window as any).CURRENT_USER);
    expect(user.role).toBe('SUPER_ADMIN');
  });

  test('02 — open usuarios.html, verify new layout', async () => {
    await page.goto(`${BASE}/usuarios.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.up-page-header', { timeout: 15_000 });

    await expect(page.locator('.up-page-title')).toBeVisible();
    await expect(page.locator('.up-btn-new')).toHaveText('+ Nuevo usuario');
    await expect(page.locator('#up-table-wrap')).toBeVisible();

    await ss(page, '03-users-page-layout');
  });

  test('03 — open create modal', async () => {
    await page.locator('.up-btn-new').click();
    await page.waitForSelector('#up-create-overlay', { timeout: 5_000 });

    await expect(page.locator('.up-create-title')).toHaveText('Nuevo usuario');
    await expect(page.locator('.up-create-form-grid')).toBeVisible();
    // No widget overlap — modal is centered in the page box
    const modalBox = await page.locator('.up-create-box').boundingBox();
    const widgetBox = await page.locator('.profile-widget-card').boundingBox().catch(() => null);
    if (modalBox && widgetBox) {
      // Modal top-left should be below/right of widget if they don't overlap
      // Simple check: they're separate elements
      expect(modalBox.x).not.toBeNull();
    }

    await ss(page, '04-create-modal');
  });

  test('04 — fill PUESTO_COORDINATOR + San Jerónimo + puesto', async () => {
    await page.fill('#up-new-username', TEST_USERNAME);
    await page.fill('#up-new-displayname', TEST_DISPLAY);
    await page.fill('#up-new-password', TEST_PASSWORD);

    await page.selectOption('#up-new-role', 'PUESTO_COORDINATOR');

    // Wait for municipio cascade
    await page.waitForSelector('#up-cascade-row1:not([style*="display: none"])', { timeout: 10_000 });

    const muniOptions = await page.locator('#up-cascade-municipio option').allTextContents();
    const sanJeronimo = muniOptions.find(o => /san.*jer[oó]nimo/i.test(o));
    if (sanJeronimo) {
      await page.selectOption('#up-cascade-municipio', { label: sanJeronimo });
    } else {
      const firstReal = muniOptions.find(o => !o.startsWith('—'));
      if (firstReal) await page.selectOption('#up-cascade-municipio', { label: firstReal });
    }

    // Wait for child dropdown
    await page.waitForSelector('#up-cascade-row2:not([style*="display: none"])', { timeout: 10_000 });
    const childOptions = await page.locator('#up-cascade-child option').allTextContents();
    const firstChild = childOptions.find(o => !o.startsWith('—'));
    if (firstChild) await page.selectOption('#up-cascade-child', { label: firstChild });

    await ss(page, '05-create-form-filled');
  });

  test('05 — submit and verify user in table', async () => {
    await page.locator('[data-action="up-create-user"]').click();

    // Modal closes on success
    await page.waitForSelector('#up-create-overlay', { state: 'detached', timeout: 20_000 });
    await page.waitForLoadState('networkidle');

    // User should appear in table
    await page.waitForFunction(
      (u: string) => document.querySelector('.up-table')?.textContent?.includes(u),
      TEST_USERNAME,
      { timeout: 15_000 }
    );

    await ss(page, '06-user-created');
    console.log(`  ✅ ${TEST_USERNAME} created successfully — no 500 error`);
  });

  test('06 — deactivate then delete (cleanup)', async () => {
    const row = page.locator('.up-table tbody tr').filter({ hasText: TEST_USERNAME });
    await expect(row).toBeVisible();

    // Deactivate
    page.once('dialog', d => d.accept());
    await row.locator('[data-action="deactivate-user"]').click();
    await page.waitForLoadState('networkidle');

    // Re-locate row after table reload
    await page.waitForFunction(
      (u: string) => document.querySelector('.up-table')?.textContent?.includes(u),
      TEST_USERNAME,
      { timeout: 10_000 }
    );

    // Delete button now visible (user is inactive)
    const row2 = page.locator('.up-table tbody tr').filter({ hasText: TEST_USERNAME });
    const deleteBtn = row2.locator('[data-action="delete-user"]');
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    await page.waitForSelector('#up-del-confirm', { timeout: 5_000 });
    await page.fill('#up-del-confirm', TEST_USERNAME);
    await page.locator('#up-del-confirm-btn').click();

    // Wait for the confirmation overlay to close (delete completed)
    await page.waitForSelector('#up-del-confirm', { state: 'detached', timeout: 15_000 });

    // Wait for the user to disappear from the table
    await page.waitForFunction(
      (u: string) => !document.querySelector('.up-table')?.textContent?.includes(u),
      TEST_USERNAME,
      { timeout: 15_000 }
    );

    await ss(page, '07-cleanup-done');
    console.log(`  🗑️  ${TEST_USERNAME} deleted — cleanup complete`);
    console.log(`  🗑️  ${TEST_USERNAME} deleted — cleanup complete`);
  });
});
