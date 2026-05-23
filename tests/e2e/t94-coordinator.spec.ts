/**
 * T94 — Coordinator ad-hoc persistence (GATE 5 frontend E2E)
 *
 * Verifies that savePCard and saveM fire PATCH /api/coordinador/:scope/:id/adhoc.
 *
 * Strategy: stub window.api.patch + window.writeMuni, seed _puestoIdCacheRef
 * (the same object that getPuestoBackendId reads, exposed on window by reference),
 * create the required DOM inputs, call the functions, then assert patch was recorded.
 * No login required — functions are global.
 *
 * Run: npx playwright test tests/e2e/t94-coordinator.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = 'https://coordinacion-electoral.vercel.app';

async function waitForScripts(page: Page): Promise<void> {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(
    () => typeof (window as Window & { addTestigo?: unknown }).addTestigo === 'function',
    { timeout: 30_000 },
  );
}

// ── Test 1: savePCard fires PATCH for puesto ─────────────────────────────────

test('savePCard fires PATCH /coordinador/puesto/:id/adhoc', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForScripts(page);

  const result = await page.evaluate(async () => {
    type AppWindow = Window & {
      savePCard?: (n: string, k: string, ck: string, pcid: string) => Promise<void>;
      writeMuni?: (n: string) => Promise<void>;
      api?: { patch: (url: string, body: unknown) => Promise<unknown> };
      _puestoIdCacheRef?: Record<string, Record<string, unknown>>;
      CURRENT_USER?: unknown;
    };
    const win = window as AppWindow;

    const calls: { url: string; body: unknown }[] = [];
    win.api = {
      patch: (url, body) => { calls.push({ url, body }); return Promise.resolve({}); },
    };
    win.CURRENT_USER = { id: 1 };
    win.writeMuni = () => Promise.resolve();

    // Seed the actual module-level cache via its window reference
    const MUNI = '__T94_MUNI__';
    const KEY  = '__T94_KEY__';
    if (win._puestoIdCacheRef) {
      win._puestoIdCacheRef[MUNI] = { [KEY]: 9001, _muniId: 8001, _ccIds: {} };
    }

    // Create DOM inputs savePCard reads
    const pcid = 'pc_t94test';
    (['coord', 'phone', 'tag'] as const).forEach((s, i) => {
      let el = document.getElementById(`${pcid}-${s}`) as HTMLInputElement | null;
      if (!el) { el = document.createElement('input'); el.id = `${pcid}-${s}`; document.body.appendChild(el); }
      el.value = i === 0 ? 'Ana García' : i === 1 ? '+573001' : 'n';
    });

    try {
      await win.savePCard?.(MUNI, KEY, 'CC1', pcid);
    } catch (_) { /* DOM helpers after api.patch may throw on missing elements */ }

    return calls;
  });

  const hit = result.find(c => /\/coordinador\/puesto\/\d+\/adhoc/.test(c.url));
  expect(hit, 'savePCard must fire PATCH /coordinador/puesto/:id/adhoc').toBeTruthy();
  const body = hit!.body as { nombre?: string | null; telefono?: string | null };
  expect(body.nombre).toBe('Ana García');
  expect(body.telefono).toBe('+573001');
});

// ── Test 2: saveM fires PATCH for muni and cc scopes ─────────────────────────

test('saveM fires PATCH /coordinador/<scope>/:id/adhoc', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForScripts(page);

  const results = await page.evaluate(async () => {
    type AppWindow = Window & {
      saveM?: () => Promise<void>;
      writeMuni?: (n: string) => Promise<void>;
      api?: { patch: (url: string, body: unknown) => Promise<unknown> };
      _puestoIdCacheRef?: Record<string, Record<string, unknown>>;
      CURRENT_USER?: unknown;
      MCX?: Record<string, unknown> | null;
    };
    const win = window as AppWindow;

    const calls: { url: string; body: unknown }[] = [];
    win.api = {
      patch: (url, body) => { calls.push({ url, body }); return Promise.resolve({}); },
    };
    win.CURRENT_USER = { id: 1 };
    win.writeMuni = () => Promise.resolve();

    const MUNI = '__T94_MUNI2__';
    if (win._puestoIdCacheRef) {
      win._puestoIdCacheRef[MUNI] = { _muniId: 2001, _ccIds: { CC1: 3001, cc1: 3001 } };
    }

    // Ensure modal + create coord/phone inputs saveM reads
    if (!document.getElementById('modal')) {
      const m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m);
    }
    function setInputs(coord: string, phone: string) {
      (['mi-c', 'mi-p', 'mi-n'] as const).forEach((id, i) => {
        let el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); }
        el.value = i === 0 ? coord : i === 1 ? phone : '';
      });
    }

    // — muni scope —
    win.MCX = { type: 'muni', n: MUNI, ck: null, k: null, zonaNombre: null };
    setInputs('Pedro M', '+573002');
    try { await win.saveM?.(); } catch (_) {}

    // — cc scope —
    win.MCX = { type: 'cc', n: MUNI, ck: 'CC1', k: null, zonaNombre: null };
    setInputs('Pedro CC', '+573003');
    try { await win.saveM?.(); } catch (_) {}

    return calls;
  });

  const muniCall = results.find(c => /\/coordinador\/municipio\/\d+\/adhoc/.test(c.url));
  expect(muniCall, 'saveM(muni) must fire PATCH /coordinador/municipio/:id/adhoc').toBeTruthy();
  expect((muniCall!.body as { nombre: string }).nombre).toBe('Pedro M');

  const ccCall = results.find(c => /\/coordinador\/comuna\/\d+\/adhoc/.test(c.url));
  expect(ccCall, 'saveM(cc) must fire PATCH /coordinador/comuna/:id/adhoc').toBeTruthy();
  expect((ccCall!.body as { nombre: string }).nombre).toBe('Pedro CC');
});

// ── Test 3: savePCard and saveM(p) produce same payload for the same puesto ───

test('savePCard and saveM(p) produce consistent payload for the same puesto', async ({ page }) => {
  test.setTimeout(90_000);
  await waitForScripts(page);

  const result = await page.evaluate(async () => {
    type AppWindow = Window & {
      savePCard?: (n: string, k: string, ck: string, pcid: string) => Promise<void>;
      saveM?: () => Promise<void>;
      writeMuni?: (n: string) => Promise<void>;
      api?: { patch: (url: string, body: unknown) => Promise<unknown> };
      _puestoIdCacheRef?: Record<string, Record<string, unknown>>;
      CURRENT_USER?: unknown;
      MCX?: Record<string, unknown> | null;
    };
    const win = window as AppWindow;

    const calls: { url: string; body: { nombre?: string | null; telefono?: string | null } }[] = [];
    win.api = {
      patch: (url, body) => {
        calls.push({ url, body: body as typeof calls[0]['body'] });
        return Promise.resolve({});
      },
    };
    win.CURRENT_USER = { id: 1 };
    win.writeMuni = () => Promise.resolve();

    const MUNI = '__T94_MUNI3__';
    const KEY  = '__T94_P3__';
    if (win._puestoIdCacheRef) {
      win._puestoIdCacheRef[MUNI] = { [KEY]: 7777, _muniId: 5001, _ccIds: {} };
    }

    if (!document.getElementById('modal')) {
      const m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m);
    }

    // — savePCard path —
    const pcid = 'pc_t94p3';
    (['coord', 'phone', 'tag'] as const).forEach((s, i) => {
      let el = document.getElementById(`${pcid}-${s}`) as HTMLInputElement | null;
      if (!el) { el = document.createElement('input'); el.id = `${pcid}-${s}`; document.body.appendChild(el); }
      el.value = i === 0 ? 'Shared Name' : i === 1 ? '+573099' : 'n';
    });
    try { await win.savePCard?.(MUNI, KEY, 'CC1', pcid); } catch (_) {}

    // — saveM(p) path —
    win.MCX = { type: 'p', n: MUNI, ck: null, k: KEY, zonaNombre: null };
    (['mi-c', 'mi-p', 'mi-n'] as const).forEach((id, i) => {
      let el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); }
      el.value = i === 0 ? 'Shared Name' : i === 1 ? '+573099' : '';
    });
    try { await win.saveM?.(); } catch (_) {}

    return calls.filter(c => /\/coordinador\/puesto\/\d+\/adhoc/.test(c.url));
  });

  expect(result.length, 'both savePCard and saveM(p) must fire PATCH for the same puesto').toBeGreaterThanOrEqual(2);
  const nombres = result.map(c => c.body.nombre);
  const telefonos = result.map(c => c.body.telefono);
  expect(new Set(nombres).size, 'nombre must be consistent across both paths').toBe(1);
  expect(new Set(telefonos).size, 'telefono must be consistent across both paths').toBe(1);
});
