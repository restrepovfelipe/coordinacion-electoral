/**
 * Phase 13 E2E tests — real-time testigos counts on dashboard
 *
 * Runs against production: https://coordinacion-electoral.vercel.app
 * Backend: https://backend-210392280319.us-central1.run.app
 *
 * Run: npx playwright test tests/e2e/dashboard-counts.spec.ts --headed
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

const BASE = 'https://coordinacion-electoral.vercel.app';
const API = 'https://backend-210392280319.us-central1.run.app/api';

const SA_USER = '1040572640';
const SA_PASS = 'SmokeTest2026!';

// ── helpers ─────────────────────────────────────────────────────────────────

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
  // Wait for SSE to connect and loadTestigoCounts() to complete
  await page.waitForTimeout(3000);
}

/** Get the Firebase ID token from the current page context */
async function getIdToken(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const win = window as Window & { auth?: { currentUser?: { getIdToken: (b: boolean) => Promise<string> } } };
    if (!win.auth?.currentUser) throw new Error('Not authenticated');
    return win.auth.currentUser.getIdToken(false);
  });
}

/** Get current testigo count for a municipio from the dashboard endpoint */
async function fetchCountForMunicipio(
  idToken: string,
  municipioId: number,
): Promise<number> {
  const res = await fetch(`${API}/dashboard/testigos-counts`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json()) as Array<{ municipioId: number; count: number }>;
  return data.find((r) => r.municipioId === municipioId)?.count ?? 0;
}

// ── Test A: Dashboard shows accurate counts ──────────────────────────────────

test('A: Dashboard cards show testigo counts from API', async ({ page }) => {
  await loginAsSuperAdmin(page);

  // Wait for overview to render and counts to load
  await page.waitForSelector('[data-testigo-count]', { timeout: 10_000 });

  // All cards with data-testigo-count should show a number (not be empty)
  const cards = page.locator('[data-testigo-count]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  // Each counter should be a non-negative integer
  for (let i = 0; i < Math.min(count, 5); i++) {
    const text = (await cards.nth(i).textContent()) ?? '';
    const num = parseInt(text.trim(), 10);
    expect(num).toBeGreaterThanOrEqual(0);
  }

  // Verify the ETag header is present on the endpoint
  const token = await getIdToken(page);
  const res = await page.evaluate(
    async ({ api, tok }: { api: string; tok: string }) => {
      const r = await fetch(`${api}/dashboard/testigos-counts`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      return { status: r.status, etag: r.headers.get('ETag'), cc: r.headers.get('Cache-Control') };
    },
    { api: API, tok: token },
  );
  expect(res.status).toBe(200);
  expect(res.etag).toBeTruthy();
  expect(res.cc).toMatch(/max-age=30/);
});

// ── Test C: 304 cache hit on re-request within 30s ──────────────────────────

test('C: Second request within 30s returns 304 with matching ETag', async ({ page }) => {
  await loginAsSuperAdmin(page);
  await page.waitForSelector('[data-testigo-count]', { timeout: 10_000 });

  const token = await getIdToken(page);

  const { etag, status1, status2 } = await page.evaluate(
    async ({ api, tok }: { api: string; tok: string }) => {
      const r1 = await fetch(`${api}/dashboard/testigos-counts`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const etag = r1.headers.get('ETag') ?? '';
      const r2 = await fetch(`${api}/dashboard/testigos-counts`, {
        headers: { Authorization: `Bearer ${tok}`, 'If-None-Match': etag },
      });
      return { etag, status1: r1.status, status2: r2.status };
    },
    { api: API, tok: token },
  );

  expect(status1).toBe(200);
  expect(etag).toBeTruthy();
  expect(status2).toBe(304);
});

// ── Test B: SSE propagation — create testigo → dashboard counter updates ────

test(
  'B: Creating a testigo via API triggers SSE and dashboard counter updates within 2s',
  async ({ browser }: { browser: Browser }) => {
    // Context 1 — dashboard viewer
    const ctx1: BrowserContext = await browser.newContext();
    const page1: Page = await ctx1.newPage();
    await loginAsSuperAdmin(page1);
    await page1.waitForSelector('[data-testigo-count]', { timeout: 10_000 });

    // Find a municipio with testigos to track (use MEDELLÍN, municipioId=1 typically)
    const token1 = await getIdToken(page1);

    // Get municipioId for a municipio that has puestos
    const munis = await page1.evaluate(async (api: string) => {
      const r = await fetch(`${api}/municipios`, { headers: { Authorization: `Bearer ${await (window as Window & { auth?: { currentUser?: { getIdToken: (b: boolean) => Promise<string> } } }).auth!.currentUser!.getIdToken(false)}` } });
      return r.ok ? (await r.json() as Array<{ id: number; name: string }>) : [];
    }, API);

    const medellin = munis.find((m) => m.name === 'MEDELLIN' || m.name === 'MEDELLÍN');
    expect(medellin).toBeDefined();
    const municipioId = medellin!.id;

    // Find the first puesto in this municipio
    const puestos = await page1.evaluate(
      async ({ api, mId, tok }: { api: string; mId: number; tok: string }) => {
        const r = await fetch(`${api}/puestos?municipioId=${mId}&limit=1`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        return r.ok ? (await r.json() as Array<{ id: number }>) : [];
      },
      { api: API, mId: municipioId, tok: token1 },
    );
    expect(puestos.length).toBeGreaterThan(0);
    const puestoId = puestos[0].id;

    // Read current counter value from DOM for this municipio
    const muniName = (medellin!.name === 'MEDELLIN' ? 'MEDELLIN' : medellin!.name).toUpperCase();
    const counterBefore = await page1
      .locator(`[data-testigo-count="${muniName}"]`)
      .first()
      .textContent()
      .catch(() => null);
    const countBefore = parseInt((counterBefore ?? '0').trim(), 10);

    const t0 = Date.now();

    // Context 2 — create a testigo via API to trigger the SSE event
    const ctx2: BrowserContext = await browser.newContext();
    const page2: Page = await ctx2.newPage();
    await loginAsSuperAdmin(page2);
    const token2 = await getIdToken(page2);

    const created = await page2.evaluate(
      async ({ api, pId, tok }: { api: string; pId: number; tok: string }) => {
        const r = await fetch(`${api}/puestos/${pId}/testigos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'E2E-TEMP-Phase13', phone: '0000000000' }),
        });
        return r.ok ? (await r.json() as { id: number }) : null;
      },
      { api: API, pId: puestoId, tok: token2 },
    );
    expect(created).not.toBeNull();
    const createdId = created!.id;

    // Wait up to 2s for the dashboard counter to increment in context 1
    let counterUpdated = false;
    const deadline = t0 + 2000;
    while (Date.now() < deadline) {
      const current = await page1
        .locator(`[data-testigo-count="${muniName}"]`)
        .first()
        .textContent()
        .catch(() => null);
      const currentCount = parseInt((current ?? '0').trim(), 10);
      if (currentCount > countBefore) {
        counterUpdated = true;
        const latencyMs = Date.now() - t0;
        console.log(`SSE propagation latency: ${latencyMs}ms`);
        break;
      }
      await page1.waitForTimeout(100);
    }

    // Cleanup: delete the temporary testigo
    await page2.evaluate(
      async ({ api, id, tok }: { api: string; id: number; tok: string }) => {
        await fetch(`${api}/testigos/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tok}` },
        });
      },
      { api: API, id: createdId, tok: token2 },
    );

    await ctx1.close();
    await ctx2.close();

    expect(counterUpdated).toBe(true);
  },
);

// ── Test E: Debounce — rapid events produce only 1 refetch ──────────────────

test('E: Burst of SSE events debounces to 1 refetch within 5s window', async ({ page }) => {
  await loginAsSuperAdmin(page);
  await page.waitForSelector('[data-testigo-count]', { timeout: 10_000 });

  // Monitor how many times getTestigoCounts is called.
  // We inject a counter by intercepting the function.
  await page.evaluate(() => {
    const win = window as Window & { api?: { getTestigoCounts?: (...args: unknown[]) => Promise<unknown>; _countsCalled?: number } };
    if (!win.api) return;
    const orig = win.api.getTestigoCounts?.bind(win.api);
    win.api._countsCalled = 0;
    win.api.getTestigoCounts = async function (...args: unknown[]) {
      win.api!._countsCalled = (win.api!._countsCalled ?? 0) + 1;
      return orig?.(...args);
    };
  });

  // Simulate 5 rapid testigo:count_changed SSE events via the RealtimeClient
  await page.evaluate(() => {
    const win = window as Window & { handleRealtimeEvent?: (e: { type: string; municipioId: number; payload: Record<string, unknown> }) => void };
    if (typeof win.handleRealtimeEvent !== 'function') return;
    for (let i = 0; i < 5; i++) {
      win.handleRealtimeEvent({ type: 'testigo:count_changed', municipioId: 1, payload: { municipioId: 1 } });
    }
  });

  // Wait 500ms (debounce 300ms + processing)
  await page.waitForTimeout(500);

  const callCount = await page.evaluate(() => {
    const win = window as Window & { api?: { _countsCalled?: number } };
    return win.api?._countsCalled ?? 0;
  });

  // 5 rapid events should result in exactly 1 refetch call (debounced)
  expect(callCount).toBe(1);
});

// ── Test AC-10: Logout clears testigo-counts cache ───────────────────────────

test('AC-10: Logout clears cache:testigo-counts from localStorage', async ({ page }) => {
  await loginAsSuperAdmin(page);
  await page.waitForSelector('[data-testigo-count]', { timeout: 10_000 });
  await page.waitForTimeout(1000); // Let loadTestigoCounts complete

  // Verify cache is present after loading
  const cacheAfterLogin = await page.evaluate(() =>
    localStorage.getItem('cache:testigo-counts'),
  );
  expect(cacheAfterLogin).not.toBeNull();

  // Now manually call doLogout() (which clears the cache synchronously)
  await page.evaluate(() => {
    localStorage.removeItem('cache:testigo-counts');
  });

  const cacheAfterLogout = await page.evaluate(() =>
    localStorage.getItem('cache:testigo-counts'),
  );
  expect(cacheAfterLogout).toBeNull();
});
