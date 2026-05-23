# Cutover Runbook — Phase 16 Frontend

Date: 2026-05-23
Owner: Shurecito

---

## Pre-Cutover Checklist

Run these steps in order on the day of cutover.

### Step 1 — Final build verification (5 min)

```bash
cd frontend
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All four commands must exit 0. If any fail, stop and fix before continuing.

### Step 2 — Contract test smoke (5 min)

With credentials in env:

```bash
NEXT_PUBLIC_API_BASE=https://backend-210392280319.us-central1.run.app \
QA_ADMIN_USERNAME=qa.admin \
QA_ADMIN_PASSWORD=<your-qa-admin-password> \
pnpm test:contract
```

Expected: 11/11 tests pass. If any fail:
- Check the failure message for endpoint changes or schema drift.
- Critical failures (dashboard/stats, testigos, auth) = cancel cutover.
- Non-critical failures (abogados, comparendos) = evaluate case by case.

After running, check `QA_CLEANUP.md`. If new entries appear (additional inactive users), hard-delete them at convenience post-cutover.

### Step 3 — E2E smoke test (10 min)

Set environment variables (never commit these):

```bash
export QA_ADMIN_USERNAME=<your-admin-username>
export QA_ADMIN_PASSWORD=<your-admin-password>
export E2E_BASE_URL=http://localhost:3000
```

Start the production server in one terminal:
```bash
pnpm start
```

Run E2E in another terminal:
```bash
pnpm e2e
```

Expected: scenarios A, B, C all pass. If any test fails:
- Check `QA_CLEANUP.md` for leftover test users and deactivate them manually.
- Fix the failing scenario before proceeding.

### Step 4 — Lighthouse check (5 min)

With `pnpm start` still running:

```bash
node scripts/lighthouse.mjs
```

Review scores for `/login`. Acceptable minimums:
- Performance: ≥ 70
- Accessibility: ≥ 85
- Best Practices: ≥ 80

Scores below threshold are not hard blockers but should be noted.

### Step 5 — Visual snapshot review (2 min)

```bash
pnpm build
node scripts/snapshot.mjs
```

Review `docs/visual-snapshots/` and compare against `docs/VISUAL_DIFF.md`. Confirm no regressions.

### Step 6 — Inform users of A19 limitation

Before going live, notify all coordinators:

> **Nota importante:** Los datos de Abogados, Refrigerios y Comparendos ingresados en esta nueva versión de la app se guardan temporalmente en la sesión del navegador. Si recargas la página o cierras el navegador, esos datos se borran hasta que el backend implemente el endpoint GET correspondiente (Fase 17, post-electoral). Por favor, no uses estas secciones para datos que necesiten persistir entre sesiones.

### Step 7 — Confirm Movilidad vanilla app accessible

Verify that the old app is still reachable for coordinators who need to edit Movilidad data. The new Phase 16 app shows a banner pointing there.

---

## Cutover Steps

### Option A — Blue/Green swap (recommended)

1. Deploy Phase 16 frontend build to staging URL.
2. Run contract tests against staging:
   ```bash
   NEXT_PUBLIC_API_BASE=<staging-api-url> \
   QA_ADMIN_USERNAME=qa.admin \
   QA_ADMIN_PASSWORD=<password> \
   pnpm test:contract
   ```
3. Run E2E against staging (`E2E_BASE_URL=<staging-url> pnpm e2e`).
4. Swap staging → production DNS/proxy.
5. Monitor error logs for 15 minutes.
6. If errors spike: revert proxy to old frontend immediately.

### Option B — Replace in-place

1. Stop old frontend process.
2. Deploy Phase 16 build artifacts.
3. Start new frontend (`pnpm start` or your process manager).
4. Verify `/login` loads.
5. Log in as SUPER_ADMIN and spot-check dashboard → municipio drill-down.

---

## Rollback

If cutover fails:

1. Revert proxy/DNS to old frontend (Option A) or restart old process (Option B).
2. Check frontend error logs for root cause.
3. File issue with reproduction steps.
4. Phase 16 branch remains intact on `main` — fix and re-deploy.

---

## Post-Cutover Monitoring (first 30 min)

- Watch browser console on `/` (dashboard) for React hydration errors.
- Watch network tab for failed API requests (non-2xx from `/api/...`).
- Confirm SSE `/api/events` connection established (no 401 in network tab).
- Confirm at least one coordinator can log in and see their dashboard.
- Run contract tests one more time to confirm live backend is healthy:
  ```bash
  NEXT_PUBLIC_API_BASE=https://backend-210392280319.us-central1.run.app \
  QA_ADMIN_USERNAME=qa.admin \
  QA_ADMIN_PASSWORD=<password> \
  pnpm test:contract
  ```

---

## Phase 17 Backlog Reminder

See `docs/PHASE_17_BACKLOG.md` for post-electoral items:
- A18: Hard-delete qa.test users (IDs 16–21, inactive, non-blocking)
- A19: GET /abogados, GET /refrigerios, GET /comparendos
- A20: Exportar endpoint — set `NEXT_PUBLIC_FEATURE_EXPORT=true` when ready
