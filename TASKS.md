# TASKS.md — Comando Electoral 2026 → GCP-Native Migration

> **Phase 0 deliverable** (per `MIGRATION_SPEC.md` §0.3). One checkbox entry per task,
> grouped by phase. The canonical detail for every task lives in `MIGRATION_SPEC.md` at
> the cited section — this file is the **execution tracker**, not a re-statement of the
> spec. Spec deltas authorized in Phase 0 are recorded in `DISCOVERY.md §5` and folded
> into the tasks below, tagged **[Amendment N]**.

## How to use this file

- Work phases **0 → 8 in strict numerical order**. After each phase: STOP, post a
  progress summary, wait for explicit "go" (spec §12, §15.1).
- Inside a phase: tasks run **autonomously** — run, verify with concrete command
  output, proceed (`DISCOVERY.md §5 Amendment 8`, graduated autonomy — supersedes the
  original per-task STOP). Hard stops: phase boundaries, before T09, before T45,
  after T37 / T38 / T39.
- Check `- [x]` only when the acceptance criteria pass **with evidence** — run the
  command, read the output (`superpowers:verification-before-completion`).
- Tempting fix outside the current task → log in `BACKLOG.md`, do not expand the task
  (§15.3). Ambiguity → STOP and ask (§15.4).

## Risk legend

- **Low** — isolated, reversible, no infra / auth / production / data-shape impact.
- **Medium** — touches infra, shared modules, or data shape; reversible with care.
- **High** — auth / permissions, production deploy, or destructive / hard-to-reverse.

## Variables (pinned at the Phase 0 → 1 gate)

- `${GCP_PROJECT_ID}` — owner's GCP project (spec example: `defensores-2026`).
- `${REGION}` — Cloud Run / Cloud SQL region (spec default: `us-central1`).
- `${INSTANCE}` — Cloud SQL instance name (spec default: `defensores-pg`).

---

## Phase 0 — Discovery + TASKS.md  (no code, no infra)

- [x] **T01 · Repo discovery & write-site verification** — spec §0.1
  - **Files:** read-only — `index.html`, `css/styles.css`, `js/*.js`, `firestore.rules`, `scripts/*`, `README.md`
  - **Preconditions:** `MIGRATION_SPEC.md` present in repo root
  - **Acceptance:** the 21 write-site line numbers in spec §2.3 verified against the current `js/app.js`; deltas captured in `DISCOVERY.md §3`
  - **Manual test:** `DISCOVERY.md §3.1` table cites `file:line` for all 21 Firestore write call sites
  - **Risk:** Low

- [x] **T02 · Produce DISCOVERY.md** — spec §0.2
  - **Files:** Create `DISCOVERY.md`
  - **Preconditions:** T01 done
  - **Acceptance:** covers current auth flow, `firestore.rules` behavior, write inventory, XSS surfaces with `file:line`, README↔code contradictions
  - **Manual test:** open `DISCOVERY.md` — §§1–4 populated, every codebase claim carries a citation
  - **Risk:** Low

- [x] **T03 · Resolve ambiguities & record spec amendments** — spec §0.4
  - **Files:** Modify `DISCOVERY.md` (add §5 "Spec Amendments Applied in Phase 0")
  - **Preconditions:** full spec read end-to-end
  - **Acceptance:** Zona-scope ambiguity raised and resolved; Amendments 1–4 recorded in `DISCOVERY.md §5`; `MIGRATION_SPEC.md` left byte-for-byte unchanged
  - **Manual test:** `DISCOVERY.md §5` lists Amendments 1–4; `git diff MIGRATION_SPEC.md` is empty
  - **Risk:** Low

- [x] **T04 · Produce TASKS.md** — spec §0.3
  - **Files:** Create `TASKS.md` (this file)
  - **Preconditions:** T03 done
  - **Acceptance:** every spec sub-item §§1.1–8.6 has a `T`-task with ID, title, files, preconditions, acceptance, manual test, risk; amendments folded in and tagged
  - **Manual test:** this file — 55 tasks, grouped by phase, plain Markdown checkboxes
  - **Risk:** Low

> **STOP — Phase 0 complete.** `DISCOVERY.md` and `TASKS.md` both exist. Wait for the
> owner's explicit "go" before Phase 1.

---

> ### Phase 1 Gate (spec §10 — owner does this manually, BEFORE T05)
> Do not start Phase 1 until the owner confirms, section by section: §10.1 project
> created + billing linked; §10.2 APIs enabled; §10.3 Cloud Identity Platform enabled
> with Email/Password provider + Web API Key copied; §10.4 `app-backend` service
> account + IAM roles + keyless ADC via SA impersonation [Amendment 5]; §10.5 secrets `BOOTSTRAP_SUPER_ADMINS_JSON`,
> `DB_APP_USER_PASSWORD`, `CIP_WEB_API_KEY` created; §10.6 local prereqs (`gcloud`
> authed, `gcloud builds submit` available [A6], Node 24 LTS [A7], `pnpm` ≥ 9). `${GCP_PROJECT_ID}` and `${REGION}`
> are pinned here.

> **[Amendment 6] Local dev runtime:** no container runtime on this host — `docker-compose` is dropped from §11; the local workflow is `pnpm start:dev` on the host plus the Cloud SQL Auth Proxy binary alongside. Image builds run remotely on Cloud Build (T44).

## Phase 1 — Backend scaffold + Cloud SQL + Prisma

- [x] **T05 · Scaffold NestJS backend** — spec §1.1
  - **Files:** Create `backend/` (NestJS CLI output: `src/`, `package.json`, `tsconfig.json`, `nest-cli.json`, `pnpm-lock.yaml`)
  - **Preconditions:** Phase 0 approved; Phase 1 Gate cleared
  - **Acceptance:** `pnpm dlx @nestjs/cli new backend --package-manager pnpm --strict` succeeds; `cd backend && pnpm start:dev` boots with no errors
  - **Manual test:** `curl -s localhost:3000` → default NestJS response, HTTP 200
  - **Risk:** Medium

- [x] **T06 · Add Prisma + schema.prisma** — spec §1.2 · **[Amendment 1, A9, A10]**
  - **Files:** Create `backend/prisma/schema.prisma`; modify `backend/package.json` (prisma deps)
  - **Preconditions:** T05 done
  - **Acceptance:** Prisma installed; `schema.prisma` matches spec §5 **with Amendment 1** — `Comuna.zonaId Int?` + `zona` relation + `@@index([zonaId])`, and `Zona.comunas Comuna[]`; `pnpm prisma validate` passes
  - **Manual test:** `cd backend && pnpm prisma validate` → "The schema is valid"; `grep -n "zonaId" prisma/schema.prisma` shows the new field
  - **Risk:** Medium

- [x] **T07 · Module skeleton per §4** — spec §1.3
  - **Files:** Create `backend/src/{prisma,common,auth,permissions,users,audit,realtime,resources}/` with empty modules; modify `backend/src/app.module.ts` to register them
  - **Preconditions:** T06 done
  - **Acceptance:** folder layout matches spec §4; all modules imported in `app.module.ts`; `pnpm start:dev` still boots clean
  - **Manual test:** `pnpm start:dev` → no Nest dependency-resolution errors in the log
  - **Risk:** Low

- [x] **T08 · Multi-stage Dockerfile + .dockerignore** — spec §1.4 · **[A6, A7]**
  - **Files:** Create `backend/Dockerfile`, `backend/.dockerignore`
  - **Preconditions:** T07 done
  - **Acceptance:** multi-stage `Dockerfile` (Node 24 slim [A7] → build → prod); `.dockerignore` excludes `node_modules`, `dist`, `.env*`, `.gcp-key*`. **[A6]** no local build verification — the Dockerfile is authored here and exercised remotely by Cloud Build at T44
  - **Manual test:** **[A6]** deferred — no container runtime on this host; the Dockerfile is verified at T44 (Cloud Build builds it) and T45 (deployed image returns 200 on `/api/healthz`)
  - **Risk:** Medium

- [x] **T09 · provision-cloud-sql.sh + run it** — spec §1.5
  - **Files:** Create `backend/scripts/gcp/provision-cloud-sql.sh`
  - **Preconditions:** T05 done; Phase 1 Gate cleared (`DB_APP_USER_PASSWORD` secret exists)
  - **Acceptance:** script matches spec §1.5; running it creates Cloud SQL PG 16 `${INSTANCE}` (`db-g1-small`, daily 03:00 backup), database `defensores`, user `app_user`; connection name printed
  - **Manual test:** `gcloud sql instances describe ${INSTANCE} --format='value(state)'` → `RUNNABLE`
  - **Risk:** High — creates a billable Cloud SQL instance

- [x] **T10 · start-proxy.sh** — spec §1.6
  - **Files:** Create `backend/scripts/local/start-proxy.sh`
  - **Preconditions:** T09 done; `cloud-sql-proxy` binary installed
  - **Acceptance:** script resolves the instance connection name and tunnels Cloud SQL to `localhost:5432`
  - **Manual test:** run the script → `psql "host=localhost port=5432 user=app_user dbname=defensores"` connects
  - **Risk:** Low

- [x] **T11 · .env.example + gitignored .env.local** — spec §1.7 · **[Amendment 5]**
  - **Files:** Create `backend/.env.example`, `backend/.env.local`; modify root `.gitignore`
  - **Preconditions:** T09 done
  - **Acceptance:** `.env.local` holds real values per spec §11 (`DATABASE_URL`, `GCP_PROJECT_ID`, `PORT`, `NODE_ENV`, `CORS_ORIGINS` — **[Amendment 5]: no `GOOGLE_APPLICATION_CREDENTIALS`, keyless ADC**); `.env.example` is the placeholder twin; `.gitignore` excludes `backend/.env.local` and `backend/.gcp-key*.json`
  - **Manual test:** `git status --porcelain | grep -E '\.env\.local|\.gcp-key'` → empty (not tracked)
  - **Risk:** Low

- [x] **T12 · /api/healthz controller** — spec §1.8
  - **Files:** Create `backend/src/health/health.controller.ts` (+ module); modify `app.module.ts`
  - **Preconditions:** T07, T10, T11 done
  - **Acceptance:** `GET /api/healthz` pings the DB via `prisma.$queryRaw\`SELECT 1\`` and returns 200 only when the query succeeds
  - **Manual test:** with the proxy up, `pnpm start:dev` then `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/healthz` → `200`
  - **Risk:** Low

> **STOP — Phase 1.** Owner confirms: instance `RUNNABLE`; `pnpm start:dev` runs
> locally; `/api/healthz` returns 200 against the proxy.

---

## Phase 2 — Reference data + bootstrap

- [x] **T13 · seed-reference.ts** — spec §2.1 · **[Amendment 3, A10 — no Pregonero seed data]**
  - **Files:** Create `backend/scripts/seed/seed-reference.ts`
  - **Preconditions:** T12 done; `pnpm prisma migrate dev` has applied the schema
  - **Acceptance:** parses `js/data.js` JS literals → JSON; idempotent upsert (by `divipola` for municipios/puestos, by `name` for subregiones/comunas/zonas); **Amendment 3** — assigns `Comuna.zonaId` from `MEDELLIN_ZONAS` and logs the three checks (assigned count, unmatched names, comunas without a zona); final log: 9 subregiones / 125 municipios / 6 zonas / 1,282 puestos
  - **Manual test:** `pnpm tsx scripts/seed/seed-reference.ts` twice → identical counts both runs; `psql … -c "SELECT count(*) FROM \"Comuna\" WHERE \"zonaId\" IS NOT NULL"` equals the Medellín comuna count
  - **Risk:** Medium — data integrity; `divipola` uniqueness in `data.js` is unverified until run

- [x] **T14 · bootstrap-super-admins.ts** — spec §2.2
  - **Files:** Create `backend/scripts/bootstrap/bootstrap-super-admins.ts`
  - **Preconditions:** T13 done; `BOOTSTRAP_SUPER_ADMINS_JSON` secret exists
  - **Acceptance:** reads the secret; per entry creates a CIP user (`<username>@defensores.local`) then a `User` row (`role=SUPER_ADMIN`, `mustChangePassword=true`); CIP-rollback (`auth.deleteUser`) if the Postgres insert fails; idempotent — skips if the username exists in CIP or Postgres
  - **Manual test:** dry inspection — code path for CIP-rollback present; re-running after success logs "already bootstrapped" and creates nothing
  - **Risk:** High — CIP↔Postgres atomicity; must never desync

- [x] **T15 · Run seed + bootstrap against local proxy** — spec §2.3
  - **Files:** none (executes T13 + T14 scripts)
  - **Preconditions:** T13, T14 done; proxy running
  - **Acceptance:** counts correct; both super_admins present in the CIP console **and** the `users` table with `mustChangePassword=true`
  - **Manual test:** CIP console shows 2 users; `psql … -c "SELECT username,role,\"mustChangePassword\" FROM \"User\""` → 2 rows, `SUPER_ADMIN`, `true`
  - **Risk:** Medium

> **STOP — Phase 2.** Owner confirms counts and both bootstrapped super_admins.

---

## Phase 3 — Auth + RBAC core

- [x] **T16 · FirebaseAdminService provider** — spec §3.1 · **[Amendment 5]**
  - **Files:** Create `backend/src/common/firebase/firebase-admin.service.ts` (+ module)
  - **Preconditions:** Phase 2 done
  - **Acceptance:** initializes `firebase-admin` with `applicationDefault()` ADC in all environments (local = impersonated ADC per Amendment 5, Cloud Run = attached SA); exposes `.auth`
  - **Manual test:** unit test or temporary route calls `firebase.auth().listUsers(1)` → returns without throwing
  - **Risk:** Medium

- [x] **T17 · AuthGuard, RolesGuard, ScopeGuard + decorators** — spec §3.2
  - **Files:** Create `backend/src/common/guards/{auth,roles,scope}.guard.ts`, `backend/src/common/decorators/{roles,require-scope,current-user}.decorator.ts`
  - **Preconditions:** T16 done
  - **Acceptance:** guards match spec §6.3 — `AuthGuard` verifies the CIP ID token, enforces the 1h `auth_time` window, loads the `User`, rejects inactive; `RolesGuard` and `ScopeGuard` enforce `@Roles` / `@RequireScope`
  - **Manual test:** covered by T22 unit tests (no token → 401; expired `auth_time` → 401)
  - **Risk:** High — auth surface

- [x] **T18 · PermissionsService + transitive-scope CTE** — spec §3.3 · **[Amendment 2]**
  - **Files:** Create `backend/src/permissions/permissions.service.ts`
  - **Preconditions:** T17 done
  - **Acceptance:** `accessiblePuestoIds(user)` runs the **Amendment 2** CTE (with the `user_zonas` branch) via `prisma.$queryRaw`; `SUPER_ADMIN` short-circuits to all puestos; `canAccess(user, scopeType, scopeId)` implemented for every `ScopeType`
  - **Manual test:** covered by T22; spot-check — a `ZONE_COORDINATOR` resolves to the puestos of its zona's comunas only
  - **Risk:** High — core authorization logic

- [x] **T19 · AuthController (me / password-changed / logout)** — spec §3.4
  - **Files:** Create `backend/src/auth/{auth.controller,auth.service,auth.module}.ts`
  - **Preconditions:** T17, T18 done
  - **Acceptance:** `GET /api/auth/me` → `{user, role, scopes}`; `POST /api/auth/password-changed` flips `mustChangePassword=false` + writes audit; `POST /api/auth/logout` revokes CIP refresh tokens + writes audit
  - **Manual test:** with a real CIP token, `curl -H "Authorization: Bearer <token>" localhost:3000/api/auth/me` → 200 with the user payload
  - **Risk:** High

- [x] **T20 · MustChangePasswordInterceptor (412)** — spec §3.5
  - **Files:** Create `backend/src/common/interceptors/must-change-password.interceptor.ts`; register globally
  - **Preconditions:** T19 done
  - **Acceptance:** any non-`/api/auth/*` route with `req.user.mustChangePassword === true` returns HTTP 412 `{code:'PASSWORD_CHANGE_REQUIRED'}`
  - **Manual test:** a freshly bootstrapped super_admin's token hitting `GET /api/auth/me` succeeds, but hitting `GET /api/subregiones` returns 412
  - **Risk:** Medium

- [x] **T21 · @nestjs/throttler on /api/auth/\*** — spec §3.6
  - **Files:** Modify `backend/src/app.module.ts` (ThrottlerModule + guard)
  - **Preconditions:** T19 done
  - **Acceptance:** `/api/auth/*` limited to 10 req/min/IP
  - **Manual test:** 11 rapid `curl` calls to `/api/auth/me` → the 11th returns HTTP 429
  - **Risk:** Low

- [x] **T22 · permissions.spec.ts** — spec §3.7 · **[Amendment 4]**
  - **Files:** Create `backend/test/permissions.spec.ts`
  - **Preconditions:** T17, T18, T20 done
  - **Acceptance:** 6 roles × 5 scope types matrix with positive + negative cases; the spec §3.7 hard cases; **Amendment 4** — `ZONE_COORDINATOR` "Nororiental" → puesto in-zona true, puesto in "Sur Oriental" false, puesto outside Medellín false; expired token → 401; `mustChangePassword` on a resource route → 412; ≥95% coverage on `PermissionsService`
  - **Manual test:** `cd backend && pnpm test permissions` → all pass; coverage report ≥95% on the permissions service
  - **Risk:** High — this test suite is the proof the auth model is correct

> **STOP — Phase 3.**

---

## Phase 4 — REST API

- [ ] **T23 · Read endpoints (scope-filtered)** — spec §4.1
  - **Files:** Create read controllers under `backend/src/resources/` for subregiones, municipios, comunas, zonas, puestos
  - **Preconditions:** Phase 3 done
  - **Acceptance:** `GET /api/subregiones`, `/municipios?subregionId=`, `/comunas?municipioId=`, `/zonas`, `/puestos?municipioId=&comunaId=` — all filtered server-side via `accessiblePuestoIds`; out-of-scope rows never appear in the response
  - **Manual test:** a `MUNICIPAL_COORDINATOR` token on `GET /api/puestos` returns only that municipio's puestos
  - **Risk:** High — scope-leakage surface

- [ ] **T24 · Resource modules (POST / PATCH / DELETE) ×6** — spec §4.2
  - **Files:** Create `backend/src/resources/{pregoneros,testigos,abogados,movilidad,refrigerios,comparendos}/` (module + controller + service + DTOs each)
  - **Preconditions:** T23 done
  - **Acceptance:** for each of the 6 resources — `class-validator` DTOs; `@UseGuards(AuthGuard,RolesGuard,ScopeGuard)` + `@RequireScope` on mutations; every mutation wraps a Prisma `$transaction` writing the business row **and** one `AuditLog` row; PATCH honors `If-Match: <ISO updatedAt>` and rejects stale writes with 412
  - **Manual test:** per resource — create succeeds in-scope; PATCH with a stale `If-Match` → 412; the matching `AuditLog` row exists after each write
  - **Risk:** High

- [ ] **T25 · User management endpoints** — spec §4.3
  - **Files:** Create `backend/src/users/{users.module,users.controller,users.service}.ts` + DTOs
  - **Preconditions:** T24 done
  - **Acceptance:** `GET /api/users`; `POST /api/users` runs the CIP+DB lockstep of spec §7.4 and returns `{user, temporary_password}`; `PATCH /api/users/:id`; `DELETE /api/users/:id` soft-deletes (`active=false`); `DELETE …?force=true` hard-deletes CIP+DB — all super_admin-only
  - **Manual test:** as super_admin, create a `PUESTO_COORDINATOR` → response carries `temporary_password`; as a non-super-admin, `POST /api/users` → 403
  - **Risk:** High

- [ ] **T26 · Swagger at /api/docs** — spec §4.4
  - **Files:** Modify `backend/src/main.ts` (`@nestjs/swagger`)
  - **Preconditions:** T25 done
  - **Acceptance:** `/api/docs` serves the OpenAPI UI listing every endpoint
  - **Manual test:** open `http://localhost:3000/api/docs` → all routes from T23–T25 visible
  - **Risk:** Low

- [ ] **T27 · E2E tests (users + resources)** — spec §4.5
  - **Files:** Create `backend/test/users.e2e-spec.ts`, `backend/test/resources.e2e-spec.ts`
  - **Preconditions:** T24, T25 done; isolated test DB
  - **Acceptance:** happy path + 1 out-of-scope negative per resource + 1 `If-Match` conflict + hard-delete by a non-super-admin (expect 403)
  - **Manual test:** `cd backend && pnpm test:e2e` → all pass against the test DB (never the seeded prod DB)
  - **Risk:** Medium

> **STOP — Phase 4.**

---

## Phase 5 — Realtime (SSE)

- [ ] **T28 · RealtimeController @Sse() /api/events** — spec §5.1
  - **Files:** Create `backend/src/realtime/realtime.controller.ts`
  - **Preconditions:** Phase 4 done
  - **Acceptance:** `GET /api/events` is `@Sse()`; per-connection stream keyed to the user's `accessiblePuestoIds`
  - **Manual test:** `curl -N -H "Authorization: Bearer <token>" localhost:3000/api/events` → stays open, streams events
  - **Risk:** Medium

- [ ] **T29 · RealtimeService (pg-listen)** — spec §5.2
  - **Files:** Create `backend/src/realtime/realtime.service.ts`
  - **Preconditions:** T28 done
  - **Acceptance:** `pg-listen` connected to Postgres, listening on `pregonero.changed`, `testigo.changed`, … one channel per resource
  - **Manual test:** `psql … -c "SELECT pg_notify('pregonero.changed','{\"test\":1}')"` → the open SSE stream from T28 receives it
  - **Risk:** Medium

- [ ] **T30 · pg_notify inside mutation transactions** — spec §5.3
  - **Files:** Modify the 6 resource services from T24
  - **Preconditions:** T24, T29 done
  - **Acceptance:** every mutation runs `SELECT pg_notify('<channel>', $1::text)` inside the same `$transaction`; payload = `{id, puestoId|municipioId|scopeType+scopeId, action}`
  - **Manual test:** PATCH a pregonero → an SSE client subscribed to that puesto receives the change event
  - **Risk:** Medium

- [ ] **T31 · SSE heartbeat (25s)** — spec §5.4
  - **Files:** Modify `backend/src/realtime/realtime.controller.ts`
  - **Preconditions:** T28 done
  - **Acceptance:** the `@Sse()` stream yields a comment-line heartbeat every 25s
  - **Manual test:** hold a `curl -N` SSE connection idle ~60s → comment lines arrive ~every 25s, connection stays alive
  - **Risk:** Low

- [ ] **T32 · Frontend EventSource reconnect with backoff** — spec §5.5
  - **Files:** `js/sync.js` (EventSource client logic; coordinated with T36)
  - **Preconditions:** T28 done
  - **Acceptance:** `EventSource` reconnects with exponential backoff 1s → 2s → 4s, capped at 30s
  - **Manual test:** open the app, kill the backend, watch DevTools Network — reconnect attempts follow 1/2/4/…/30s; restart backend → stream resumes
  - **Risk:** Low

> **STOP — Phase 5.**

---

## Phase 6 — Frontend refactor

- [ ] **T33 · Repoint firebase-init.js, remove anonymous auth** — spec §6.1
  - **Files:** Modify `js/firebase-init.js`
  - **Preconditions:** Phase 5 done; new project's `firebaseConfig` + `CIP_WEB_API_KEY` available
  - **Acceptance:** config points at the **new** Identity Platform project; `signInAnonymously` removed entirely
  - **Manual test:** `git grep -n signInAnonymously js/` → no results
  - **Risk:** High — auth cutover

- [ ] **T34 · New js/api.js REST client** — spec §6.2
  - **Files:** Create `js/api.js`
  - **Preconditions:** T33 done
  - **Acceptance:** client with `setToken`/`clearToken`, auto `Authorization: Bearer`, `get/post/patch/delete`; on 401 → clear + redirect to login; on 412 `PASSWORD_CHANGE_REQUIRED` → change-password modal; on 412 `If-Match` mismatch → notify caller for retry
  - **Manual test:** from DevTools console, `api.get('/api/auth/me')` with a valid token → 200; with no token → redirect to login
  - **Risk:** Medium

- [ ] **T35 · Rewrite js/auth.js (CIP login)** — spec §6.3
  - **Files:** Modify `js/auth.js`
  - **Preconditions:** T34 done
  - **Acceptance:** login calls `signInWithEmailAndPassword(\`${username}@defensores.local\`, password)`; on success fetches `/api/auth/me` and stores user/role/scopes in **module-scope memory** (not localStorage); refreshes the token every 50 min; hardcoded `USERS`/`Cord{N}` object removed
  - **Manual test:** log in as a bootstrap super_admin → main UI loads; `localStorage` contains no user identity or token
  - **Risk:** High

- [ ] **T36 · Rewrite js/sync.js (SSE)** — spec §6.4
  - **Files:** Modify `js/sync.js`
  - **Preconditions:** T35 done
  - **Acceptance:** `onSnapshot` replaced with `new EventSource('/api/events')`; messages dispatch to the in-memory store + rerender affected views; initial load is on-demand `GET /api/...` per view (no bulk load of 125 municipios)
  - **Manual test:** edit a puesto in browser A → browser B reflects it within ~2s; no Firestore listener traffic in DevTools
  - **Risk:** Medium

- [ ] **T37 · Update js/app.js (write paths, sidebar scope, no inline onclick)** — spec §6.5 · **[A10 — delete pregoneros UI, don't refactor]**
  - **Files:** Modify `js/app.js`
  - **Preconditions:** T34, T36 done
  - **Acceptance:** every `writeMuni`/`writeDebounced` call (the 21 sites in `DISCOVERY.md §3.1`) replaced with `api.post`/`api.patch` incl. `If-Match`; `pushAllToFirestore` removed; sidebar filters by in-memory `user.scopes` (out-of-scope items absent from the DOM); every inline `onclick="..."` replaced with `addEventListener` + closure-captured data
  - **Manual test:** `git grep -nE 'onclick=|writeMuni|writeDebounced|pushAllToFirestore' js/app.js` → no results; a scoped coordinator sees only their municipios in the sidebar
  - **Risk:** High — largest file, XSS-adjacent

- [ ] **T38 · New js/users-admin.js** — spec §6.6
  - **Files:** Create `js/users-admin.js`
  - **Preconditions:** T35, T37 done
  - **Acceptance:** renders only for `role === 'SUPER_ADMIN'`; list view (server-paginated > 100 users); create form with cascading scope picker (subregión→municipio→comuna→puesto, virtualized puesto search over 1,282); edit form; soft-delete confirm modal; hard-delete typed-confirmation modal; temp password surfaced once with a Copy button
  - **Manual test:** as super_admin, create one coordinator at each of the 5 levels; hard-delete requires typing the exact username
  - **Risk:** Medium

- [ ] **T39 · XSS pass on app.js innerHTML** — spec §6.7
  - **Files:** Modify `js/app.js`
  - **Preconditions:** T37 done
  - **Acceptance:** every `innerHTML` of user-provided content (`buildPT`, `buildCCCard`, directories, comparendo notes, PDF/Excel builders — see `DISCOVERY.md §2.5`) → `textContent` or `document.createElement` + `.textContent`; genuinely rich markup uses DOMPurify via CDN **with SRI**, justified per call site in a comment
  - **Manual test:** set a testigo name to `<img src=x onerror=alert(1)>` → renders as literal text, no alert in the originator's or another user's browser
  - **Risk:** High — security

- [ ] **T40 · Forced password-change UI** — spec §6.8
  - **Files:** Modify `js/auth.js` / `js/app.js`; modify `index.html` (modal markup)
  - **Preconditions:** T34, T35 done
  - **Acceptance:** modal triggered on any 412 `PASSWORD_CHANGE_REQUIRED`; two password fields + show/hide toggles + min-length validation; calls `currentUser.updatePassword(...)` then `POST /api/auth/password-changed`; reloads the app
  - **Manual test:** log in as a fresh bootstrap super_admin → forced to change password → succeeds → main UI loads
  - **Risk:** Medium

- [ ] **T41 · Inactivity timeout (frontend)** — spec §6.9
  - **Files:** Modify `js/auth.js`
  - **Preconditions:** T35 done
  - **Acceptance:** idle detector resets on `mousemove|keydown|touchstart`; 60 min idle → `signOut()` + clear in-memory state + redirect to login
  - **Manual test:** log in, leave idle (or shorten the threshold temporarily) → auto-logout to the login screen
  - **Risk:** Low

- [ ] **T42 · Update index.html (scripts, pills, CSP)** — spec §6.10 · **[A10 — delete pregoneros UI]**
  - **Files:** Modify `index.html`
  - **Preconditions:** T33–T35, T38 done
  - **Acceptance:** old `auth.js` reference replaced; `api.js` + `users-admin.js` included; stale topbar pills ("465 puestos / 9,471 mesas / 10 municipios AMVA") corrected (1,282 / actual mesas / 125); CSP `<meta>` header added
  - **Manual test:** load the app → topbar shows correct counts; DevTools Console reports no CSP violations on normal use
  - **Risk:** Low

- [ ] **T43 · Manual smoke test (tests/smoke.md)** — spec §6.11
  - **Files:** Create `tests/smoke.md`
  - **Preconditions:** T33–T42 done; backend running locally
  - **Acceptance:** all spec §6.11 cases pass — bootstrap login + forced password change; create a coordinator at each of the 5 levels; per-scope sidebar; in-scope write succeeds; out-of-scope `curl` PATCH → 403; XSS payload renders as text; two-browser realtime update < 2s
  - **Manual test:** execute `tests/smoke.md`; attach it with pass/fail per case
  - **Risk:** Medium

> **STOP — Phase 6.** Run the smoke test, attach `tests/smoke.md` with pass/fail per case.

---

## Phase 7 — Deploy

- [ ] **T44 · Build & push image to Artifact Registry** — spec §7.1 · **[A6]**
  - **Files:** none (uses `backend/Dockerfile` from T08)
  - **Preconditions:** Phase 6 done
  - **Acceptance:** **[A6]** Artifact Registry repo `defensores` exists; image built remotely via Cloud Build — `gcloud builds submit --tag ${REGION}-docker.pkg.dev/coordinacion-electoral/defensores/backend:$(git rev-parse --short HEAD) . --project=coordinacion-electoral` (no local `docker build`/`docker push`); Cloud Build SA `<project-number>@cloudbuild.gserviceaccount.com` has `roles/artifactregistry.writer` (granted in T44 setup if missing)
  - **Manual test:** `gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/defensores` lists the new tag
  - **Risk:** Medium

- [ ] **T45 · Deploy to Cloud Run** — spec §7.2
  - **Files:** none
  - **Preconditions:** T44 done
  - **Acceptance:** `defensores-backend` deployed with the `app-backend` SA, Cloud SQL attached, env vars + secrets per spec §7.2, `min-instances=1`, `max-instances=5`
  - **Manual test:** `gcloud run services describe defensores-backend --region ${REGION} --format='value(status.url)'` → URL; `curl <url>/api/healthz` → 200
  - **Risk:** High — production deploy

- [ ] **T46 · Frontend Vercel env + redeploy** — spec §7.3
  - **Files:** Vercel project env (`API_BASE_URL`, new `firebaseConfig`); `js/firebase-init.js` if config is inlined
  - **Preconditions:** T45 done
  - **Acceptance:** Vercel env vars set to the Cloud Run URL + new project config; frontend redeployed
  - **Manual test:** open `https://coordinacion-electoral.vercel.app` → app loads, network calls hit the Cloud Run URL
  - **Risk:** High — production cutover

- [ ] **T47 · Bootstrap against production** — spec §7.4
  - **Files:** none (runs T14 script against prod)
  - **Preconditions:** T45 done; proxy pointed at the prod instance with prod `DATABASE_URL`
  - **Acceptance:** both super_admins exist in prod CIP + prod `users` table, `mustChangePassword=true`
  - **Manual test:** prod CIP console shows 2 users; prod DB query confirms 2 `SUPER_ADMIN` rows
  - **Risk:** High

- [ ] **T48 · Verify /api/healthz on the public URL** — spec §7.5
  - **Files:** none
  - **Preconditions:** T45 done
  - **Acceptance:** the public Cloud Run URL `/api/healthz` returns 200
  - **Manual test:** `curl -s -o /dev/null -w '%{http_code}' <cloud-run-url>/api/healthz` → `200`
  - **Risk:** Low

- [ ] **T49 · End-to-end smoke against prod** — spec §7.6
  - **Files:** Modify `tests/smoke.md` (prod result column)
  - **Preconditions:** T46, T47 done
  - **Acceptance:** the spec §6.11 / §7.6 smoke cases pass against production
  - **Manual test:** re-run `tests/smoke.md` against prod; record pass/fail
  - **Risk:** Medium

> **STOP — Phase 7.**

---

## Phase 8 — Hardening + cleanup

- [ ] **T50 · Remove hardcoded Cord{N} passwords** — spec §8.1
  - **Files:** Modify `js/auth.js`
  - **Preconditions:** Phase 7 done
  - **Acceptance:** no `Cord{N}.2026*` strings remain in working-tree JS
  - **Manual test:** `git grep -nE 'Cord[0-9]\.2026' -- 'js/*'` → no results
  - **Risk:** Low

- [ ] **T51 · Document git-history rewrite in POSTMORTEM.md** — spec §8.2
  - **Files:** Modify `POSTMORTEM.md`
  - **Preconditions:** T50 done
  - **Acceptance:** `git filter-repo` / BFG steps to purge old creds **documented, not executed**
  - **Manual test:** `POSTMORTEM.md` contains the rewrite procedure; `git log` is unchanged
  - **Risk:** Low

- [ ] **T52 · Update README.md** — spec §8.3
  - **Files:** Modify `README.md`
  - **Preconditions:** Phase 7 done
  - **Acceptance:** architecture corrected; false "barrera real" security claim removed; stale restore instructions (the wrong `amva26v2` Firestore-doc reference) fixed; file structure matches spec §4; topbar counts corrected; local dev (spec §11) documented
  - **Manual test:** read `README.md` against `DISCOVERY.md §4` — every listed contradiction resolved
  - **Risk:** Low

- [ ] **T53 · Resolve CLAUDE_2.md .gitignore entry** — spec §8.4
  - **Files:** Modify `.gitignore` (and/or create `CLAUDE_2.md`)
  - **Preconditions:** none
  - **Acceptance:** the dangling `CLAUDE_2.md` reference is removed or the file is created
  - **Manual test:** `.gitignore` has no reference to a non-existent file
  - **Risk:** Low

- [ ] **T54 · Adversarial pass (tests/adversarial.md)** — spec §8.5
  - **Files:** Create `tests/adversarial.md`
  - **Preconditions:** T50–T53 done; prod reachable
  - **Acceptance:** all spec §8.5 cases A–J pass — anon → 401; cross-scope read/write → 403/filtered; privilege escalation → 403; audit tamper → blocked; expired-token replay → 401; hard-delete by non-super-admin → 403; XSS → literal text; SQLi → neutralized; concurrent `If-Match` race → one 412
  - **Manual test:** execute `tests/adversarial.md`; record pass/fail per case A–J
  - **Risk:** High — security verification gate

- [ ] **T55 · POSTMORTEM.md** — spec §8.6
  - **Files:** Modify `POSTMORTEM.md`
  - **Preconditions:** T54 done
  - **Acceptance:** documents what shipped (Phases 1–8), what was deferred (spec §17), residual risks, the git-history rewrite steps (from T51), and the suggested next change
  - **Manual test:** read `POSTMORTEM.md` — all five sections present and honest
  - **Risk:** Low

> **STOP — Phase 8.** Migration complete — verify every box in `MIGRATION_SPEC.md §16
> Success Criteria` before declaring done.

---

## Coverage map (spec §§1.1–8.6 → tasks)

| Phase | Spec sub-items | Tasks |
|---|---|---|
| 0 | §0.1–0.4 | T01–T04 |
| 1 | §1.1–1.8 | T05–T12 |
| 2 | §2.1–2.3 | T13–T15 |
| 3 | §3.1–3.7 | T16–T22 |
| 4 | §4.1–4.5 | T23–T27 |
| 5 | §5.1–5.5 | T28–T32 |
| 6 | §6.1–6.11 | T33–T43 |
| 7 | §7.1–7.6 | T44–T49 |
| 8 | §8.1–8.6 | T50–T55 |

**55 tasks. Amendments folded in:** T06 [A1, A9, A10], T18 [A2], T13 [A3, A10], T22 [A4], T11 [A5], T16 [A5], T08 [A6, A7], T44 [A6], T37 [A10], T42 [A10].
