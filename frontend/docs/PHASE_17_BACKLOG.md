# Phase 17 Backend Backlog

Items deferred from Phase 16.

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

## Exportar endpoint pending

Backend export endpoint not yet implemented. Feature flag `NEXT_PUBLIC_FEATURE_EXPORT=false`
gates the sidebar entry. When backend is ready:
1. Set `NEXT_PUBLIC_FEATURE_EXPORT=true` in Vercel env vars
2. Implement `GET /exportar` API call in `lib/api/exportar.ts`
3. Remove the disabled state from the sidebar NavItem

---

*A19 (GET endpoints for Abogados/Refrigerios/Comparendos) — RESOLVED by Amendment A20 (2026-05-23).
Backend revision `backend-00025-9m6`. Frontend GET hooks wired. A19 banners removed.*
