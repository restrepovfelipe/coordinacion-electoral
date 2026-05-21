# MIGRATION SPEC — Comando Electoral 2026 → GCP-Native

> **This document is the SINGLE CANONICAL SPEC.** It is self-contained — no prior chat fragments, no external addenda. If anything contradicts this file, this file wins. Read top to bottom before doing anything.

**Stack target:** Cloud Run + Cloud SQL PostgreSQL + NestJS + Cloud Identity Platform + vanilla JS frontend.

---

## Table of Contents

1. [Mission & Context](#1-mission--context)
2. [Current State (Discovery)](#2-current-state-discovery)
3. [Target Architecture](#3-target-architecture)
4. [Project Structure](#4-project-structure)
5. [Data Model (Prisma)](#5-data-model-prisma)
6. [Permissions Model](#6-permissions-model)
7. [Auth Flows](#7-auth-flows)
8. [Bootstrap](#8-bootstrap)
9. [Security Requirements](#9-security-requirements)
10. [GCP Pre-flight (USER does manually)](#10-gcp-pre-flight-user-does-manually)
11. [Local Development Setup](#11-local-development-setup)
12. [Execution Plan](#12-execution-plan)
13. [Testing Strategy](#13-testing-strategy)
14. [Rollback & Recovery](#14-rollback--recovery)
15. [Rules of Engagement](#15-rules-of-engagement)
16. [Success Criteria](#16-success-criteria)
17. [Out of Scope / v2 Backlog](#17-out-of-scope--v2-backlog)
18. [Superpowers Plugin (mandatory)](#18-superpowers-plugin-mandatory)
19. [Start](#19-start)

---

## 1. Mission & Context

Migrate the Comando Electoral 2026 web app (https://coordinacion-electoral.vercel.app) from its current Firebase-Anonymous-Auth + vanilla-JS-on-Vercel architecture to a 100% GCP-native, relational, role/scope-aware system in the owner's own GCP project.

- The app coordinates a presidential campaign across **9 subregiones / 125 municipios / 1,282 voting stations** of Antioquia, Colombia.
- **Zero meaningful operational data captured yet** — safe to rebuild from scratch.
- **Solo developer**.
- The existing Firebase project `comando-electoral-amva` belongs to a **different** GCP account/billing. We do **NOT** touch it, migrate from it, or reuse it. Everything is fresh in the owner's GCP project.

---

## 2. Current State (Discovery)

You should still **run a discovery pass before Phase 0** to verify these facts against the actual repo, but here is the known baseline:

### 2.1 Repo files

```
index.html
css/styles.css
js/data.js                  (~294KB; ~21 enormous lines of JS literals — static reference data)
js/firebase-init.js         (~13 lines — firebaseConfig, db, auth)
js/auth.js                  (~77 lines — hardcoded USERS, login, anonymous auth)
js/sync.js                  (~134 lines — onSnapshot per municipio, writeMuni, writeDebounced, deepMerge)
js/app.js                   (~1,747 lines — all render, handlers, exports, maps)
firestore.rules
scripts/import_data.py
scripts/coord_preload_new.json
README.md
.gitignore
```

### 2.2 Current auth model (broken)

- `firebase-init.js`: hardcoded `firebaseConfig` shipped to every browser.
- `auth.js` IIFE: calls `auth.signInAnonymously()` on load, **before and independent of** any coordinator login.
- Login form checks `USERS[u].pass === p` in-memory (4 hardcoded users: `coordinador1..4`, passwords `Cord{N}.2026*`).
- `CURRENT_USER` is never serialized to Firestore; writes carry no identity.
- `firestore.rules`: `match /estado/{doc} { allow read, write: if request.auth != null; }` — satisfied by **any** anonymous session.
- **Net effect**: anyone with the public URL can grab `firebaseConfig`, do `signInAnonymously()`, and gain full read/write of `estado`.

### 2.3 Known write call sites (21 total, all unguarded)

All call `writeMuni(n)` or `writeDebounced(n, ms)` from `sync.js`, which does a full-doc `.set()` on `estado/{n}`:

| # | Function | Location | Frequency |
|---|---|---|---|
| 1 | `pushAllToFirestore` | `app.js` ~90/906 | bulk, all 125 municipios |
| 2 | `savePCard` | `app.js:406` | immediate |
| 3 | `saveM` (muni) | `app.js:780` | immediate |
| 4 | `saveM` (cc) | `app.js:783` | immediate |
| 5 | `saveM` (p) | `app.js:788` | immediate |
| 6 | `saveM` (zona) | `app.js:793` | immediate |
| 7 | `updatePregField` | `app.js:584` | debounced 700ms |
| 8 | `setPregCount` | `app.js:595` | debounced 400ms |
| 9 | `savePregCount` | `app.js:605` | debounced 400ms |
| 10 | `saveAllPreg` | `app.js:611` | immediate |
| 11 | `addTestigo` | `app.js:622` | immediate |
| 12 | `updateTestigo` | `app.js:633` | debounced |
| 13 | `delTestigo` | `app.js:639` | immediate |
| 14 | `updateResp` | `app.js:721` | debounced 700ms |
| 15 | `addResp` | `app.js:733` | immediate |
| 16 | `delResp` | `app.js:739` | immediate |
| 17 | `saveMovNec` | `app.js:745` | debounced 500ms |
| 18 | `saveMovAll` | `app.js:750` | immediate |
| 19 | `saveAbogado` | `app.js:1210` | immediate |
| 20 | `saveRefrig` | `app.js:1248` | immediate |
| 21 | `saveComparendos` | `app.js:1322` | immediate |

> **Verify these line numbers against the actual repo during your discovery pass.** They are correct as of the last commit reviewed; new commits may shift them.

These 21 call sites map to backend endpoints in Phase 4. Site #1 (bulk all-municipios) becomes a batch endpoint; debounced sites (#7–9, 12, 14, 17) become PATCH endpoints with optimistic concurrency (`If-Match` on `updatedAt`).

### 2.4 Other gaps (drive remediation in later phases)

- **Stored XSS** in every render path: `innerHTML` of template strings with unescaped values (`buildPT`, `buildCCCard`, directories, comparendo notes, PDF/Excel builders). A malicious name like `<img src=x onerror=…>` propagates via `onSnapshot` to every connected browser. → Phase 6.7.
- **Inline `onclick` handlers** that escape only single-quotes (`.replace(/'/g,"\\'")`) — a backslash or newline payload breaks out. → Phase 6.1, 6.5 (replace with `addEventListener`).
- **Hardcoded passwords** (`Cord{N}.2026*`) shipped to every browser — they gate nothing but they're also in git history. → Phase 8.
- **No actor on writes**, no audit trail — destructive overwrite (`.set()` not `update()`) replaces the whole municipio doc on every keystroke. → solved by Phase 4's per-row mutation endpoints.
- **PII exposure**: names, cédulas, phones publicly readable from Firestore. Habeas Data (Ley 1581/2012). → solved by Phase 3 auth + Phase 4 scope-filtered reads.
- **Cache**: `localStorage['amva26v2']` holds the full plaintext state, including PII. → Phase 6 frontend must not cache cross-scope data; clear on login if scope changes.
- **No SRI** on CDN scripts (xlsx, Leaflet, Firebase). Stale XLSX 0.18.5 (pre CVE-2023-30533). → Phase 8.
- **README ↔ code contradictions**: README claims a "barrera real" of security that does not exist; topbar pills hardcode "465 puestos / 9,471 mesas / 10 municipios AMVA" but the app spans all of Antioquia (1,282/?/125). → Phase 8.3.

---

## 3. Target Architecture

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla JS, current file structure | Next.js rewrite is a future, separate project |
| Identity provider | **Cloud Identity Platform** (CIP) in owner's GCP project; Email/Password provider | GCP-native, battle-tested, free for our volume |
| Identity convention | UI shows "Usuario" (= cédula or any string the super admin picks); client sends `{username}@defensores.local` to CIP | No real emails; CIP just needs an email-shaped login |
| Authorization | NestJS `AuthGuard` validates CIP ID token via `firebase-admin`; loads `User` from Postgres; `RolesGuard` + `ScopeGuard` enforce RBAC | Identity at CIP, business roles/scopes at DB |
| Backend | **NestJS** (TypeScript strict, Node 20 LTS) on **Cloud Run** | Owner knows NestJS; Cloud Run = serverless, autoscale-to-zero |
| ORM | **Prisma** (latest stable); migrations via `prisma migrate` | Best type safety + DX with NestJS |
| Database | **Cloud SQL PostgreSQL 16**, `db-g1-small` initially | Relational fits the 6-role hierarchy; small instance is plenty |
| Realtime | **Server-Sent Events** via NestJS `@Sse()` + Postgres `LISTEN/NOTIFY` (bridged with `pg-listen`) | SSE works on Cloud Run without sticky sessions; no Redis needed |
| Validation | `class-validator` + `class-transformer` DTOs | NestJS standard |
| Secrets | **Google Secret Manager** | All secrets out of repo |
| Container Registry | **Artifact Registry** | GCP-native |
| CI/CD | `gcloud` locally for v1; Cloud Build optional later | Solo dev simplicity |
| Local dev | Cloud SQL Auth Proxy + docker-compose for backend | |
| Logging | Cloud Logging (default Cloud Run sink) + Pino structured logs | |
| Testing | Jest (unit) + Supertest (E2E) | NestJS defaults |

---

## 4. Project Structure

Target layout after the migration:

```
/                                       # repo root
├── MIGRATION_SPEC.md                    # this file
├── README.md                            # updated by Phase 8.3
├── index.html                           # refactored in Phase 6
├── css/styles.css                       # unchanged
├── js/                                  # frontend, modified in Phase 6
│   ├── firebase-init.js                 # repoint to NEW CIP project
│   ├── api.js                           # NEW — REST client
│   ├── auth.js                          # rewritten — CIP login + token mgmt
│   ├── sync.js                          # rewritten — SSE subscription
│   ├── app.js                           # XSS pass + write paths through api.js
│   ├── users-admin.js                   # NEW — super_admin Users view
│   └── data.js                          # kept as reference for initial seed only
├── backend/                             # NEW — NestJS project
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── prisma/
│   │   ├── common/                      # guards, interceptors, decorators
│   │   ├── auth/                        # /api/auth/me, /password-changed, /logout
│   │   ├── permissions/                 # transitive-scope SQL CTE
│   │   ├── users/
│   │   ├── audit/
│   │   ├── realtime/                    # @Sse() endpoint + pg-listen bridge
│   │   └── resources/
│   │       ├── pregoneros/
│   │       ├── testigos/
│   │       ├── abogados/
│   │       ├── movilidad/
│   │       ├── refrigerios/
│   │       └── comparendos/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── scripts/
│   │   ├── gcp/provision-cloud-sql.sh
│   │   ├── local/start-proxy.sh
│   │   ├── seed/seed-reference.ts       # parse js/data.js → DB
│   │   └── bootstrap/bootstrap-super-admins.ts
│   ├── test/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   ├── .env.local                       # gitignored
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── docker-compose.yml
├── tests/
│   ├── smoke.md
│   └── adversarial.md
├── DISCOVERY.md                         # produced by Phase 0
├── TASKS.md                             # produced by Phase 0
├── BACKLOG.md
├── POSTMORTEM.md
└── .gitignore
```

---

## 5. Data Model (Prisma)

Full `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  SUPER_ADMIN
  REGIONAL_COORDINATOR
  MUNICIPAL_COORDINATOR
  ZONE_COORDINATOR
  COMUNA_COORDINATOR
  PUESTO_COORDINATOR
}

enum ScopeType {
  SUBREGION
  MUNICIPIO
  ZONA
  COMUNA
  PUESTO
}

model User {
  id                  Int       @id @default(autoincrement())
  username            String    @unique
  displayName         String
  phone               String?
  notes               String?
  role                Role
  active              Boolean   @default(true)
  cipUid              String    @unique
  mustChangePassword  Boolean   @default(true)
  createdAt           DateTime  @default(now())
  createdByUserId     Int?
  createdBy           User?     @relation("UserCreator", fields: [createdByUserId], references: [id])
  createdUsers        User[]    @relation("UserCreator")
  lastLoginAt         DateTime?
  scopes              UserScope[]
  testigosCreated     Testigo[]
  abogadosCreated     Abogado[]
  movilidadCreated    Movilidad[]
  refrigeriosCreated  Refrigerio[]
  comparendosCreated  Comparendo[]
  auditEntries        AuditLog[]

  @@index([active])
  @@index([role])
}

model UserScope {
  id        Int        @id @default(autoincrement())
  userId    Int
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  scopeType ScopeType
  scopeId   Int

  @@unique([userId, scopeType, scopeId])
  @@index([scopeType, scopeId])
}

model Subregion {
  id         Int         @id @default(autoincrement())
  name       String      @unique
  municipios Municipio[]
}

model Municipio {
  id          Int        @id @default(autoincrement())
  subregionId Int
  subregion   Subregion  @relation(fields: [subregionId], references: [id])
  name        String
  divipola    String     @unique
  comunas     Comuna[]
  puestos     Puesto[]
  abogados    Abogado[]

  @@index([subregionId])
}

model Comuna {
  id          Int        @id @default(autoincrement())
  municipioId Int
  municipio   Municipio  @relation(fields: [municipioId], references: [id])
  name        String
  puestos     Puesto[]

  @@unique([municipioId, name])
}

model Zona {
  id   Int    @id @default(autoincrement())
  name String @unique
  // 6 Medellín zones; no FK to municipio (zonas are a Medellín-only overlay)
}

model Puesto {
  id          Int        @id @default(autoincrement())
  municipioId Int
  municipio   Municipio  @relation(fields: [municipioId], references: [id])
  comunaId    Int?
  comuna      Comuna?    @relation(fields: [comunaId], references: [id])
  divipola    String     @unique
  name        String
  address     String
  lat         Float
  lng         Float
  mesas       Int        @default(0)
  votantes    Int        @default(0)
  testigos    Testigo[]

  @@index([municipioId])
  @@index([comunaId])
}

model Testigo {
  id          Int      @id @default(autoincrement())
  puestoId    Int
  puesto      Puesto   @relation(fields: [puestoId], references: [id])
  name        String
  cedula      String?
  phone       String?
  status      String   @default("pendiente")
  notes       String?
  createdById Int
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([puestoId])
}

model Abogado {
  id          Int       @id @default(autoincrement())
  municipioId Int
  municipio   Municipio @relation(fields: [municipioId], references: [id])
  name        String
  phone       String?
  notes       String?
  createdById Int
  createdBy   User      @relation(fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([municipioId])
}

model Movilidad {
  id           Int       @id @default(autoincrement())
  scopeType    ScopeType
  scopeId      Int
  vehicleType  String
  plate        String
  driverName   String
  driverPhone  String?
  notes        String?
  createdById  Int
  createdBy    User      @relation(fields: [createdById], references: [id])
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([scopeType, scopeId])
}

model Refrigerio {
  id          Int       @id @default(autoincrement())
  scopeType   ScopeType
  scopeId     Int
  count       Int       @default(0)
  status      String    @default("pendiente")
  notes       String?
  createdById Int
  createdBy   User      @relation(fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([scopeType, scopeId])
}

model Comparendo {
  id          Int       @id @default(autoincrement())
  scopeType   ScopeType
  scopeId     Int
  date        DateTime
  description String
  status      String    @default("abierto")
  notes       String?
  createdById Int
  createdBy   User      @relation(fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([scopeType, scopeId])
}

model AuditLog {
  id           Int      @id @default(autoincrement())
  actorUserId  Int
  actor        User     @relation(fields: [actorUserId], references: [id])
  action       String
  targetType   String
  targetId     Int?
  beforeJson   Json?
  afterJson    Json?
  ip           String?
  userAgent    String?
  ts           DateTime @default(now())

  @@index([actorUserId])
  @@index([targetType, targetId])
  @@index([ts])
}
```

**Reference data scale (verify in seed):** 9 subregiones, 125 municipios, 6 zonas, 1,282 puestos.

---

## 6. Permissions Model

### 6.1 Six roles + scopes

- **`SUPER_ADMIN`**: read/write everywhere; manages all users including other super_admins.
- **`REGIONAL_COORDINATOR`**: scope = one or more `SUBREGION` rows; transitively covers all municipios/comunas/puestos beneath.
- **`MUNICIPAL_COORDINATOR`**: scope = one or more `MUNICIPIO` rows; transitively covers their comunas/puestos.
- **`ZONE_COORDINATOR`**: scope = one or more `ZONA` rows (Medellín only); covers puestos whose `municipio = Medellín` and whose comuna belongs to that zona (mapping table or hardcoded — clarify in Phase 0).
- **`COMUNA_COORDINATOR`**: scope = one or more `COMUNA` rows; covers their puestos.
- **`PUESTO_COORDINATOR`**: scope = one or more `PUESTO` rows; covers only those puestos.

Rules:

- Multi-scope per user at the same scopeType allowed.
- Single role per user.
- Only `SUPER_ADMIN` manages users in v1. Cascading delegation = v2 backlog.
- Out-of-scope visibility: not in DOM, not in API response.

### 6.2 Transitive scope as SQL CTE

`PermissionsService.accessiblePuestoIds(user): Promise<Set<number>>` should return all `Puesto.id`s the user can access, computed in a single SQL query using a recursive CTE. Example (PostgreSQL):

```sql
WITH user_subregions AS (
  SELECT "scopeId" FROM "UserScope" WHERE "userId" = $1 AND "scopeType" = 'SUBREGION'
),
user_municipios AS (
  SELECT m.id FROM "Municipio" m
  WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
  UNION
  SELECT "scopeId" FROM "UserScope" WHERE "userId" = $1 AND "scopeType" = 'MUNICIPIO'
),
user_comunas AS (
  SELECT c.id FROM "Comuna" c
  WHERE c."municipioId" IN (SELECT id FROM user_municipios)
  UNION
  SELECT "scopeId" FROM "UserScope" WHERE "userId" = $1 AND "scopeType" = 'COMUNA'
),
user_puestos AS (
  SELECT p.id FROM "Puesto" p
  WHERE p."municipioId" IN (SELECT id FROM user_municipios)
     OR p."comunaId"    IN (SELECT id FROM user_comunas)
  UNION
  SELECT "scopeId" FROM "UserScope" WHERE "userId" = $1 AND "scopeType" = 'PUESTO'
)
SELECT id FROM user_puestos;
```

For `SUPER_ADMIN`, short-circuit: return all `Puesto.id`s (or a sentinel `*`). Zone scoping requires a separate comuna↔zona lookup — confirm the source of truth during Phase 0 (likely from `js/data.js` `MEDELLIN_ZONAS`).

### 6.3 Guards (NestJS sketch)

```typescript
// auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private firebase: FirebaseAdminService, private users: UsersService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException();
    const decoded = await this.firebase.auth.verifyIdToken(token);

    // Inactivity timeout: 1h since auth_time
    if (Date.now() / 1000 - decoded.auth_time > 3600) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }

    const user = await this.users.findByCipUid(decoded.uid);
    if (!user || !user.active) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const allowed = this.reflector.get<Role[]>('roles', ctx.getHandler());
    if (!allowed?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return allowed.includes(user.role);
  }
}

// scope.guard.ts
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private reflector: Reflector, private permissions: PermissionsService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<{ scopeType: ScopeType; paramName: string }>('require-scope', ctx.getHandler());
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest();
    const scopeId = Number(req.params[meta.paramName] ?? req.body[meta.paramName]);
    return this.permissions.canAccess(req.user, meta.scopeType, scopeId);
  }
}
```

### 6.4 Forced password change

Global interceptor (or middleware) on routes outside `/api/auth/*`:

```typescript
if (req.user.mustChangePassword) {
  throw new HttpException(
    { code: 'PASSWORD_CHANGE_REQUIRED' },
    HttpStatus.PRECONDITION_FAILED, // 412
  );
}
```

Frontend catches 412 → opens change-password modal → uses CIP client SDK's `updatePassword` → calls `POST /api/auth/password-changed` → backend flips `mustChangePassword=false` and writes audit.

---

## 7. Auth Flows

### 7.1 Login

```
Frontend → CIP Client SDK: signInWithEmailAndPassword('1040572640@defensores.local', 'temp-password')
CIP        → returns ID token (1h TTL) + refresh token
Frontend → GET /api/auth/me  (Authorization: Bearer <ID token>)
Backend  → AuthGuard verifies token, loads User, returns { user, role, scopes }
Frontend → if mustChangePassword: route to change-password screen
Frontend → otherwise: route to main UI with filtered sidebar
```

### 7.2 Change password (first login)

```
Frontend → CIP Client SDK: updatePassword(newPassword)
Frontend → POST /api/auth/password-changed (Authorization: Bearer <fresh ID token>)
Backend  → flip mustChangePassword=false, write audit { action: 'auth.password-changed' }
Frontend → reload, route to main UI
```

### 7.3 Token refresh

```
Frontend (every 50 min): silently calls CIP refresh → new ID token
Frontend (after 60 min of no input/movement): clear tokens, redirect to login
```

### 7.4 User management (super_admin only)

```
SuperAdmin Frontend → POST /api/users  { username, displayName, phone?, notes?, role, scopes[] }
Backend (single transaction):
  1. firebase-admin.auth().createUser({ email: `${username}@defensores.local`, password: generated })
     → returns cipUid
  2. prisma.user.create({ username, displayName, ..., cipUid, mustChangePassword: true, createdByUserId: actor.id })
  3. prisma.userScope.createMany({ ... })
  4. prisma.auditLog.create({ action: 'user.create', actorUserId: actor.id, targetType: 'User', targetId: newUser.id, afterJson: { ... } })
  If step 2/3/4 fails: firebase-admin.auth().deleteUser(cipUid)  (rollback)
Returns: { user, temporary_password }  ← shown ONCE to super_admin to relay out-of-band
```

### 7.5 Logout

```
Frontend → POST /api/auth/logout
Backend  → firebase-admin.auth().revokeRefreshTokens(req.user.cipUid)
Backend  → audit { action: 'auth.logout' }
Frontend → clear all local storage/session, redirect to login
```

---

## 8. Bootstrap

Two super_admins seeded at first deploy, with `mustChangePassword=true`:

- `username=1040572640`, temp password `20060419`
- `username=1001370773`, temp password `1001370773`

These are **temporary** and **must be rotated by the user on first login**.

Stored in Secret Manager as `BOOTSTRAP_SUPER_ADMINS_JSON`:

```json
[
  { "username": "1040572640", "password": "20060419", "displayName": "Super Admin 1" },
  { "username": "1001370773", "password": "1001370773", "displayName": "Super Admin 2" }
]
```

`backend/scripts/bootstrap/bootstrap-super-admins.ts` reads from Secret Manager, calls `firebase-admin auth().createUser(...)` per entry, inserts `User` rows with role `SUPER_ADMIN`, `mustChangePassword=true`. **Idempotent**: refuses to create if a username already exists in either CIP or Postgres. CIP-rollback if Postgres insert fails.

---

## 9. Security Requirements

- **No secrets in repo, ever.** `.env.local` is gitignored. All runtime secrets in Secret Manager. Add a pre-commit grep for common patterns (`apiKey`, `password`, `BEGIN PRIVATE KEY`, etc.).
- **CIP-Postgres atomicity.** Every user mutation that touches both CIP and Postgres MUST roll back CIP on Postgres failure. Never let them desync.
- **Defense in depth.** UI restrictions → API guard → DB constraint. Never trust the client.
- **Rate limit** `/api/auth/*` and admin endpoints with `@nestjs/throttler` (10/min/IP for login; 60/min/IP for admin reads).
- **CORS strict**: production origin + `http://localhost:*` only. No `*`.
- **Security headers**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` (handled by Cloud Run if HTTPS-only).
- **No XSS surfaces**: every `innerHTML` of user-provided content → `textContent` or DOMPurify-sanitized. Audited per call site in Phase 6.7.
- **No inline event handlers**: `addEventListener` only, closure-captured data.
- **JWT validation**: always via `firebase-admin verifyIdToken` (which checks signature, issuer, audience, expiry). Never decode-without-verify.
- **Inactivity timeout**: 1 hour, enforced both client-side (clear tokens) and server-side (reject `auth_time > 3600s ago`).
- **Audit log on every mutation**, inside the same DB transaction as the business write. If the audit insert fails, the whole transaction fails.
- **Hard delete** requires typed-confirmation in UI (super_admin types the username to delete) + `?force=true` query param + audit entry with `before_json` capturing the full row.
- **Soft delete** is the default (`active=false`) — preserves audit trail.

---

## 10. GCP Pre-flight (USER does manually)

> **Claude Code: do not proceed past Phase 0 until the USER confirms each item below was completed.** Ask explicitly, one section at a time.

### 10.1 Create the project

```bash
# pick a project ID, e.g. defensores-2026
gcloud projects create defensores-2026
gcloud config set project defensores-2026
gcloud billing projects link defensores-2026 --billing-account=<BILLING_ACCOUNT_ID>
```

### 10.2 Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  logging.googleapis.com \
  identitytoolkit.googleapis.com
```

### 10.3 Enable Cloud Identity Platform

Console → Identity Platform → Enable. Then Providers → Email/Password → Enable. Then Settings → Project Settings → copy the Web API Key.

### 10.4 Create service account

```bash
gcloud iam service-accounts create app-backend \
  --display-name="Defensores Backend SA"

PROJECT_ID=defensores-2026
SA="app-backend@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" --role="roles/firebaseauth.admin"

# Key JSON for local dev (NEVER commit)
gcloud iam service-accounts keys create ./backend/.gcp-key.local.json \
  --iam-account="$SA"
```

Add `backend/.gcp-key.local.json` to `.gitignore`.

### 10.5 Create secrets

```bash
# Bootstrap super admins
echo '[{"username":"1040572640","password":"20060419","displayName":"Super Admin 1"},{"username":"1001370773","password":"1001370773","displayName":"Super Admin 2"}]' \
  | gcloud secrets create BOOTSTRAP_SUPER_ADMINS_JSON --data-file=-

# Random DB password
openssl rand -base64 32 | gcloud secrets create DB_APP_USER_PASSWORD --data-file=-

# CIP Web API Key
echo -n "<YOUR_CIP_WEB_API_KEY>" | gcloud secrets create CIP_WEB_API_KEY --data-file=-
```

### 10.6 Local prerequisites

- `gcloud` CLI authenticated: `gcloud auth login` and `gcloud auth application-default login`
- Docker installed and running
- Node 20 LTS and `pnpm` installed: `node -v` → v20.x, `pnpm -v` ≥ 9

---

## 11. Local Development Setup

After Phase 1 scaffolding:

```bash
# 1. Start Cloud SQL Auth Proxy
./backend/scripts/local/start-proxy.sh
# → tunnels Cloud SQL to localhost:5432

# 2. Run migrations
cd backend
pnpm prisma migrate dev

# 3. Seed reference data (subregiones/municipios/comunas/puestos from js/data.js)
pnpm tsx scripts/seed/seed-reference.ts

# 4. Bootstrap super admins
pnpm tsx scripts/bootstrap/bootstrap-super-admins.ts

# 5. Run the backend in dev mode
pnpm start:dev
# → http://localhost:3000/api/healthz returns 200

# 6. Serve the frontend (any static server)
cd ..
npx http-server -p 5500
# → http://localhost:5500/index.html
```

`.env.local` (backend):

```dotenv
DATABASE_URL=postgresql://app_user:<from-secret>@localhost:5432/defensores
GOOGLE_APPLICATION_CREDENTIALS=./.gcp-key.local.json
GCP_PROJECT_ID=defensores-2026
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5500,http://localhost:3000
```

---

## 12. Execution Plan

Work in phases 0 through 8, in **strict numerical order**. After every phase: STOP, output a progress summary, wait for explicit "go". Inside a phase: one task at a time, show diff + acceptance check, wait for "go". Do not skip ahead.

### Phase 0 — Discovery + TASKS.md (no code, no infra)

0.1 Read the actual repo files listed in §2.1. Confirm the line numbers in §2.3 against the current `app.js`; if they've shifted, update DISCOVERY.md (see 0.2).

0.2 Produce `DISCOVERY.md` (≤200 lines): summarize current auth flow, current rules behavior, write-site inventory with current line numbers, XSS surfaces with file:line citations, README↔code contradictions.

0.3 Produce `TASKS.md`: a checkbox list, one entry per task across all phases. Each task: ID (T01..), title, files touched, preconditions, acceptance criteria, manual test steps, risk level. Group by phase. Use plain Markdown checkboxes.

0.4 If any spec section is genuinely ambiguous after reading this whole file, ask focused questions BEFORE writing TASKS.md.

**STOP.** Show DISCOVERY.md and TASKS.md. Wait for explicit "go".

### Phase 1 — Backend scaffold + Cloud SQL + Prisma

> This phase **builds** infrastructure that does not exist yet. Cloud SQL, the NestJS backend, the CIP tenant (beyond enabling): none of them exist until this phase creates them. That is correct, not a bug.

1.1 `pnpm dlx @nestjs/cli new backend --package-manager pnpm --strict`. Verify the project boots: `cd backend && pnpm start:dev`.

1.2 Add Prisma: `pnpm add -D prisma && pnpm add @prisma/client && pnpm prisma init --datasource-provider postgresql`. Replace generated `schema.prisma` with the schema in §5.

1.3 Module skeleton per §4 (folders + empty modules registered in `app.module.ts`).

1.4 Multi-stage `Dockerfile` (Node 20 slim → build → prod). `.dockerignore` excludes `node_modules`, `dist`, `.env*`, `.gcp-key*`.

1.5 `scripts/gcp/provision-cloud-sql.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT=${1:-defensores-2026}
REGION=${2:-us-central1}
INSTANCE=${3:-defensores-pg}
DB_NAME=defensores

gcloud sql instances create "$INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region="$REGION" \
  --storage-size=10GB --storage-auto-increase \
  --backup --backup-start-time=03:00

DB_PWD=$(gcloud secrets versions access latest --secret=DB_APP_USER_PASSWORD)

gcloud sql databases create "$DB_NAME" --instance="$INSTANCE"
gcloud sql users create app_user --instance="$INSTANCE" --password="$DB_PWD"

echo "Connection name: $(gcloud sql instances describe "$INSTANCE" --format='value(connectionName)')"
```

1.6 `scripts/local/start-proxy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
CONN=$(gcloud sql instances describe defensores-pg --format='value(connectionName)')
cloud-sql-proxy --port 5432 "$CONN"
```

1.7 `.env.example` + gitignored `.env.local`.

1.8 `/api/healthz` controller pings DB via `prisma.$queryRaw\`SELECT 1\``.

**STOP.** User confirms: instance up; `pnpm start:dev` runs locally; `/api/healthz` returns 200 against the proxy.

### Phase 2 — Reference data + bootstrap

2.1 `scripts/seed/seed-reference.ts`. `js/data.js` is not JSON — it's JS literals. Use `node -e` to require it and emit JSON, then parse and upsert. Idempotent (upsert by `divipola` for puestos and municipios; by `name` for subregiones/comunas/zonas). After seed, log counts: expect 9 subregiones / 125 municipios / 6 zonas / 1,282 puestos. Comuna count is unknown — log whatever comes through. If a comuna↔zona mapping is needed for ZONE_COORDINATOR scope, also derive it from `MEDELLIN_ZONAS` in `data.js` and store it (extend the schema with a `Comuna.zonaId?` if needed — flag as a Phase 0 question if ambiguous).

2.2 `scripts/bootstrap/bootstrap-super-admins.ts`. Reads `BOOTSTRAP_SUPER_ADMINS_JSON` via `@google-cloud/secret-manager`. For each entry:
- `auth.createUser({ email: '<username>@defensores.local', password: <temp>, displayName: <displayName> })` → returns CIP UID
- `prisma.user.create({ username, displayName, role: 'SUPER_ADMIN', cipUid, mustChangePassword: true, active: true })`
- If create fails after CIP succeeded: `await auth.deleteUser(cipUid)` and re-throw.
- If the username already exists in either CIP or Postgres: skip (log "already bootstrapped").

2.3 Run both scripts against the local proxy.

**STOP.** User confirms: counts correct; both super_admins in CIP console AND `users` table; `mustChangePassword=true`.

### Phase 3 — Auth + RBAC core

3.1 `FirebaseAdminService` provider — initializes `firebase-admin` with `GOOGLE_APPLICATION_CREDENTIALS` (local) or default ADC (Cloud Run).

3.2 `AuthGuard`, `RolesGuard`, `ScopeGuard` per §6.3. Plus `@Roles(...)`, `@RequireScope(scopeType, paramName)`, `@CurrentUser()` decorators.

3.3 `PermissionsService.accessiblePuestoIds(user)` and `canAccess(user, scopeType, scopeId)` — uses the CTE in §6.2 via `prisma.$queryRaw`.

3.4 `AuthController`:
- `GET /api/auth/me` → returns `{ user, role, scopes }`
- `POST /api/auth/password-changed` → flips flag + audit
- `POST /api/auth/logout` → revokes CIP refresh tokens, audit

3.5 Global `MustChangePasswordInterceptor` returning 412 on non-`/api/auth/*` routes when `req.user.mustChangePassword === true`.

3.6 `@nestjs/throttler` registered: 10/min/IP on `/api/auth/*`.

3.7 Unit tests in `test/permissions.spec.ts`: matrix of 6 roles × 5 scope types, positive + negative cases. Hard cases:
- `REGIONAL_COORDINATOR` over subregión X → access to a puesto in a comuna in a municipio in X = true.
- `MUNICIPAL_COORDINATOR` over municipio Y → access to a puesto in a different municipio = false.
- `PUESTO_COORDINATOR` over puesto Z → access to puesto Z = true; to puesto W = false.
- Expired token → 401.
- `mustChangePassword=true` on `/api/resources/...` → 412.

**STOP.**

### Phase 4 — REST API

> Cross-reference §2.3: the 21 write call sites become endpoints here. Site #1 (bulk) becomes a single batch endpoint. Sites #7-9, 12, 14, 17 (debounced) become PATCH with `If-Match: <updatedAt>` for optimistic concurrency.

4.1 Read endpoints (`GET`, scope-filtered server-side using `accessiblePuestoIds`):
- `GET /api/subregiones`
- `GET /api/municipios?subregionId=`
- `GET /api/comunas?municipioId=`
- `GET /api/zonas`
- `GET /api/puestos?municipioId=&comunaId=`

4.2 Resource modules (`POST` / `PATCH` / `DELETE`) for: `pregoneros`, `testigos`, `abogados`, `movilidad`, `refrigerios`, `comparendos`. Each:
- DTOs with `class-validator`
- `@UseGuards(AuthGuard, RolesGuard, ScopeGuard)` and `@RequireScope(...)` on mutations
- Every mutation wraps a Prisma `$transaction` that writes the business row AND one `AuditLog` row
- PATCH endpoints accept `If-Match: <ISO updatedAt>` header; reject 412 if stale

4.3 User management (super_admin only):
- `GET /api/users`
- `POST /api/users` → CIP + DB in lockstep per §7.4; returns `{ user, temporary_password }`
- `PATCH /api/users/:id` → role, scopes, active, displayName, phone, notes
- `DELETE /api/users/:id` → soft (`active=false`)
- `DELETE /api/users/:id?force=true` → hard delete (CIP + DB)

4.4 Swagger at `/api/docs` (`@nestjs/swagger`).

4.5 E2E tests (`test/users.e2e-spec.ts`, `test/resources.e2e-spec.ts`): happy path + 1 out-of-scope negative per resource + 1 If-Match conflict + hard-delete by non-super-admin (expect 403).

**STOP.**

### Phase 5 — Realtime (SSE)

5.1 `RealtimeController` exposes `GET /api/events` decorated with `@Sse()`. Per-connection subject keyed to the user's `accessiblePuestoIds`.

5.2 `RealtimeService` uses `pg-listen` connected to the same Postgres. Listens on channels: `pregonero.changed`, `testigo.changed`, etc.

5.3 Every mutation in §4.2 issues `prisma.$queryRaw\`SELECT pg_notify('<channel>', $1::text)\`` inside the same transaction, payload = JSON `{ id, puestoId|municipioId|scopeType+scopeId, action }`.

5.4 Heartbeat every 25s (`@Sse()` yielding a comment line).

5.5 Frontend `EventSource` reconnects with exponential backoff (1s, 2s, 4s, capped at 30s).

**STOP.**

### Phase 6 — Frontend refactor

6.1 Repoint `js/firebase-init.js` to the **new** project (using `CIP_WEB_API_KEY` and the new project's `firebaseConfig` — from Identity Platform console). Remove `signInAnonymously` entirely.

6.2 New `js/api.js`: REST client class with:
- `setToken(idToken)` / `clearToken()`
- Auto-attach `Authorization: Bearer ${idToken}`
- On 401: clear tokens, redirect to login
- On 412 with `code: 'PASSWORD_CHANGE_REQUIRED'`: route to change-password modal
- On 412 with If-Match mismatch: notify caller for retry
- Methods: `get(path, params?)`, `post(path, body, headers?)`, `patch(path, body, ifMatch?)`, `delete(path, params?)`

6.3 Rewrite `js/auth.js`:
- Login form calls `firebase.auth().signInWithEmailAndPassword(\`${username}@defensores.local\`, password)`
- On success: fetch `/api/auth/me`, store user + role + scopes in **module-scope memory** (NOT localStorage)
- Refresh token every 50 min via `firebase.auth().currentUser.getIdToken(true)`
- Idle detection (mouse/key/touch): no event for 60 min → logout

6.4 Rewrite `js/sync.js`:
- Replace `onSnapshot` with `new EventSource('/api/events')`
- On `message` events: dispatch to in-memory store + rerender affected views
- Initial load is `GET /api/...` on demand per view, not bulk-load of 125 municipios

6.5 Update `js/app.js`:
- Replace every `writeMuni(n)` / `writeDebounced(n, ms)` with `api.post(...)` / `api.patch(...)`
- Remove `pushAllToFirestore` entirely
- Pass `If-Match` headers on PATCHes
- Sidebar render uses in-memory user.scopes to filter — items outside scope are not in the DOM at all
- Replace every inline `onclick="..."` with `el.addEventListener('click', () => ...)` using closure-captured data

6.6 New `js/users-admin.js`:
- Renders only when `user.role === 'SUPER_ADMIN'`
- List view: server-paginated if >100 users
- Create form: cascading scope picker (subregión → municipio → comuna → puesto) with text search at puesto level (1,282 entries — virtualize the dropdown)
- Edit form: change role, scopes, displayName, phone, notes, active
- Soft delete: confirmation modal
- Hard delete: typed-confirmation modal — user types the target's username verbatim
- On create success: surface the temp password ONCE with a Copy button, plus reminder "share via secure channel, user changes on first login"

6.7 **XSS pass** — touch every `innerHTML` assignment in `app.js`:
- If purely static markup (no user input): leave it (flag for review)
- If content includes user-provided strings: replace with `textContent`, OR build DOM via `document.createElement` + `.textContent`
- Where rich markup is genuinely needed (e.g. linkified phones), use DOMPurify via CDN with SRI; justify per call site in a comment

6.8 Forced password change UI:
- Modal triggered on any 412 with `code: 'PASSWORD_CHANGE_REQUIRED'`
- Two password fields + show/hide toggles + minimum-length validation
- Calls `firebase.auth().currentUser.updatePassword(newPassword)`
- Then `POST /api/auth/password-changed`
- Reloads the app

6.9 Inactivity timeout: idle detector resets on `mousemove|keydown|touchstart`; after 60 min → `firebase.auth().signOut()` + clear memory + redirect to login.

6.10 Update `index.html`:
- Remove old `auth.js` script reference (replaced by rewritten version)
- Fix stale topbar pills ("465 puestos / 9,471 mesas / 10 municipios AMVA") — compute from API or hardcode actual (1,282 / sum-of-mesas / 125)
- Add CSP meta header for defense in depth

6.11 Manual smoke test `tests/smoke.md`:
- Login as bootstrap super_admin 1 → forced to change password → succeeds → main UI loads
- Create one coordinator at each of the 5 levels with different scopes
- Logout, login as each — verify sidebar shows only their scope
- Each tries to write to a resource in scope: succeeds
- Each tries via raw `curl` to PATCH a resource out of scope: expect 403
- Inject XSS payload `<img src=x onerror=alert(1)>` into a testigo name: render shows literal text, no alert fires
- Open the same puesto in two browsers, one mutates, the other sees update within 2s

**STOP.** Run smoke test, attach `tests/smoke.md` with pass/fail per case.

### Phase 7 — Deploy

7.1 Build & push image:

```bash
cd backend
REGION=us-central1
PROJECT=defensores-2026
gcloud artifacts repositories create defensores --repository-format=docker --location=$REGION || true
gcloud auth configure-docker $REGION-docker.pkg.dev
IMAGE=$REGION-docker.pkg.dev/$PROJECT/defensores/backend:$(git rev-parse --short HEAD)
docker build -t $IMAGE .
docker push $IMAGE
```

7.2 Deploy to Cloud Run:

```bash
INSTANCE_CONN=$(gcloud sql instances describe defensores-pg --format='value(connectionName)')
gcloud run deploy defensores-backend \
  --image=$IMAGE \
  --region=$REGION \
  --service-account=app-backend@$PROJECT.iam.gserviceaccount.com \
  --add-cloudsql-instances=$INSTANCE_CONN \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT,DB_INSTANCE_CONN=$INSTANCE_CONN,NODE_ENV=production,CORS_ORIGINS=https://coordinacion-electoral.vercel.app" \
  --set-secrets="DB_APP_USER_PASSWORD=DB_APP_USER_PASSWORD:latest,CIP_WEB_API_KEY=CIP_WEB_API_KEY:latest" \
  --min-instances=1 \
  --max-instances=5 \
  --memory=512Mi \
  --cpu=1 \
  --allow-unauthenticated
```

7.3 Frontend on Vercel: add env vars `API_BASE_URL` (Cloud Run URL) and new `firebaseConfig` JSON; redeploy.

7.4 Bootstrap against production (via Cloud SQL Auth Proxy with `DATABASE_URL` set to prod).

7.5 Verify `/api/healthz` on the public URL returns 200.

7.6 End-to-end smoke against prod (same as 6.11).

**STOP.**

### Phase 8 — Hardening + cleanup

8.1 Remove any remaining hardcoded `Cord{N}.2026*` from `js/auth.js`. Verify with `git grep`.

8.2 Document (do NOT execute) git history rewrite steps (`git filter-repo` or BFG) to purge old hardcoded creds from history. Add to `POSTMORTEM.md`.

8.3 Update `README.md`:
- Correct architecture description
- Remove the false "barrera real" security claim
- Fix the restore instructions (the old reference to deleting `amva26v2` Firestore doc was wrong — that's a localStorage key)
- Update file structure to match §4
- Fix topbar counts to reflect actual data
- Document local dev (§11)

8.4 Resolve missing `CLAUDE_2.md` referenced in `.gitignore` (remove the entry or create the file).

8.5 Adversarial pass — `tests/adversarial.md`:
- (A) Anonymous request to `/api/users` → expect 401
- (B) Cross-scope read: coordinator A queries puesto outside scope → 403 or empty filtered result
- (C) Cross-scope write: coordinator A PATCHes puesto outside scope with their valid token → 403
- (D) Privilege escalation: coordinator A calls `PATCH /api/users/<A.id>` with `role: SUPER_ADMIN` → 403
- (E) Audit log tamper: POST or PATCH to audit endpoints → 404 or 403 (no write endpoints exist for audit)
- (F) Expired token replay: copy token, wait >1h, retry → 401
- (G) Hard-delete by non-super-admin → 403
- (H) XSS payload in name field → rendered as literal text in both originator's and another user's browser
- (I) SQL injection attempt in search field → Prisma parameterization neutralizes it
- (J) Race: two concurrent PATCHes with same `If-Match` → one succeeds, the other 412

8.6 `POSTMORTEM.md`:
- What shipped (Phases 1-8)
- What was deferred (Next.js rewrite, cascading user delegation, MFA, full audit retention policy, fine-grained sub-permissions)
- Residual risks
- Git history rewrite instructions (from 8.2)
- Suggested next change

**STOP.**

---

## 13. Testing Strategy

- **Unit tests** (Jest, `pnpm test`): `permissions.spec.ts` is critical — the 6×5 role×scope matrix. Aim ≥95% coverage on the permissions service.
- **E2E tests** (Supertest against isolated test DB): one happy + one out-of-scope per resource, plus auth flows.
- **Manual smoke** (`tests/smoke.md`) at end of Phase 6 against local; Phase 7 against production.
- **Adversarial** (`tests/adversarial.md`) at end of Phase 8.

Test DB: separate Postgres instance or schema, migrations applied fresh per test run. Do NOT run tests against the seeded production DB.

---

## 14. Rollback & Recovery

- **Failed Cloud Run deploy**: previous revision keeps serving — `gcloud run revisions list --service=defensores-backend` then `gcloud run services update-traffic defensores-backend --to-revisions=<prev>=100`.
- **Bad migration**: Prisma migrations are versioned; `pnpm prisma migrate resolve --rolled-back <name>` and re-apply. Always test migrations against a snapshot before prod.
- **Cloud SQL backups**: auto-enabled by `provision-cloud-sql.sh` (daily 03:00). PITR is on by default.
- **Lost super_admin access**: rerun `bootstrap-super-admins.ts` — idempotent; or use GCP console to reset CIP password directly.
- **CIP/Postgres desync detection**: daily cron (defer to v2) diffing `firebase-admin.auth().listUsers()` vs `prisma.user.findMany`.

---

## 15. Rules of Engagement

1. **One phase at a time.** STOP after each phase. Wait for explicit "go".
2. Inside a phase: **one task at a time.** After each: diff summary + acceptance check. Wait for "go".
3. **No scope creep.** Tempting fix outside the current task → log in `BACKLOG.md` and continue.
4. **No guessing.** Ambiguity → STOP and ask. Never guess: schema changes beyond this spec, new endpoints, new dependencies, deployment regions, secret values.
5. **No silent failures.** Every DB / CIP / Cloud Run call has explicit error handling and structured Pino logs.
6. **No secrets in repo.** Secret Manager or `.env.local` (gitignored). Pre-commit grep for common patterns.
7. **Defense in depth.** UI restrictions backed by API guards, API guards backed by DB constraints where possible.
8. **Superpowers skills are mandatory** (see §18). Improvising where a skill exists violates these rules.
9. **Citations.** Every claim about the existing codebase references `file:line`. No paraphrasing without source.
10. **Brutally honest progress reports.** Corner-cuts logged out loud, not buried.

---

## 16. Success Criteria

Migration is done when ALL hold:

- [ ] Attacker with the production URL cannot read/write any data without valid CIP credentials (8.5/A).
- [ ] Super_admin can create users at any of 5 coordinator levels via UI; temp password appears once; new user forced to change on first login.
- [ ] Coordinator at any level sees only their scope (verified in DOM and via curl in 8.5/B,C).
- [ ] Login p50 < 1.5s.
- [ ] XSS payloads in mutated fields render as text (8.5/H).
- [ ] Bootstrap script idempotent; CIP-rollback works on simulated Postgres failure.
- [ ] Both bootstrap super_admins forced to change password on first login.
- [ ] Audit log captures every mutation; tamper blocked (8.5/E).
- [ ] Inactivity timeout enforced (8.5/F).
- [ ] Hard delete by non-super-admin blocked (8.5/G).
- [ ] Optimistic concurrency works (8.5/J).
- [ ] `POSTMORTEM.md` exists and is honest.

---

## 17. Out of Scope / v2 Backlog

Intentionally **not** in v1. Log surfacing requests into `BACKLOG.md`:

- Next.js or React frontend rewrite.
- Cascading user delegation (e.g., regional coord creates municipal coords beneath).
- Multi-factor auth.
- Detailed audit retention policy (currently: keep forever).
- Per-field-level permissions inside a resource.
- Bulk import/export of users.
- SAML / OIDC SSO.
- WebSocket-based realtime (we use SSE in v1).
- Mobile native app.
- Internationalization (Spanish-only in v1).
- Federated analytics / BigQuery export.

---

## 18. Superpowers Plugin (mandatory)

Before Phase 0 and at the start of every subsequent phase, scan available skills (the superpowers plugin and any project-local `.claude/skills` or user-level skills library). Load and apply skills matching the work:

- **Phase 0**: spec-driven-development, planning, requirement-clarification.
- **Phases 1–4**: test-driven-development, schema-design, api-design, code-review.
- **Phase 5**: realtime / streaming patterns if available.
- **Phase 6**: frontend-design, xss-remediation, accessibility.
- **Phase 7**: deployment / cloud-run / iac.
- **Phase 8**: security-review, adversarial-testing, postmortem-writing.

Rules:

1. Do not improvise where a skill exists — load and follow the skill.
2. If multiple skills apply, load all; they compose.
3. If a phase has no matching skill, say so explicitly ("no skill matched X; proceeded from first principles").
4. Skills override generic phrasing here only when more specific; never when they conflict with explicit decisions in this spec.

---

## 19. Start

You are at the start of Phase 0. There is no prior DISCOVERY.md or TASKS.md in this fresh session.

1. Apply Superpowers Plugin skills relevant to spec reading + planning + requirement clarification.
2. Read the spec end-to-end. If anything is genuinely ambiguous, ask focused questions BEFORE writing.
3. Read the codebase files listed in §2.1.
4. Produce `DISCOVERY.md` (verify §2.3 line numbers, list XSS surfaces, README contradictions) and `TASKS.md` (checkbox list per phase) per Phase 0 specification.
5. STOP after the two files exist. Wait for explicit "go" before Phase 1.

Do not write any backend code, do not provision any GCP resources, do not modify any frontend file until Phase 0 is approved.
