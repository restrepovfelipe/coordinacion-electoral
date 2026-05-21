# CLAUDE_RESUME.md — Comando Electoral 2026 → GCP migration

> **Purpose.** Hand-off document for a fresh Claude Code session — possibly on a
> different PC, with zero memory context. Read this top to bottom, then the three
> canonical files: `MIGRATION_SPEC.md` (the spec — authoritative), `DISCOVERY.md`
> (Phase 0 audit + §5 amendments), `TASKS.md` (the 55-task tracker T01–T55).
> Last updated 2026-05-20.

---

## 1. What this project is

Migrating the Comando Electoral 2026 web app (https://coordinacion-electoral.vercel.app)
from a Firebase-Anonymous-Auth + vanilla-JS-on-Vercel architecture to a GCP-native
stack: **Cloud Run + Cloud SQL PostgreSQL + NestJS + Prisma + Cloud Identity
Platform**, with a 6-role / 5-scope-type RBAC model. The app coordinates a
presidential campaign across 9 subregiones / 125 municipios / 1,282 voting stations
of Antioquia, Colombia. Solo developer. No real operational data captured yet —
safe to rebuild.

Work runs in **Phases 0–8** against `MIGRATION_SPEC.md`. Phase 0 (discovery) and the
§10 GCP pre-flight are complete; **Phase 1** (backend scaffold + Cloud SQL + Prisma)
is finishing now.

## 2. How to resume on a fresh PC

GCP resources live in the cloud (reachable anywhere). Local state does NOT travel:

1. Clone the repo; `cd` into it.
2. `gcloud auth login`, then **`gcloud auth application-default login --impersonate-service-account=app-backend@coordinacion-electoral.iam.gserviceaccount.com`** (keyless auth — Amendment 5; there is **no** key file).
3. `cd backend && pnpm install` (needs Node 24 + pnpm ≥ 9 via `corepack enable`).
4. Recreate `backend/.env.local` (gitignored — shape in §6; DB password is Secret Manager secret `DB_APP_USER_PASSWORD`, URL-encode it into `DATABASE_URL`).
5. Download `cloud-sql-proxy` v2 — Windows x64: `https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.21.3/cloud-sql-proxy.x64.exe`.
6. **Gotcha:** on the original Windows host, `gcloud`/`bq`/`gsutil` work **only via PowerShell** — Git Bash hits the SDK's bundled-Python lookup and fails with exit 49.

## 3. GCP environment

| Item | Value |
|---|---|
| Project ID | `coordinacion-electoral` |
| Project number | `210392280319` |
| Organization | `979565691233` |
| Region | `us-central1` |
| gcloud user | `jdmg206@gmail.com` |
| Service account | `app-backend@coordinacion-electoral.iam.gserviceaccount.com` |
| SA roles | `cloudsql.client`, `secretmanager.secretAccessor`, `firebaseauth.admin`; user holds `iam.serviceAccountTokenCreator` on the SA (for impersonation) |
| Cloud SQL instance | `defensores-pg` — PostgreSQL 16, `db-g1-small`, **Enterprise** edition, 10 GB auto-increase, daily backup 03:00 UTC — **RUNNABLE & billable** |
| Cloud SQL connection name | `coordinacion-electoral:us-central1:defensores-pg` |
| Database / DB user | `defensores` / `app_user` |
| Secret Manager secrets | `BOOTSTRAP_SUPER_ADMINS_JSON`, `DB_APP_USER_PASSWORD`, `CIP_WEB_API_KEY` |
| APIs enabled (8) | run, sqladmin, secretmanager, artifactregistry, cloudbuild, iam, logging, identitytoolkit |
| Identity Platform | enabled; Email/Password provider on (proven end-to-end at T14) |

## 4. The 10 amendments (full text in `DISCOVERY.md §5`)

1. **A1** — `Comuna` gains a nullable `zonaId` FK; `Zona` gains a `comunas` back-relation (links comunas to the 6 Medellín zonas).
2. **A2** — the §6.2 transitive-scope SQL CTE gains a `user_zonas` branch so `ZONE_COORDINATOR` resolves correctly.
3. **A3** — the Phase 2 seed assigns `Comuna.zonaId` from `MEDELLIN_ZONAS` in `js/data.js`.
4. **A4** — the Phase 3.7 permissions test matrix gains explicit `ZONE_COORDINATOR` cases.
5. **A5** — GCP auth is keyless (ADC + service-account impersonation); no SA key JSON, because org policy `iam.disableServiceAccountKeyCreation` forbids key creation.
6. **A6** — Cloud Build builds/pushes the image remotely; there is no local container runtime, so local `docker build`/`docker push` are dropped.
7. **A7** — the stack standardizes on Node 24 LTS instead of Node 20.
8. **A8** — graduated autonomy (operational): tasks run autonomously within a phase; hard STOPs only at phase boundaries, before T09, before T45, and after T37/T38/T39.
9. **A9** — Prisma is pinned to 6.x; Prisma 7's new generator + `prisma.config.ts` break spec §5's verbatim schema.
10. **A10** — Pregoneros are eliminated entirely from the data model (removed from `MIGRATION_SPEC.md §5` and `schema.prisma`) — the first sanctioned edit to the canonical spec.

## 5. Phase 1 status (T05–T12)

| Task | Status | Notes |
|---|---|---|
| T05 Scaffold NestJS | ✅ done | boots, HTTP 200 |
| T06 Prisma + schema | ✅ done | Prisma 6.19.3 (A9); `prisma validate` passes |
| T07 Module skeleton | ✅ done | 13 modules boot clean |
| T08 Dockerfile + .dockerignore | ✅ authored | A6 — Cloud Build verifies it at T44 (checkbox flips then) |
| T09 Cloud SQL | ✅ done | instance RUNNABLE, `defensores` DB + `app_user` created |
| T10 start-proxy.sh | ✅ authored | run-test needs the proxy binary |
| T11 .env.example + .env.local | ✅ done | `.env.local` gitignored |
| T12 /api/healthz | ▶ completing now | healthz controller + `@nestjs/config`; verified against the live DB via the proxy |

After T12: **HARD STOP — Phase 1 boundary.** Phase 2 must not start without explicit owner "go".

## 6. `backend/.env.local` shape (gitignored — recreate, do not commit)

```
DATABASE_URL=postgresql://app_user:<URL-ENCODED DB_APP_USER_PASSWORD>@localhost:5432/defensores
GCP_PROJECT_ID=coordinacion-electoral
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5500,http://localhost:3000
```
No `GOOGLE_APPLICATION_CREDENTIALS` (Amendment 5 — keyless ADC).

## 7. `schema.prisma` — model inventory

`backend/prisma/schema.prisma` — Prisma 6.19.3, `prisma-client-js` generator, PostgreSQL.
**Enums:** `Role`, `ScopeType`.
**Models (13):** `User`, `UserScope`, `Subregion`, `Municipio`, `Comuna`, `Zona`,
`Puesto`, `Testigo`, `Abogado`, `Movilidad`, `Refrigerio`, `Comparendo`, `AuditLog`.
(`Pregonero` was removed — Amendment 10.)

## 8. `backend/src/` module inventory

```
src/
  main.ts                       bootstrap; global prefix 'api'
  app.module.ts                 root; ConfigModule + Prisma + Health + 6 feature modules
  app.controller/service.ts     nest-new default (transient; removed later)
  prisma/    prisma.module.ts   @Global; provides PrismaService
             prisma.service.ts  PrismaClient wrapper, lazy connect
  health/    health.module.ts
             health.controller.ts   GET /api/healthz — pings DB with SELECT 1
  common/    .gitkeep           guards/interceptors/decorators land at T17
  auth/         auth.module.ts          skeleton — filled at T19
  permissions/  permissions.module.ts   skeleton — filled at T18
  users/        users.module.ts         skeleton — filled at T25
  audit/        audit.module.ts         skeleton — filled in Phase 4
  realtime/     realtime.module.ts      skeleton — filled at T28–T31
  resources/    resources.module.ts     aggregates 5 resource modules
                testigos/ abogados/ movilidad/ refrigerios/ comparendos/  skeletons — filled at T24
```
(`resources/pregoneros/` was created at T07 then removed by Amendment 10.)

## 9. What Phase 2 will do (T13–T15) — DO NOT START without owner "go"

- **T13 · seed-reference.ts** — parse the JS literals in `js/data.js`; idempotent-upsert `Subregion` / `Municipio` / `Comuna` / `Zona` / `Puesto`; assign `Comuna.zonaId` from `MEDELLIN_ZONAS` (Amendment 3); **no Pregonero seed (Amendment 10)**. Expected counts: 9 subregiones / 125 municipios / 6 zonas / 1,282 puestos. Precondition: `prisma migrate dev` has applied the schema.
- **T14 · bootstrap-super-admins.ts** — read the `BOOTSTRAP_SUPER_ADMINS_JSON` secret; per entry create a CIP user (`<username>@defensores.local`) then a `User` row (`role=SUPER_ADMIN`, `mustChangePassword=true`); roll back the CIP user if the Postgres insert fails; idempotent.
- **T15** — run both scripts against the local proxy; verify the counts and that both super_admins exist in CIP and the `users` table.

## 10. Environment gotchas

- `gcloud`/`bq`/`gsutil`: PowerShell only (Git Bash → exit 49, bundled-Python lookup).
- pnpm 11 blocks unapproved build scripts — approvals live in `backend/pnpm-workspace.yaml` (`allowBuilds`).
- WebStorm auto-save intermittently trips the editor's "modified since read" guard — re-read a file before editing if an edit is rejected.
- `MIGRATION_SPEC.md` was byte-for-byte immutable through A1–A9; **A10 is the only sanctioned edit** to it so far.
- `@nestjs/config` was added (env loader for `.env.local`) — standard NestJS infra, consistent with the spec's own `@nestjs/throttler` (T21) and `@nestjs/swagger` (T26).

---

## 11. Phase 1 Boundary Report

_Appended when T12 completes._
