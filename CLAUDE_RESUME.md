# CLAUDE_RESUME.md — Comando Electoral 2026

> **Purpose.** Hand-off document for a fresh Claude Code session.
> Read this first, then check `git log --oneline -15` and `DISCOVERY.md §5` for full amendment history.
> **Last updated: 2026-05-23 (Phase 15 COMPLETE — T94 coordinator persistence deployed).**

---

## 1. What this project is

A GCP-hosted electoral coordination app for a presidential campaign in Antioquia, Colombia.
Stack: **Cloud Run + Cloud SQL (PostgreSQL 16) + NestJS + Prisma 6 + Firebase Auth (CIP)**.
Frontend: vanilla JS on Vercel (auto-deploys from `main`).
6-role RBAC: `SUPER_ADMIN › REGIONAL_COORDINATOR › MUNICIPAL_COORDINATOR › ZONE_COORDINATOR › COMUNA_COORDINATOR › PUESTO_COORDINATOR`.
Scope types: `SUBREGION, MUNICIPIO, ZONA, COMUNA, PUESTO`.

---

## 2. Current state (after Phase 15 COMPLETE)

**All backend endpoints are live at https://coordinacion-electoral-backend-xxxxxxxxxx-uc.a.run.app/api**  
**Frontend: https://coordinacion-electoral.vercel.app**

### Recent phases completed
| Phase | What was built |
|-------|---------------|
| 1–4  | Backend scaffold, Cloud SQL, auth, RBAC, all resource CRUD |
| 5–10 | SSE real-time, Priorización tab, PuestoPrioridad, dashboard stats |
| 11–12 | Users CRUD + E2E tests, modal UI |
| 13   | Real-time testigo counts via SSE + aggregated endpoint |
| 14   | (T91 audit, writeMuni cleanups) |
| 15   | **COMPLETE** — Amendment A16 (Mesa Assignment System) + T94 (Coordinator Ad-Hoc Persistence) |

### Phase 15 status: COMPLETE (deployed 2026-05-23)

**Amendment A16** (deployed 2026-05-22):

All A16 commits are on `main`:
- `4b3ed6c` — schema + CoverageService A16 formula (mesaInicial/mesaFinal on Testigo)
- `2234305` — AsignacionService + POST /api/asignacion/recalcular/:puestoId
- `3c1bc74` — dashboard SQL uses real mesasAsignadas
- `986c51b` — PDF endpoint (pdfkit) GET /api/asignacion/puesto/:puestoId/pdf
- `cae32a5` — frontend: assignment table, PDF/Recalcular buttons, SSE handler
- `cc99357` — backfill script backend/scripts/local/backfill-mesa-assignments.ts

**T94 — Coordinator Ad-Hoc Persistence** (deployed 2026-05-23):
- `4a152b3` — backend: schema (coordinadorAdHocNombre/Telefono on Municipio/Zona/Comuna/Puesto + tag on Puesto), migration, GET display + PATCH adhoc endpoints, 409 guard, audit log, SSE, 18 unit tests
- `7c1651d` — frontend: savePCard/saveM → PATCH adhoc, selMuni → refreshCoordDisplay + _loadZonaIds, SSE handler coordinador:adhoc_changed, E2E tests

---

## 3. Resume on a fresh PC

1. `git clone` the repo; `cd coordinacion-electoral`
2. `gcloud auth login && gcloud auth application-default login --impersonate-service-account=app-backend@coordinacion-electoral.iam.gserviceaccount.com`
3. `cd backend && pnpm install`
4. Recreate `backend/.env.local`:
   ```
   DATABASE_URL=postgresql://app_user:<URL-ENCODED-PASSWORD>@localhost:5432/defensores
   DIRECT_DATABASE_URL=postgresql://app_user:<URL-ENCODED-PASSWORD>@<socket>:5432/defensores
   GCP_PROJECT_ID=coordinacion-electoral
   PORT=3000
   NODE_ENV=development
   CORS_ORIGINS=http://localhost:5500,http://localhost:3000
   ```
5. `cloud-sql-proxy coordinacion-electoral:us-central1:defensores-pg --port=5432`
   (binary at `backend/scripts/local/cloud-sql-proxy.exe`)

---

## 4. GCP environment

| Item | Value |
|------|-------|
| Project ID | `coordinacion-electoral` |
| Region | `us-central1` |
| gcloud user | `jdmg206@gmail.com` |
| Service account | `app-backend@coordinacion-electoral.iam.gserviceaccount.com` |
| Cloud SQL | `defensores-pg` — PostgreSQL 16, `db-g1-small`, DB: `defensores`, user: `app_user` |
| Cloud Run service | `backend` |
| Secret Manager | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DB_APP_USER_PASSWORD`, `CIP_WEB_API_KEY` |

---

## 5. Key invariants

- **Amendment A15**: NEVER modify existing production users' passwords/roles/scopes. E2E tests create/delete disposable users.
- **No Co-Authored-By**: Never add `Co-Authored-By: Claude` lines to commits.
- **Conventional commits**: `feat / fix / perf / chore / docs / refactor`
- **Prisma pattern**: Use `$queryRaw` for new tables that aren't trivially supported by the ORM fluent API.
- **PgBouncer**: transaction mode sidecar on 127.0.0.1:5432; `DIRECT_DATABASE_URL` bypasses it for LISTEN/NOTIFY.
- **No `process.loadEnvFile`** before Node 20.12 — scripts use `dotenv` or newer `process.loadEnvFile`.

---

## 6. Architecture: Coverage formula (A16)

See `docs/COVERAGE_FORMULA.md` for full spec. Summary:

```
coberturaPct = FLOOR(mesasAsignadas / totalMesas * 100)
  where mesasAsignadas = SUM(mesaFinal - mesaInicial + 1) WHERE mesaInicial IS NOT NULL

estado per puesto:
  BAJO_RIESGO  → nivelPrioridad IS NULL OR votosTotal < 5
  CUBIERTO     → mesasAsignadas >= puesto.mesas
  CRITICO      → nivelPrioridad = 'ALTA'
  ATENCION     → nivelPrioridad = 'MEDIA'
  VIGILAR      → nivelPrioridad = 'BAJA'
```

`AsignacionService.reassignPuesto(puestoId)` auto-runs on every testigo mutation.

---

## 7. STEP 7 reconciliation (pending after backfill)

After the backfill script runs, verify:

```bash
# Should show coberturaPct ~40-41 for MEDELLIN
curl -s -H "Authorization: Bearer <token>" \
  https://<backend-url>/api/dashboard/stats | jq '.[] | select(.municipioNombre=="MEDELLIN") | {coberturaPct, mesasCubiertas, mesasCount}'

# Should list puestos with real mesasAsignadas
curl -s -H "Authorization: Bearer <token>" \
  "https://<backend-url>/api/dashboard/prioridad/puestos?perPage=5" | jq '.items[] | {puestoNombre, mesas, testigosAsignados, coberturaPct, estado}'
```

---

## 8. Pending work

### Phase 16 — start in a NEW chat
Next phase is the **Next.js rewrite** (or Movilidad persistence — confirm with owner).

### Deferred backlog (carry into Phase 16)
- [ ] Run A16 backfill if not yet done: `pnpm tsx scripts/local/backfill-mesa-assignments.ts`
- [ ] Reconciliation curl evidence (STEP 7)

### T95 — Auth flash fix
- Inline synchronous script before modules to avoid auth flash

### T96 — Hash-based routing

### T97 — Default-collapsed municipio cards

### T98 — Cache & SSE invalidation hardening

### T99 — Tests, build, deploy, tag v15.0.0

### Phase 16 — Movilidad persistence (see POSTMORTEM.md)
- New `Movilidad` + `MovilidadResponsable` backend tables
- Remove browser-only state + `writeMuni()` from movilidad callers
- In-browser migration for existing localStorage data

---

## 9. Module inventory (backend/src/)

```
src/
  app.module.ts               root — registers all feature modules
  prisma/                     @Global PrismaService
  health/                     GET /api/healthz
  auth/                       Firebase JWT verification, AuthGuard
  permissions/                PermissionsService (scope resolution)
  common/
    guards/                   AuthGuard, RolesGuard, ScopeGuard
    coverage.service.ts       A16 formula — computePhysicalCoverage, computeEstado
    common.module.ts          exports CoverageService
  users/                      Users CRUD
  audit/                      AuditLog writes
  realtime/                   SSE via pg LISTEN/NOTIFY
  metrics/                    Cloud Monitoring
  dashboard/                  GET /api/dashboard/stats, /prioridad/puestos, /prioridad/mapa
  asignacion/                 AsignacionService + POST recalcular + GET pdf  ← NEW A16
  resources/
    testigos/                 CRUD + bulkAssign (wired to AsignacionService)
    abogados/ movilidad/ refrigerios/ comparendos/ reference/
```

---

## 10. Schema additions (A16)

`Testigo` model gains:
```prisma
mesaInicial  Int?
mesaFinal    Int?
```
Migration: `backend/prisma/migrations/20260522100000_add_testigo_mesa_assignment/`
