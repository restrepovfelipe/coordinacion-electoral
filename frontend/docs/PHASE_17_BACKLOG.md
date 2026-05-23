# Phase 17 Backend Backlog

Items deferred from Phase 16 because backend GET endpoints don't exist yet.

## A19 — Missing GET endpoints for transactional resources

The backend has write-only endpoints for these three resources. The Next.js
frontend cannot list/display saved records across sessions.

| Resource | Has POST | Has PATCH | Has DELETE | Has GET list |
|---|---|---|---|---|
| Abogados | ✓ POST /municipios/:id/abogados | ✓ PATCH /abogados/:id | ✓ DELETE /abogados/:id | ✗ |
| Refrigerios | ✓ POST /refrigerios | ✓ PATCH /refrigerios/:id | ✓ DELETE /refrigerios/:id | ✗ |
| Comparendos | ✓ POST /comparendos | ✓ PATCH /comparendos/:id | ✓ DELETE /comparendos/:id | ✗ |

**Phase 17 work needed:**
1. Add `GET /municipios/:id/abogados` → `Abogado[]`
2. Add `GET /refrigerios?scopeType=PUESTO&scopeId=:id` → `Refrigerio[]`
3. Add `GET /comparendos?scopeType=COMUNA&scopeId=:id` → `Comparendo[]`
4. Update frontend `lib/api/abogados.ts`, `lib/api/refrigerios.ts`, `lib/api/comparendos.ts` with GET hooks
5. Remove `amendment_a19` banners from Abogados page and sections

**Impact on Phase 16 cutover:**
Coordinators can ENTER data but cannot SEE previously entered data after page reload.
Acceptable for D-day since the vanilla app holds authoritative localStorage data.
Post D-day (Phase 17) will add persistence.

## A18 — Hard-delete qa.test users (post-cutover task)

The contract test cleanup (Layer 4) tries `DELETE /api/users/:id`, which returns 400 for users
with cascade dependencies (testigos, audit logs, scope records). The fallback soft-deactivates
them (`active=false`). Six such users are currently in production:

| ID | Username | Status |
|---|---|---|
| 16 | `qa.test.superadmin.1779564445600` | inactive |
| 17 | `qa.test.regionalcoordinator.1779564448229` | inactive |
| 18 | `qa.test.puestocoordinator.1779564450248` | inactive |
| 19 | `qa.test.superadmin.1779564537561` | inactive |
| 20 | `qa.test.regionalcoordinator.1779564542278` | inactive |
| 21 | `qa.test.puestocoordinator.1779564545729` | inactive |

All are `active=false` and cannot authenticate. Non-blocking for cutover.

**Cleanup options (choose one):**
1. Manual delete via Cloud SQL Studio after wiping their dependencies
2. Backend amendment: add a "force delete with cascade" admin endpoint (`DELETE /api/admin/users/:id/force`)
3. Cron job that hard-deletes inactive `qa.test.*` users older than 7 days

## A20 — Exportar endpoint pending

Backend export endpoint not yet implemented. Feature flag `NEXT_PUBLIC_FEATURE_EXPORT=false`
gates the sidebar entry. When backend is ready:
1. Set `NEXT_PUBLIC_FEATURE_EXPORT=true` in Vercel env vars
2. Implement `GET /exportar` API call in `lib/api/exportar.ts`
3. Remove the disabled state from the sidebar NavItem
