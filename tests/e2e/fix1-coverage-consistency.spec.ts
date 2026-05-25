/**
 * Fix 1 real — coverage % consistency: card (overview) == detail view
 *
 * Root cause fixed: _refreshMuniStats no longer overwrites #mh-cov-pct
 * with the wrong local formula (_ccStats, 1:1 testigo:mesa).
 * Both card and detail now show the API value (_dashboardStatsByMuni[n].coberturaPct).
 *
 * Run: npx playwright test tests/e2e/fix1-coverage-consistency.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = 'https://coordinacion-electoral.vercel.app';

const SA_USER = '1040572640';
const SA_PASS = 'SmokeTest2026!';

const TEST_MUNI = 'MEDELLIN';

async function loginAsSuperAdmin(page: Page): Promise<void> {
  await page.goto(BASE);
  await page.waitForSelector('#l-user', { timeout: 15_000 });
  await page.fill('#l-user', SA_USER);
  await page.fill('#l-pass', SA_PASS);
  await page.click('.login-btn');
  await page.waitForFunction(
    () =>
      typeof (window as Window & { CURRENT_USER?: unknown }).CURRENT_USER ===
        'object' &&
      (window as Window & { CURRENT_USER?: unknown }).CURRENT_USER !== null,
    { timeout: 30_000 },
  );
}

test('coverage % on overview card equals % on detail view after testigos load', async ({ page }) => {
  await loginAsSuperAdmin(page);

  // Wait for dashboard stats to load and be applied to the DOM
  await page.waitForFunction(
    (muni: string) => {
      const el = document.querySelector(`[data-cobertura-muni="${muni}"]`);
      return el !== null && el.textContent !== null && el.textContent.trim() !== '' && el.textContent.trim() !== '0%';
    },
    TEST_MUNI,
    { timeout: 15_000 },
  );

  // Read the card coverage % from overview
  const cardPct = await page
    .locator(`[data-cobertura-muni="${TEST_MUNI}"]`)
    .first()
    .textContent();
  expect(cardPct).toBeTruthy();
  const cardValue = cardPct!.trim();

  // Click the municipality card to navigate to detail view
  await page.locator(`[data-muni="${TEST_MUNI}"], [data-action="open-muni"][data-name="${TEST_MUNI}"], .muni-card`).first().click().catch(async () => {
    // Fallback: find by text content
    await page.getByText('MEDELLÍN').first().click();
  });

  // Wait for detail view to render (mh-cov-pct element appears)
  await page.waitForSelector('#mh-cov-pct', { timeout: 10_000 });

  // Read the detail view coverage % — initially set by renderMuni (API-first)
  const detailPctInitial = await page.locator('#mh-cov-pct').textContent();
  expect(detailPctInitial).toBeTruthy();

  // Wait for testigos to load (loadAllTestigosForMuni completes, _refreshMuniStats runs)
  // The key invariant: _refreshMuniStats must NOT change #mh-cov-pct
  await page.waitForTimeout(5_000);

  const detailPctAfterLoad = await page.locator('#mh-cov-pct').textContent();
  expect(detailPctAfterLoad).toBeTruthy();

  // Main assertion: detail % must equal card % (API value preserved, not overwritten)
  expect(detailPctAfterLoad!.trim()).toBe(cardValue);
});

test('_refreshMuniStats does not overwrite #mh-cov-pct', async ({ page }) => {
  await loginAsSuperAdmin(page);

  // Wait for dashboard stats to populate _dashboardStatsByMuni
  await page.waitForFunction(
    (muni: string) => {
      const win = window as Window & { _dashboardStatsByMuni?: Record<string, { coberturaPct: number }> };
      return win._dashboardStatsByMuni?.[muni] !== undefined;
    },
    TEST_MUNI,
    { timeout: 15_000 },
  );

  // Navigate to detail view
  await page.locator(`[data-cobertura-muni="${TEST_MUNI}"]`).first().click().catch(async () => {
    await page.getByText('MEDELLÍN').first().click();
  });

  await page.waitForSelector('#mh-cov-pct', { timeout: 10_000 });

  // Get the API value
  const apiValue = await page.evaluate((muni: string) => {
    const win = window as Window & { _dashboardStatsByMuni?: Record<string, { coberturaPct: number }> };
    return win._dashboardStatsByMuni?.[muni]?.coberturaPct;
  }, TEST_MUNI);
  expect(apiValue).toBeDefined();
  expect(apiValue).toBeGreaterThan(0);

  // Read #mh-cov-pct immediately after render
  const pctAfterRender = await page.locator('#mh-cov-pct').textContent();
  expect(pctAfterRender!.trim()).toBe(`${apiValue}%`);

  // Manually trigger _refreshMuniStats (as it would be called after testigos load)
  await page.evaluate((muni: string) => {
    const win = window as Window & { _refreshMuniStats?: (n: string) => void };
    if (typeof win._refreshMuniStats === 'function') {
      win._refreshMuniStats(muni);
    }
  }, TEST_MUNI);

  // #mh-cov-pct must still show the API value
  const pctAfterRefresh = await page.locator('#mh-cov-pct').textContent();
  expect(pctAfterRefresh!.trim()).toBe(`${apiValue}%`);
});
