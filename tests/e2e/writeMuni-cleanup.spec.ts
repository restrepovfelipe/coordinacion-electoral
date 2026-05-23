/**
 * GATE 4 / D2 — writeMuni cleanup verification
 *
 * Asserts that addTestigo, delTestigo, saveAbogado, saveRefrig, saveComparendos
 * do NOT invoke writeMuni (only legitimate in coordinator + movilidad paths).
 *
 * No login required — functions are global; we spy before calling with api=undefined.
 *
 * Run: npx playwright test tests/e2e/writeMuni-cleanup.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = 'https://coordinacion-electoral.vercel.app';

async function waitForScripts(page: Page): Promise<void> {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  // Wait until addTestigo is defined (app.js fully parsed)
  await page.waitForFunction(
    () => typeof (window as Window & { addTestigo?: unknown }).addTestigo === 'function',
    { timeout: 30_000 },
  );
}

test('addTestigo and delTestigo do not call writeMuni', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForScripts(page);

  const callCount = await page.evaluate(() => {
    const win = window as Window & {
      writeMuni?: (...args: unknown[]) => unknown;
      addTestigo?: (...args: unknown[]) => unknown;
      delTestigo?: (...args: unknown[]) => unknown;
      api?: unknown;
    };

    let calls = 0;
    const original = win.writeMuni;
    win.writeMuni = (...args) => { calls++; return original?.(...args); };

    win.api = undefined;

    const n = '__test_muni__';
    const ck = '__test_cc__';
    const pKey = encodeURIComponent('__test_puesto__');
    const id = '__test_id__';

    if (typeof win.addTestigo === 'function') win.addTestigo(n, ck, pKey, id);
    if (typeof win.delTestigo === 'function') win.delTestigo(n, ck, pKey, 0, id);

    win.writeMuni = original;
    return calls;
  });

  expect(callCount, 'addTestigo/delTestigo must not call writeMuni').toBe(0);
});

test('saveAbogado, saveRefrig, saveComparendos do not call writeMuni', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForScripts(page);

  const callCount = await page.evaluate(() => {
    const win = window as Window & {
      writeMuni?: (...args: unknown[]) => unknown;
      saveAbogado?: (...args: unknown[]) => unknown;
      saveRefrig?: (...args: unknown[]) => unknown;
      saveComparendos?: (...args: unknown[]) => unknown;
      api?: unknown;
    };

    let calls = 0;
    const original = win.writeMuni;
    win.writeMuni = (...args) => { calls++; return original?.(...args); };

    win.api = undefined;

    const n = '__test_muni__';
    const ck = '__test_cc__';
    const id = '__test_id__';

    // Functions call render helpers that need DOM elements; suppress those errors —
    // we only care whether writeMuni was called before the render throws.
    try { if (typeof win.saveAbogado === 'function') win.saveAbogado(n, ck, id); } catch { /* expected: missing DOM element */ }
    try { if (typeof win.saveRefrig === 'function') win.saveRefrig(n, ck, id); } catch { /* expected: missing DOM element */ }
    try { if (typeof win.saveComparendos === 'function') win.saveComparendos(n, ck, id); } catch { /* expected: missing DOM element */ }

    win.writeMuni = original;
    return calls;
  });

  expect(callCount, 'saveAbogado/saveRefrig/saveComparendos must not call writeMuni').toBe(0);
});

test('writeMuni is still present (movilidad/coordinator paths intact)', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForScripts(page);

  const exists = await page.evaluate(
    () => typeof (window as Window & { writeMuni?: unknown }).writeMuni === 'function',
  );

  expect(exists, 'writeMuni must still be defined for movilidad + coordinator callers').toBe(true);
});
