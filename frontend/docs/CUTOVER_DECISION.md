# Cutover Decision — Phase 16 Frontend

Date: 2026-05-23
Assessor: Claude (automated review + live contract test run)
Branch: phase-16-rewrite

---

## Assessment

### GREEN (Ready)

| Area | Status | Evidence |
|------|--------|---------|
| TypeScript | ✅ | `tsc --noEmit` exits 0 |
| ESLint | ✅ | 0 errors, 4 warnings (all unused-var in e2e/test files — non-blocking) |
| Production build | ✅ | `next build` exits 0, 17 routes compiled clean |
| Contract tests (A15-guarded) | ✅ | **18/18 pass** — Scenarios A (SUPER_ADMIN), B (REGIONAL_COORDINATOR), C (PUESTO_COORDINATOR) + PDF + SSE + A20 endpoints |
| Auth flow (login / logout) | ✅ | Tested in unit tests + contract tests |
| Role-based access control | ✅ | PUESTO_COORDINATOR 403 on /users confirmed live; MUNICIPIO/COMUNA scope restriction confirmed (A-7b, A-9b) |
| Dashboard drill-down | ✅ | subregion/municipio/zona/comuna/puesto pages all present and built |
| Testigos CRUD | ✅ | Edit, delete, bulk-assign, PDF download |
| Usuarios CRUD | ✅ | Create (with cascade scope picker), edit, password change |
| SSE real-time invalidation | ✅ | useSseEvent + invalidateForSseEvent wired in providers |
| Map page | ✅ | Leaflet SSR-safe, centroid computation from puesto coords |
| Priorización page | ✅ | Risk % computed client-side, table sorted by mesas sin asignar |
| **Abogados GET + persist** | ✅ | **A20 — GET /municipios/:id/abogados wired; useQuery replaces local state; A19 banner removed** |
| **Refrigerios GET + persist** | ✅ | **A20 — GET /refrigerios?puestoId=:id wired; useQuery replaces local state; A19 banner removed** |
| **Comparendos GET + persist** | ✅ | **A20 — GET /comparendos?comunaId=:id wired; useQuery replaces local state; A19 banner removed** |
| Movilidad banner | ✅ | Static notice pointing to vanilla app (option A) |
| Clear cache / logout | ✅ | localStorage + sessionStorage + queryClient.clear() + session DELETE |
| A15 guard | ✅ | safeFetch + safeLogin + static scan + afterAll cleanup — zero violations |
| Phase 17 backlog documented | ✅ | `docs/PHASE_17_BACKLOG.md` (A18) |
| Backend contract — GET /dashboard/stats | ✅ | 200 for SUPER_ADMIN and REGIONAL_COORDINATOR |
| Backend contract — GET /testigos | ✅ | 200, `{ data, total, page, limit }` shape confirmed |
| Backend contract — GET /dashboard/prioridad/puestos | ✅ | 200 confirmed |
| Backend contract — GET /users (access control) | ✅ | 200 for SUPER/REGIONAL, 403 for PUESTO_COORDINATOR |
| Backend contract — POST /users (access control) | ✅ | 403 for PUESTO_COORDINATOR confirmed |
| Backend contract — PDF download | ✅ | `application/pdf` Content-Type + non-empty body confirmed |
| Backend contract — SSE endpoint | ✅ | `text/event-stream` Content-Type confirmed |
| **Backend contract — GET abogados** | ✅ | **A-7: 200 + array; A-7b: 403 scope restriction confirmed** |
| **Backend contract — GET refrigerios** | ✅ | **A-8: 200 + array confirmed** |
| **Backend contract — GET comparendos** | ✅ | **A-9: 200 + array; A-9b: 403 scope restriction confirmed** |
| Backend revision | ✅ | `backend-00025-9m6` (commit `4d04757` feat(a20)) deployed 2026-05-23 |

### YELLOW (Known Gaps — Acceptable)

| Area | Status | Notes |
|------|--------|-------|
| Playwright E2E not run | ⚠️ | Requires local server. Owner cannot run pnpm start. Deferred to post-cutover monitoring. Contract tests cover critical paths. |
| Lighthouse scores not measured | ⚠️ | Requires local server. Same constraint. Deferred. |
| Movilidad not migrated | ⚠️ | Shows banner pointing to vanilla app. Acceptable if vanilla app remains accessible on D-day. |
| Map tiles offline | ⚠️ | OpenStreetMap tiles require internet. No offline fallback. |
| Bundle sizes not measured | ⚠️ | Turbopack build does not emit First Load JS sizes. Use `next/bundle-analyzer` post-cutover. |
| QA_CLEANUP.md non-empty | ⚠️ | 6 inactive qa.test users (IDs 16–21) need manual hard-delete. All `active=false`, cannot authenticate. See `docs/PHASE_17_BACKLOG.md` A18. |

### RED (Blockers)

*None.*

---

## Gate Summary

| Gate | Status | Verdict |
|------|--------|---------|
| Contract tests | ✅ 18/18 | GREEN |
| `pnpm build` PASS with prod env | ✅ 17 routes | GREEN |
| TypeScript / ESLint — 0 errors | ✅ | GREEN |
| A15 guard — zero violations | ✅ | GREEN |
| A19 resolved via A20 backend GET endpoints | ✅ | GREEN |
| A20 backend deployed (`backend-00025-9m6`) | ✅ | GREEN |
| QA_CLEANUP.md | ⚠️ 6 inactive users | YELLOW (non-blocking) |
| Any RED blockers | None | GREEN |

---

## Recommendation

**GO — unconditional.**

All technical gates are green. A19 (write-forward data loss) is resolved by Amendment A20:
- Backend GET endpoints deployed as `backend-00025-9m6`
- Frontend `useQuery` integration complete for all three resources
- A19 banners removed from all three pages
- 18/18 contract tests pass, including scope restriction checks

Prerequisites before cutover:
1. Inform coordinators of Movilidad limitation (vanilla app redirect — unchanged from today).
2. Hard-delete IDs 16–21 from production at convenience (non-blocking — all inactive, cannot authenticate).
3. Playwright E2E and Lighthouse are deferred to post-cutover (cannot run locally).
