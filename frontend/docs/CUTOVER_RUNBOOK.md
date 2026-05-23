# Cutover Runbook — Phase 16 Frontend

Date: 2026-05-23
Owner: Shurecito

---

## Hard Constraints

**NO pnpm start. NO pnpm dev. NO local Next.js server.**
The owner's machine cannot run a Next.js dev/prod server locally (prior crash).
Playwright E2E and Lighthouse are therefore NOT part of this runbook.
Pre-cutover validation relies entirely on the contract test suite (`tests/contract/`),
which runs against the live production backend with no local server dependency.

---

## Pre-Cutover Checklist

Run these steps in order on the day of cutover. All commands exit without needing a local server.

### Step 1 — Final static verification (5 min)

```bash
cd frontend
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

Expected:
- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors (warnings in e2e/test files are acceptable)
- `pnpm test` → all unit/Vitest tests pass (contract scenarios skip without QA credentials, by design)

If any fail, stop and fix before continuing.

### Step 2 — Production build verification (5 min)

```bash
NEXT_PUBLIC_API_BASE=https://backend-210392280319.us-central1.run.app pnpm build
```

Expected: `next build` exits 0, all 17 routes compile. No TypeScript errors during build.

### Step 3 — Contract test suite (10 min)

This is the primary pre-cutover validation. Runs against the live production backend.
No local server required.

```bash
NEXT_PUBLIC_API_BASE=https://backend-210392280319.us-central1.run.app \
QA_ADMIN_USERNAME=qa.admin \
QA_ADMIN_PASSWORD=<your-qa-admin-password> \
pnpm test:contract
```

Expected: **13/13 tests pass**. Coverage:

| Test | What it verifies |
|------|-----------------|
| Layer 2 static scan | No hardcoded non-qa usernames in test source |
| A-1: GET /dashboard/stats | Dashboard endpoint live for SUPER_ADMIN |
| A-2: GET /users | Users endpoint live for SUPER_ADMIN |
| A-3: GET /testigos | Testigos list live, `data` array shape confirmed |
| A-4: GET /dashboard/prioridad/puestos | Prioridad list live |
| A-5: GET /asignacion/puesto/:id/pdf | PDF returns `application/pdf`, non-empty body |
| A-6: GET /events | SSE returns `text/event-stream` — real-time channel alive |
| B-1: GET /dashboard/stats | Dashboard live for REGIONAL_COORDINATOR |
| B-2: GET /testigos | Testigos live for REGIONAL_COORDINATOR |
| B-3: GET /users | Users readable for REGIONAL_COORDINATOR |
| C-1: GET /dashboard/stats | Dashboard live for PUESTO_COORDINATOR |
| C-2: GET /users → 403 | PUESTO_COORDINATOR correctly blocked from users list |
| C-3: POST /users → 403 | PUESTO_COORDINATOR correctly blocked from creating users |

If any test fails:
- **Critical failure** (A-1, A-5, A-6, B-1, C-2, C-3): cancel cutover.
- **Non-critical failure** (A-3 shape, A-4, B-2, B-3): evaluate before proceeding.

After running, check `QA_CLEANUP.md`. If new entries appear, they are inactive users
that the Layer 4 cleanup soft-deactivated. Non-blocking — clean up manually post-cutover.

### Step 4 — Inform users of A19 limitation

Before going live, notify all coordinators:

> **Nota importante:** Los datos de Abogados, Refrigerios y Comparendos ingresados en esta nueva versión de la app se guardan temporalmente en la sesión del navegador. Si recargas la página o cierras el navegador, esos datos se borran hasta que el backend implemente el endpoint GET correspondiente (Fase 17, post-electoral). Por favor, no uses estas secciones para datos que necesiten persistir entre sesiones.

*(Note: this step is only needed if the A19 limitation is accepted. See CUTOVER_DECISION.md.)*

### Step 5 — Confirm Movilidad vanilla app accessible

Verify that the old vanilla app is still reachable. The new Phase 16 app shows a banner pointing there.

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
3. Swap staging → production DNS/proxy.
4. Monitor error logs for 15 minutes (see Post-Cutover Monitoring below).
5. If errors spike: revert proxy to old frontend immediately.

### Option B — Replace in-place

1. Stop old frontend process.
2. Deploy Phase 16 build artifacts.
3. Start new frontend (via process manager — not locally).
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

Run contract tests one more time to confirm the live stack is healthy after swap:

```bash
NEXT_PUBLIC_API_BASE=https://backend-210392280319.us-central1.run.app \
QA_ADMIN_USERNAME=qa.admin \
QA_ADMIN_PASSWORD=<password> \
pnpm test:contract
```

**Playwright E2E and Lighthouse are deferred to post-cutover:**
They require a running Next.js server which the owner cannot run locally.
The contract test suite covers the same critical paths (auth, RBAC, SSE, PDF) against the
live backend. Lighthouse scores and full browser UI flows are a post-cutover monitoring task.

---

## Phase 17 Backlog Reminder

See `docs/PHASE_17_BACKLOG.md` for post-electoral items:
- A18: Hard-delete qa.test users (IDs 16–21, inactive, non-blocking)
- A19: GET /abogados, GET /refrigerios, GET /comparendos — or hide features behind flags
- A20: Exportar endpoint — set `NEXT_PUBLIC_FEATURE_EXPORT=true` when ready
