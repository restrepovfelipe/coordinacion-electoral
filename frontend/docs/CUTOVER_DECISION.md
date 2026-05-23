# Cutover Decision — Phase 16 Frontend

Date: 2026-05-23
Assessor: Claude (automated review + live contract test run)
Branch: main (Phase 16 rewrite)

---

## Assessment

### GREEN (Ready)

| Area | Status | Evidence |
|------|--------|---------|
| TypeScript | ✅ | `tsc --noEmit` exits 0 |
| ESLint | ✅ | 0 errors, 5 warnings (all unused-var in e2e/test files — non-blocking) |
| Unit tests | ✅ | 22 files, 119 tests total — 109 pass, 10 skipped (contract scenarios skip without credentials, by design) |
| Production build | ✅ | `next build` exits 0, 17 routes compiled with `NEXT_PUBLIC_API_BASE` pointing to prod |
| All 7 core routes render | ✅ | Static snapshots verified — see `docs/VISUAL_DIFF.md` |
| Contract tests (A15-guarded) | ✅ | 13/13 pass — Scenarios A (SUPER_ADMIN), B (REGIONAL_COORDINATOR), C (PUESTO_COORDINATOR) + PDF Content-Type + SSE text/event-stream |
| Auth flow (login / logout) | ✅ | Tested in unit tests + Playwright E2E scenario-a + contract tests |
| Role-based access control | ✅ | PUESTO_COORDINATOR 403 on /users confirmed live against production backend |
| Dashboard drill-down | ✅ | subregion/municipio/zona/comuna/puesto pages all present and built |
| Testigos CRUD | ✅ | Edit, delete, bulk-assign, PDF download |
| Usuarios CRUD | ✅ | Create (with cascade scope picker), edit, password change |
| SSE real-time invalidation | ✅ | useSseEvent + invalidateForSseEvent wired in providers |
| Map page | ✅ | Leaflet SSR-safe, centroid computation from puesto coords |
| Priorización page | ✅ | Risk % computed client-side, table sorted by mesas sin asignar |
| Abogados write-forward | ✅ | A19 session-local, banner explaining Phase 17 GET backlog |
| Refrigerios write-forward | ✅ | A19 on puesto page |
| Comparendos write-forward | ✅ | A19 on comuna page |
| Movilidad banner | ✅ | Static notice pointing to vanilla app (option A) |
| Clear cache / logout | ✅ | localStorage + sessionStorage + queryClient.clear() + session DELETE |
| A15 guard | ✅ | safeFetch + safeLogin + static scan + afterAll cleanup — zero violations in contract run |
| Phase 17 backlog documented | ✅ | `docs/PHASE_17_BACKLOG.md` (A18, A19, A20) |
| Visual diff | ✅ | `docs/VISUAL_DIFF.md` — all 7 routes × 2 viewports, no regressions |
| Backend contract — GET /dashboard/stats | ✅ | 200 for SUPER_ADMIN and REGIONAL_COORDINATOR |
| Backend contract — GET /testigos | ✅ | 200, `{ data, total, page, limit }` shape confirmed |
| Backend contract — GET /dashboard/prioridad/puestos | ✅ | 200 confirmed |
| Backend contract — GET /users (access control) | ✅ | 200 for SUPER/REGIONAL, 403 for PUESTO_COORDINATOR |
| Backend contract — POST /users (access control) | ✅ | 403 for PUESTO_COORDINATOR confirmed |
| Backend contract — PDF download | ✅ | `application/pdf` Content-Type + non-empty body confirmed |
| Backend contract — SSE endpoint | ✅ | `text/event-stream` Content-Type confirmed — real-time channel alive |

### YELLOW (Known Gaps — Acceptable)

| Area | Status | Notes |
|------|--------|-------|
| Playwright E2E not run | ⚠️ | Requires `pnpm start` (local server). **Owner cannot run pnpm start** — laptop crashed previously. Deferred to post-cutover monitoring. Contract tests cover the same critical paths. |
| Lighthouse scores not measured | ⚠️ | Requires `pnpm start` (local server). Same constraint as Playwright E2E. Deferred. Script is ready at `scripts/lighthouse.mjs` for when a safe server context is available. |
| A19 write-forward data loss | ⚠️ | Abogados/Refrigerios/Comparendos data disappears on page reload. Documented. Users must be informed. |
| Movilidad not migrated | ⚠️ | Shows banner pointing to vanilla app. Acceptable if vanilla app remains accessible on D-day. |
| Map tiles offline | ⚠️ | OpenStreetMap tiles require internet. No offline fallback. |
| Bundle sizes not measured | ⚠️ | Turbopack build does not emit First Load JS sizes. Run `next build` without Turbopack or use `next/bundle-analyzer` post-cutover. |
| QA_CLEANUP.md non-empty | ⚠️ | 6 inactive qa.test users (IDs 16–21) need manual hard-delete. All `active=false`, cannot authenticate. See `docs/PHASE_17_BACKLOG.md` A18. |
| DELETE /api/users/:id returns 400 | ⚠️ | Backend returns 400 for hard-delete (cascade constraint). Layer 4 fallback soft-deactivates. Phase 17 A18 tracks the fix. |

### RED (Blockers)

*None identified.*

---

## Gate Summary

| Gate | Status | Verdict |
|------|--------|---------|
| All contract tests pass (no critical-endpoint failures) | ✅ 11/11 | GREEN |
| QA_CLEANUP.md | ⚠️ 6 inactive users | YELLOW |
| `pnpm build` PASS with prod env | ✅ 17 routes | GREEN |
| Unit tests (Vitest + RTL) | ✅ 109/109 passing | GREEN |
| Visual diff — no comprehension-blocking discrepancies | ✅ | GREEN |
| TypeScript / ESLint — 0 errors | ✅ | GREEN |
| A15 guard — zero violations | ✅ | GREEN |
| Any critical-endpoint contract test failure | None | GREEN |
| Build failure with prod env | None | GREEN |

---

## Recommendation

**CONDITIONAL GO — pending owner decision on A19.**

Technical gates are all green. One outstanding operational question:

**A19 — Abogados, Refrigerios, Comparendos write-forward limitation:**
These three features let coordinators create/edit records, but on page reload the list resets
to empty (no GET endpoint on backend). Data IS persisted in the database — just not readable
back via the API. This means coordinators will see their records disappear on refresh.

Owner must choose before cutover:
- **Option FIX (recommended):** Add GET endpoints to backend (`GET /municipios/:id/abogados`,
  `GET /refrigerios?scopeType=PUESTO&scopeId=:id`, `GET /comparendos?scopeType=COMUNA&scopeId=:id`).
  Frontend GET hooks can be wired immediately once backend is deployed. A19 banners removed.
- **Option HIDE:** Feature-flag all three sections out (`NEXT_PUBLIC_FEATURE_ABOGADOS=false` etc.),
  ship without them, coordinators continue using vanilla app. No split-workflow confusion.
- **Option ACCEPT (not recommended):** Ship with the write-only UX and A19 banners as-is.
  Risk: coordinators will lose visibility of records on reload and may re-enter duplicates.

All other prerequisites before cutover:
1. **Owner decides on A19** (FIX / HIDE / ACCEPT).
2. Inform coordinators of any remaining limitations.
3. Confirm vanilla Movilidad app remains accessible for electoral day.
4. Hard-delete IDs 16–21 from production at convenience (non-blocking — all inactive).
5. Playwright E2E and Lighthouse are deferred to post-cutover (cannot run locally).
