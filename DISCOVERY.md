# DISCOVERY.md — Comando Electoral AMVA 2026

> Audit / reconnaissance document. **No changes proposed, no code written.**
> Generated 2026-05-20 against branch `main` @ commit `bdbe388`.

---

## 1. Project & Data Architecture

### 1.1 What it is
Web app for electoral campaign coordination ("Defensores de la Patria · Abelardo de la
Espriella 2026") across **Antioquia, Colombia**. Tracks coordinators, pregoneros, testigos
electorales, abogados, refrigerios, comparendos and mobility resources per voting station.

### 1.2 Stack
- **Frontend:** HTML/CSS/JS vanilla. No framework, no bundler, no build step.
- **DB:** Firebase Firestore — project `comando-electoral-amva`.
- **Auth:** Firebase **Anonymous Auth** only.
- **Maps:** Leaflet 1.9.4 (unpkg). **Excel:** SheetJS/XLSX 0.18.5 (cdnjs). **Firebase SDK:** 10.12.2 compat (gstatic).
- **Hosting:** Vercel, auto-deploy on push to `main`.

### 1.3 State model — three layers

| Layer | Where | Key / shape |
|---|---|---|
| Static data | `js/data.js` | `RAW`, `REGIONES`, `PREG_BASE`, `MOV_PRELOAD`, `COORD_PRELOAD`, `PRELOAD_VERSION`, `TAGS`, `MEDELLIN_ZONAS`, `AMVA` |
| Local cache | `localStorage` | **key `amva26v2`** → full `ST` object, serialized JSON, plaintext |
| Remote state | Firestore | collection `estado`, **one document per municipality** (doc id = municipality name), each stamped `_v: 2` |

- In-memory state lives in the global `ST` object (`js/app.js:2`). `gs(n)` lazily
  initializes a municipality's slice.
- `loadLocalSt()` / `saveLocalSt()` (`app.js:8-13`) read/write the `localStorage`
  key **`amva26v2`**. The entire dataset for every municipality the user has touched
  is cached there unencrypted.
- Per-municipality Firestore doc holds: `coord`, `phone`, `comunas`, `zonas`,
  `puestos`, `pregoneros`, `testigos`, `movilidad`, `abogados`, `refrigerios`,
  `comparendos`.
- Realtime sync: one `onSnapshot` listener **per municipality** (`sync.js:startListener`).
  Reads reconcile via `deepMerge` (remote wins). **Writes are full-document `.set()`
  overwrites** via `writeMuni` (`sync.js:40`).

### 1.4 Scale (measured from `RAW` in `data.js`)
- 9 subregions, **125 municipalities** present in `RAW`, **1,282 voting stations**.
- Medellín alone: 250 stations across 6 geographic zones.

### 1.5 Identity / login
- `js/auth.js` defines `USERS` = `coordinador1..4`, passwords `Cord{N}.2026*`.
- `doLogin()` compares input against that in-memory object and, on match, sets
  `CURRENT_USER`, hides the login `<div>`, stores `sessionStorage['amva_user']`.
- `CURRENT_USER` is **never sent to Firestore** and **never checked on any write**.

---

## 2. Security Gaps — Attacker's View

> Threat model: attacker has the **public URL** (`coordinacion-electoral.vercel.app`)
> and can open DevTools / View Source. No insider access assumed.

### 2.1 Anonymous Auth + permissive rules = total data exposure — CRITICAL
`firestore.rules`:
```
match /estado/{doc} {
  allow read, write: if request.auth != null;
}
```
`request.auth != null` is satisfied by **any anonymous session**. Anonymous auth is
self-serve — no credential, no invite, no allowlist. The attacker:
1. Opens `js/firebase-init.js` → copies the full `firebaseConfig` (apiKey, projectId,
   appId — all shipped to the browser).
2. In any script/console: `firebase.initializeApp(config)` → `auth().signInAnonymously()`.
3. Reads **the entire `estado` collection** and writes/overwrites **any document**.

There is no app to "run", no login to pass. The database is, for practical purposes,
**publicly readable and publicly writable**.

> **CONTRADICTION FLAG.** `README.md` lines 102 claims: *"Un atacante que descargue
> los archivos JS pero no corra la app no puede autenticarse anónimamente y será
> rechazado por Firestore."* This is **false**. Anonymous auth requires nothing but
> the public `firebaseConfig`. The README's stated "barrera real de seguridad" does
> not exist.

### 2.2 Hardcoded passwords in the client bundle — HIGH (but moot)
`js/auth.js` ships `coordinador1..4` / `Cord1.2026*`…`Cord4.2026*` to every visitor.
View Source reveals all four credentials. README line 101 acknowledges this as
"intencional".

However — the passwords **gate nothing**. `doLogin()` only toggles a CSS `display`
property. The attacker does not even need them: calling `startApp()` from the console,
or hitting Firestore directly (2.1), bypasses the login screen entirely. The login is
**cosmetic**.

### 2.3 No per-user identity on writes — HIGH
`writeMuni(n)` (`sync.js:40`) does `db.collection('estado').doc(n).set(data)`. The
payload is `gs(n)` plus `{_v:2}` — **no `uid`, no `updatedBy`, no `updatedAt`,
no actor field of any kind**. `CURRENT_USER` is never serialized. After any write it
is impossible to attribute the change to a coordinator, an anonymous user, or an
attacker.

### 2.4 No audit trail — HIGH
- Writes are whole-document `.set()` — **not `update()`** — so each write *replaces*
  the municipality document. No field-level history.
- No history collection, no soft-delete, no versioning beyond the `_v:2` schema stamp.
- A single malicious (or buggy) write can blank an entire municipality — every
  coordinator name, phone, cédula, testigo, comparendo — with **no recovery path**.
  README line 79-83 "restore defaults" only restores `data.js` base data, i.e. it
  wipes all operational entries; it is not a backup.

### 2.5 Stored XSS that propagates to every user via realtime sync — CRITICAL
Every render function builds HTML with template strings and injects **unescaped**
user-controlled values via `innerHTML`. Examples: `buildPT` injects `ps.coord`,
`ps.notes`, `p.direccion`; `buildCCCard` injects `sc.coord`; directory/PDF/Excel
builders inject names, phones, `comparendo.notas`, etc.

Attack: write a coordinator/pregonero/testigo name (or note) of
`<img src=x onerror=fetch(...)>` — directly to Firestore (2.1) or through the UI.
The `onSnapshot` listener pushes it to **every other coordinator's browser**, where
it renders and **executes**. That JS runs with full Firestore read/write access →
exfiltrate the whole DB, deface, pivot. This is the most severe *practical*
escalation: a write-XSS worm over the realtime channel.

Inline `onclick` handlers also interpolate values with only `.replace(/'/g,"\\'")`
quote-escaping (e.g. `buildPT` line ~335). That is insufficient — a value containing
`');payload//` or a backslash can break out of the JS string context.

### 2.6 PII / Habeas Data exposure — HIGH
The database stores **names, phone numbers, and cédulas** (Colombian national ID) of
pregoneros, plus names/phones of testigos, coordinators and lawyers. Under 2.1 this
is effectively public. Cédula + phone is regulated personal data (Ley 1581/2012,
Habeas Data). No consent record, no access control, no encryption at rest beyond
Firestore defaults.

### 2.7 Cost / quota abuse (billing DoS) — MEDIUM
Rules impose no rate limit, no document-size limit, no field schema. An authenticated
anonymous attacker can spray writes, create arbitrary docs in `estado`
(`match /estado/{doc}` allows any doc id), and inflate read/write counts and storage
toward Firestore quota/billing limits.

### 2.8 Destructive write race (integrity, not just security) — MEDIUM
`writeMuni` serializes the **whole local `gs(n)`** and `.set()`s it. `deepMerge`
runs only on **read**. If client A holds stale state for a municipality and edits one
field, its write **silently reverts** every field changed by client B that A had not
yet received. "Last blur wins" understates it: last writer overwrites the entire
municipality.

### 2.9 Supply chain — no SRI on third-party scripts — MEDIUM
`index.html` loads xlsx from **cdnjs** and Leaflet from **unpkg** with **no
`integrity=` (SRI) attribute**. A compromised/yanked CDN asset executes arbitrary JS
in the app — which has full Firestore access (2.1). Firebase loads from gstatic
(also no SRI).

### 2.10 Outdated dependency — XLSX 0.18.5 — LOW/MEDIUM
SheetJS 0.18.5 predates fixes for known prototype-pollution / ReDoS advisories
(e.g. CVE-2023-30533). Exploitation generally requires opening a crafted file, so
impact is bounded, but it is a stale, CDN-pinned dependency.

### 2.11 Login bypass via sessionStorage — LOW (login is cosmetic anyway)
`sessionStorage['amva_user'] = 'coordinador1'` set from the console satisfies the
auto-login block (`auth.js:68-77`). Irrelevant given 2.2, but noted for completeness.

### 2.12 Local cache leakage — LOW
`localStorage['amva26v2']` holds the full dataset in plaintext. On a shared/public
machine, any subsequent user can read every coordinator, phone and cédula the
previous user loaded.

---

## 3. Write Inventory — `js/app.js`

Purpose: identify every site that needs **scope-guarding** later (restricting *which
municipality* a user may write, and *whether* that user is authorized). **Today, zero
of these sites check identity or scope.** `writeMuni` / `writeDebounced` are defined
in `js/sync.js`; the table lists their **call sites in `app.js`**.

### 3.1 Firestore writes (the scope-guard surface)

| # | Function | app.js line | Write call | UI trigger | Scope written |
|--:|---|--:|---|---|---|
| 1 | `pushAllToFirestore` | def 85; call 906 | `db.collection('estado').doc(n).set()` per muni | `startApp` initial load (preload v3 / `_v` migration) | **bulk — all municipalities** |
| 2 | `savePCard` | 406 | `await writeMuni(n)` | "💾 Guardar" on a puesto card | municipality `n` |
| 3 | `saveM` (modal, type `muni`) | 780 | `await writeMuni(MCX.n)` | save municipal/city coordinator | municipality |
| 4 | `saveM` (modal, type `cc`) | 784 | `await writeMuni(MCX.n)` | save commune/zone coordinator | municipality |
| 5 | `saveM` (modal, type `p`) | 788 | `await writeMuni(MCX.n)` | save puesto coordinator | municipality |
| 6 | `saveM` (modal, type `zona`) | 793 | `await writeMuni(MCX.n)` | save Medellín geographic-zone coord | municipality |
| 7 | `updatePregField` | 584 | `writeDebounced(n, 700)` | edit a pregonero field | municipality |
| 8 | `setPregCount` | 595 | `writeDebounced(n, 400)` | change Nº pregoneros for a puesto | municipality |
| 9 | `savePregCount` | 605 | `writeDebounced(n, 400)` | change global "necesarios" count | municipality |
| 10 | `saveAllPreg` | 611 | `await writeMuni(n)` | "💾 Guardar todo" (pregoneros panel) | municipality |
| 11 | `addTestigo` | 622 | `writeMuni(n)` | "+ Agregar testigo" | municipality |
| 12 | `updateTestigo` | 633 | `writeDebounced(n)` | edit a testigo field | municipality |
| 13 | `delTestigo` | 639 | `writeMuni(n)` | "×" delete testigo | municipality |
| 14 | `updateResp` | 721 | `writeDebounced(n, 700)` | edit a movilidad responsable field | municipality |
| 15 | `addResp` | 733 | `await writeMuni(n)` | "+ Agregar responsable" | municipality |
| 16 | `delResp` | 739 | `await writeMuni(n)` | "×" delete responsable | municipality |
| 17 | `saveMovNec` | 745 | `writeDebounced(n, 500)` | change motos/carros "necesarios" | municipality |
| 18 | `saveMovAll` | 750 | `await writeMuni(n)` | "💾 Guardar movilidad" | municipality |
| 19 | `saveAbogado` | 1210 | `writeMuni(n)` | "💾 Guardar abogado" | municipality |
| 20 | `saveRefrig` | 1248 | `writeMuni(n)` | "💾 Guardar encargado" (refrigerios) | municipality |
| 21 | `saveComparendos` | 1322 | `writeMuni(n)` | "💾 Guardar comparendos" | municipality |

**21 Firestore write call sites. None is identity- or scope-guarded.** Every one
derives the municipality `n` from UI state (`CUR`, `MCX.n`, or a handler argument);
nothing ties `n` to `CURRENT_USER`. Site #1 writes *all* municipalities at once.

### 3.2 localStorage-only writes (`saveLocalSt()` — no Firestore)
Lines: 76 (`_innerPreload`), 405, 583, 594, 604, 610, 621, 632, 638, 720, 732, 738,
744, 749, 779, 783, 787, 792, 902, 1207, 1245, 1305, 1312, 1318. These persist `ST`
to the `amva26v2` key only. Not a network surface, but they shape what a later
full-document `.set()` will overwrite (see 2.8).

### 3.3 Behavioral flag — abogados / refrigerios / comparendos are NOT realtime-synced
Unlike pregoneros / testigos / movilidad / puestos (which call `writeDebounced` or
`writeMuni` on every edit), these panels only persist locally on edit:

- `updateAbogado` (1202) → `saveLocalSt()` only. Firestore write happens **only** on
  "Guardar abogado" (`saveAbogado` → site #19).
- `updateRefrig` (1240) → `saveLocalSt()` only. Firestore only on "Guardar encargado"
  (`saveRefrig` → site #20).
- `updateComparendo` (1299), `addComparendo` (1307), `delComparendo` (1315) →
  `saveLocalSt()` only; `add`/`del` also re-render. Firestore only on "Guardar
  comparendos" (`saveComparendos` → site #21).

Consequence: a coordinator who adds/edits an abogado, refrigerio, or comparendo and
navigates away **without clicking the panel's Guardar button loses that data on every
other device** — it lives only in their own `localStorage`. Worse, an incoming
`onSnapshot` for that municipality runs `deepMerge`, which **replaces arrays
wholesale** (`b` wins), so an unsaved local `comparendos[ck]` array can be silently
overwritten by remote state before it is ever saved. Flag this as a
data-loss/consistency hazard distinct from the security findings.

---

## 4. Contradictions vs. the codebase (flagged per instruction)

1. **README security claim is false.** `README.md:102` says an attacker who downloads
   the JS "cannot authenticate anonymously and will be rejected by Firestore." Anonymous
   auth is self-serve and needs only the public `firebaseConfig`. See §2.1.

2. **README restore procedure points at a non-existent document.** `README.md:79-83`
   says delete Firestore document **`amva26v2`** in collection `estado`. No such doc
   exists. `amva26v2` is the **`localStorage` key**. The live architecture
   (`sync.js`, `_v:2`) uses **one document per municipality**, doc id = municipality
   name. The restore instructions are stale and would not work.

3. **README file-structure list is stale.** `README.md:93` describes `js/sync.js` as
   exporting `writeField, writeFields, deepMerge`. `writeField`/`writeFields` do not
   exist; `sync.js` actually defines `writeMuni`, `writeDebounced`, `deepMerge`,
   `setSyncBadge`, `startListener`, `loadFromFirestore`, `rerenderIfNotEditing`.
   `README.md:91` lists `data.js` as `RAW, PREG_BASE, MOV_PRELOAD, AMVA, TAGS` but
   omits `REGIONES`, `PRELOAD_VERSION`, `COORD_PRELOAD`, `MEDELLIN_ZONAS`.

4. **Topbar counters are wrong.** `index.html:38-40` hardcodes "10 municipios AMVA /
   465 puestos / 9,471 mesas". Actual `RAW` data: **125 municipalities, 1,282 voting
   stations** across all of Antioquia. The pills were never updated after the scope
   expanded beyond AMVA (commit `dd6f487` added all 115 Antioquia municipalities).

5. **`firestore.rules` scopes only `estado`.** Other paths are default-deny (fine),
   but `match /estado/{doc}` allows write to **any doc id**, including arbitrary new
   documents — not just the known municipality names. See §2.7.

---

## 5. Spec Amendments Applied in Phase 0

> Phase 0 §0.4 surfaced one genuine ambiguity; the owner resolved it and authorized the
> amendments below. **`MIGRATION_SPEC.md` is read-only and remains unchanged** — this
> section is the canonical record of the deltas, and `TASKS.md` is written to match.
>
> **Ambiguity:** `ZONE_COORDINATOR` scope was unresolvable. The §5 `Zona` model had no
> relation to `Comuna`/`Puesto`, and the §6.2 CTE had no zona branch. The comuna↔zona
> mapping is hardcoded **1:1** in `js/data.js:14` `MEDELLIN_ZONAS` (6 zonas, each with a
> comuna-key list). **Resolution:** model it as a direct foreign key — the relationship
> is 1:N (each comuna in exactly one zona), so a join table is overkill and an app-level
> constant would hide queryable data in code and drift from the seed.

### Amendment 1 — §5 schema: link `Comuna` ⇄ `Zona`

`Comuna` gains a nullable `zonaId` FK (NULL for every non-Medellín comuna); `Zona` gains
the back-relation.

```prisma
model Comuna {
  id          Int        @id @default(autoincrement())
  municipioId Int
  municipio   Municipio  @relation(fields: [municipioId], references: [id])
  name        String
  zonaId      Int?
  zona        Zona?      @relation(fields: [zonaId], references: [id])
  puestos     Puesto[]

  @@unique([municipioId, name])
  @@index([zonaId])
}

model Zona {
  id      Int      @id @default(autoincrement())
  name    String   @unique
  comunas Comuna[]
}
```

### Amendment 2 — §6.2 CTE: insert a `user_zonas` branch between subregiones and comunas

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
user_zonas AS (
  SELECT "scopeId" FROM "UserScope" WHERE "userId" = $1 AND "scopeType" = 'ZONA'
),
user_comunas AS (
  SELECT c.id FROM "Comuna" c
  WHERE c."municipioId" IN (SELECT id FROM user_municipios)
     OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
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

For `SUPER_ADMIN`, still short-circuit (return all `Puesto.id`s) per §6.2.

### Amendment 3 — Phase 2.1 seed: assign zonas to Medellín comunas

After upserting `Comuna` rows from `js/data.js`, parse `MEDELLIN_ZONAS` (`js/data.js:14`).
For each `zonaName → [comunaNames]` entry, update the matching `Comuna` row
(`municipio.name = 'MEDELLIN'` AND `comuna.name = <comunaName>`) with the matching
`zonaId`. The seed must log:

- Number of comunas assigned a zona (should equal the total Medellín comuna count).
- Any comuna name in `MEDELLIN_ZONAS` that did **not** match a seeded `Comuna` (warn loudly).
- Any Medellín `Comuna` left without a zona after the pass (warn loudly).

> Data note: `MEDELLIN_ZONAS` comuna keys include quirks the seed must match verbatim —
> e.g. `'20CORREGIMIENT O SAN CRISTOBAL'` (embedded space) and `'SIN COMUNA'`.

### Amendment 4 — Phase 3.7 tests: add `ZONE_COORDINATOR` cases to the permissions matrix

- User scoped on Zona "Nororiental" → access to a puesto in a comuna in that zona = **true**.
- Same user → access to a puesto in a comuna in "Sur Oriental" = **false**.
- Same user → access to a puesto outside Medellín entirely = **false**.

### Amendment 5 — Keyless GCP auth for local dev (org policy blocks SA keys)

> **Provenance: §10 pre-flight Step D, not Phase 0 §0.4.** Surfaced 2026-05-20 while
> executing the §10.4 runbook; the owner chose the resolution below the same day.
> Recorded here so `MIGRATION_SPEC.md` stays byte-for-byte unchanged.
>
> **Blocker:** `gcloud iam service-accounts keys create` fails with `FAILED_PRECONDITION`
> — org policy `constraints/iam.disableServiceAccountKeyCreation` is enforced on the
> parent organization (`979565691233`). No service-account key JSON can be created.
>
> **Resolution:** authenticate local dev with **Application Default Credentials +
> service-account impersonation** — keyless. Strictly *more* aligned with §9 ("no
> secrets in repo, ever") than a key file.

Supersedes the key-JSON parts of **§10.4** and **§11**:

- **§10.4** — drop `gcloud iam service-accounts keys create ./backend/.gcp-key.local.json`.
  Replace with: grant the developer's user account `roles/iam.serviceAccountTokenCreator`
  on the `app-backend` SA, then `gcloud auth application-default login
  --impersonate-service-account=app-backend@coordinacion-electoral.iam.gserviceaccount.com`.
  Done 2026-05-20: token-creator granted to `user:jdmg206@gmail.com`.
- **§11 `.env.local`** — remove `GOOGLE_APPLICATION_CREDENTIALS=./.gcp-key.local.json`.
  ADC is auto-discovered from the well-known path; the impersonation config is baked
  into the ADC file by the login command above.
- **§3.1 / T16** — `FirebaseAdminService` initializes `firebase-admin` with
  `applicationDefault()` in all environments (local = impersonated ADC, Cloud Run =
  attached SA); no `GOOGLE_APPLICATION_CREDENTIALS` branch.
- No `backend/.gcp-key*.json` file is ever created; the `.gitignore` entry for it is
  kept as harmless defense-in-depth. Cloud SQL Auth Proxy and
  `@google-cloud/secret-manager` consume ADC automatically — no other change.

### Amendment 6 — Cloud Build replaces local Docker build/push (no local container runtime)

> **Provenance: §10 pre-flight Step F, 2026-05-20.** `docker` is not installed and
> cannot be — corporate laptop, no admin rights, no container runtime installable.
> The owner authorized the pivot the same day.
>
> **Resolution:** Google Cloud Build builds and pushes the image from source. The
> `Dockerfile` is still authored exactly as specified — Cloud Build executes it
> remotely. Only the *local* `docker build` / `docker push` steps are replaced.

Supersedes the Docker-local parts of **§1.4 / §7.1 / §10.6 / §11**:

- **T08 (§1.4)** — the `Dockerfile` + `.dockerignore` are still produced as specified.
  Acceptance changes from "`docker build` && `docker run` succeed locally" to: the
  Dockerfile is exercised remotely by Cloud Build at T44, and the deployed image
  returns 200 on `/api/healthz` (T45). No local build verification.
- **T44 (§7.1)** — replace `docker build` + `docker push` with `gcloud builds submit
  --tag ${REGION}-docker.pkg.dev/coordinacion-electoral/defensores/backend:<git-sha>
  . --project=coordinacion-electoral`. As part of T44 setup, verify the Cloud Build
  service account `<project-number>@cloudbuild.gserviceaccount.com` holds
  `roles/artifactregistry.writer` on the project; grant it if missing.
- **§10.6 / Step F** — the `docker ps` pre-flight check is **removed** from the
  Phase 1 gate. Replacement check: `gcloud builds submit --help` succeeds (the
  command ships with the already-installed gcloud SDK — nothing to install).
- **§11 (local dev)** — drop the `docker-compose` reference. Local workflow is
  `pnpm start:dev` on the host plus the Cloud SQL Auth Proxy binary running
  side-by-side. `backend/docker-compose.yml` in the §4 tree is consequently dropped.

### Amendment 7 — Node 24 LTS instead of Node 20

> **Provenance: §10 pre-flight Step F, 2026-05-20.** Node `v24.15.0` is already
> installed locally (user-path install — `C:\Users\atobon\Documents\Juan\node-v24.15.0-win-x64\`,
> no admin needed). Node 24 is the current Active LTS; Node 20 is the older LTS.
>
> **Resolution:** standardize on Node 24 everywhere. No technical reason to
> downgrade — NestJS, Prisma, `firebase-admin` and `pg-listen` all support Node 24 —
> and it eliminates the local=24 / container=20 version skew the original spec would
> have introduced.

- **Local dev** — Node `v24.15.0`, already present.
- **T08 Dockerfile** — `FROM node:24-slim` (not `node:20-slim`). Every spec mention
  of "Node 20" / "Node 20 LTS" / "Node 20 slim" (§3, §1.4, §10.6) reads as Node 24.

### Amendment 8 — Graduated autonomy (operational, not architectural)

> **Provenance: owner directive, 2026-05-20.** A change to the *execution cadence*
> only — it does not alter the target architecture, data model, or any design
> decision in the spec. Recorded here for traceability alongside A1–A7.

Replaces the spec §12 / §15.1–15.2 "STOP after every task" cadence with **graduated
autonomy** for the remainder of the migration:

- **Hard stops — wait for explicit "go":** every Phase boundary (1–8); **before T09**
  (first billable infra, Cloud SQL — owner approves region / tier / instance name);
  **before T45** (Cloud Run production deploy); **after T37**, **after T38**,
  **after T39** (frontend write-path rewrite / users-admin UI / XSS pass).
- **Otherwise:** T-tasks run autonomously within a phase — run, verify with concrete
  command output, proceed to the next; no per-task STOP.
- **Error policy:** environmental error (transient API, package resolution, path,
  timeout) → try one alternative, else STOP + report; spec ambiguity → STOP and ask;
  architectural decision (new dependency, schema change beyond spec, extra endpoint,
  infra deviation) → STOP and propose a new amendment (A5/A6/A7 protocol); failing
  test → STOP and report, never edit the test to make it pass.
- **Verification:** every "✅ done" carries concrete command output as evidence,
  shown at the next reporting boundary; memory is re-read after each write to confirm
  it persisted.

### Amendment 9 — Prisma pinned to 6.x (spec §5 schema used verbatim)

> **Provenance: T06, 2026-05-20.** `pnpm add prisma` installed Prisma 7.8.0
> (latest). Prisma 7's `prisma init` scaffolds the new `prisma-client` generator
> (mandatory `output` dir), moves the datasource URL into a new `prisma.config.ts`,
> and no longer auto-loads `.env` — none of which matches spec §5's canonical schema
> or §1.2's instruction to "replace generated schema.prisma with the schema in §5".
>
> **Resolution (owner decision):** pin `prisma` and `@prisma/client` to the latest
> **6.x** (installed: `6.19.3`). Prisma 6.x is fully supported and lets spec §5 be
> used **verbatim** — `prisma-client-js` generator, `url = env("DATABASE_URL")` in
> the datasource, no `prisma.config.ts`, classic `.env` auto-loading. Every Prisma
> code example in the spec (§3.1 `PrismaService`, §6.2 `$queryRaw` CTE) applies as
> written.

- `backend/package.json` pins `prisma` (devDep) and `@prisma/client` (dep) to `^6`.
- The Prisma-7-generated `backend/prisma.config.ts` was deleted — Prisma 6 + spec §5
  use the classic schema-datasource-url plus auto-loaded `.env`.
- `backend/prisma/schema.prisma` is spec §5 with Amendment 1 applied; confirmed by
  `prisma validate` → "The schema is valid".
- This amendment fixes only the dependency version; spec §5's content is unchanged.

### Amendment 10 — Pregoneros eliminated

> **Provenance: owner main-thread directive, 2026-05-20.** First sanctioned edit to
> `MIGRATION_SPEC.md` itself — the owner explicitly authorized changing the canonical
> spec (every prior amendment, A1–A9, kept it byte-for-byte unchanged). Supersedes an
> earlier `/btw` side-channel request, which was declined pending main-thread
> confirmation.

**Amendment 10 — Pregoneros eliminated.** Organizational decision; pregoneros no
longer exist in the operational model. Impact: removed from `MIGRATION_SPEC.md §5`
and `schema.prisma`; no Pregonero data migrated in Phase 2 seed; all pregoneros UI
affordances deleted (not refactored) in Phase 6.

Applied 2026-05-20:
- `MIGRATION_SPEC.md §5` — `model Pregonero` deleted; `User.pregonerosCreated` and
  `Puesto.pregoneros` relation fields deleted.
- `backend/prisma/schema.prisma` — same deletions; `prisma validate` re-run → valid.
- `backend/src/resources/pregoneros/` (the T07 skeleton module) deleted and
  de-registered from `ResourcesModule` (which now aggregates 5 resource modules).
- `TASKS.md` — T06, T13, T37, T42 tagged `[A10]`.

Still carrying historical/illustrative pregoneros references — covered by this
amendment, NOT separately spec-edited (the owner's directive scoped the spec edit to
§5): `DISCOVERY.md §3` write-site audit (it records the *current* app, which still
has pregoneros); the `resources/pregoneros/` entry in the §4 tree; the
`pregonero.changed` channel in §5/§5.2; "×6 resource modules" in §4 / TASKS T24 /
T30. When Phases 4–6 execute, "pregoneros" is treated as removed.

### Amendment 11 — Testigo schema is the schema actually applied in production

> **Provenance: owner diagnostic, 2026-05-21.** The earlier proposal for a
> multi-field Testigo schema (separate primer/segundo nombre/apellido,
> telefonoStd/Raw/Cat columns) was never applied to the production database.
> The seed script adapted to the existing schema. The owner reviewed the
> production state and ratified the current schema as canonical.

**Amendment 11 — Testigo schema is the schema actually applied in production.**
Columns: `id`, `puestoId` (nullable — 889 seeded rows have no puesto match),
`name` (concatenated full name from CSV), `cedula` (empty for all 7,283 rows —
CSV had no cédula column), `phone`, `status` (default `'pendiente'`), `notes`
(semicolon-delimited free text preserving `quality_flag` and `correo` from the
original CSV), `createdById` (nullable), `createdAt`, `updatedAt`.

The earlier proposal with separate `primerNombre`/`segundoNombre`/`primerApellido`/
`segundoApellido` and `telefonoStd`/`telefonoRaw`/`telefonoCat` fields was not
applied; the seed script adapted to the existing schema. Original CSV nuances
(email, quality_flag) preserved in `notes` as semicolon-delimited text.

State as of 2026-05-21 (seed run): 7,283 total rows; 6,394 with valid `puestoId`; 889
with `puestoId = NULL`; all `cedula` values empty; schema matches
`backend/prisma/schema.prisma` `model Testigo` (puestoId nullable per migration
`20260521054752_make_testigo_fields_nullable`).

**Fix pending (2026-05-21):** `data/testigos_clean.csv` added to repo and
`backend/scripts/seed/fix-puesto-assignments.ts` written. This script cross-references
the clean CSV by name+phone (natural key) to recover the original municipio/puesto for
each NULL testigo, then resolves the `puestoId` via the existing DB `Puesto` rows.
Run with: `npx tsx scripts/seed/fix-puesto-assignments.ts` (requires Cloud SQL proxy +
`.env.local`). Expected outcome: majority of the 889 resolved; a residual of testigos
whose puesto name does not exist in the DB (municipality-only entries or rural puestos
not in `data.js`) will remain NULL and must be assigned manually via the UI.

---

## 6. Status

Reconnaissance complete; the one Phase 0 ambiguity is resolved and recorded above (§5).
Both Phase 0 deliverables — `DISCOVERY.md` and `TASKS.md` — now exist. **No code written,
no GCP resources provisioned, no frontend file modified.** Awaiting explicit "go" to
begin Phase 1.

---

### Amendment A16 — Mesa Assignment System (2026-05-22)

**Context:** Phase 15 introduced a richer coverage model. Under A16, each testigo is
assigned a contiguous range of mesas (max 5 per testigo) rather than the prior
"1 testigo = 1 mesa" proxy.

**Schema delta:**
- `Testigo.mesaInicial INT?` — first mesa in assigned range
- `Testigo.mesaFinal   INT?` — last mesa in assigned range (inclusive)
- Migration: `20260522100000_add_testigo_mesa_assignment`

**Coverage formula change:**
- Pre-A16: `coberturaPct = FLOOR(SUM(MIN(testigos_per_puesto, mesas_per_puesto)) / totalMesas * 100)`
- A16: `coberturaPct = FLOOR(SUM(mesaFinal - mesaInicial + 1 WHERE mesaInicial IS NOT NULL) / totalMesas * 100)`

**Estado formula change:**
- Pre-A16: uses `CEIL(mesas × ratioMesas…)` as required threshold
- A16: `CUBIERTO` when `mesasAsignadas >= puesto.mesas`; otherwise by `nivelPrioridad` (no ratios)

**Assignment algorithm:** `AsignacionService.reassignPuesto(puestoId)` — sorts testigos
by id ASC, assigns sequential ranges of up to 5 mesas, over-capacity testigos → NULL.
Auto-runs on every testigo create/update/delete/bulkAssign.

**New endpoints:**
- `POST /api/asignacion/recalcular/:puestoId` — manual recalculation
- `GET  /api/asignacion/puesto/:puestoId/pdf` — PDF assignment sheet (pdfkit)

**Backfill:** `backend/scripts/local/backfill-mesa-assignments.ts` — run once after
migration deploy to populate existing testigos.

See `docs/COVERAGE_FORMULA.md` for the full formula specification.

---

### Amendment A17 — Manual deploys only (2026-05-22)

**Context:** Cloud Build has no automatic trigger configured from the GitHub `main`
branch. A second contributor (`restrepovfelipe`) commits to the repo. Without a manual
gate, unreviewed cross-contributor changes could ship silently.

**Decision:** Deploys to Cloud Run are always manual. Before running
`gcloud builds submit`, the deployer must verify:

1. **Commit audit** — `git log --pretty=format:"%h %an %s" <last-deploy-sha>..origin/main -- backend/`  
   Classify every commit: A-related (expected), other-author (flag for owner), or mixed.
   Any unreviewed commit from another contributor → STOP.

2. **Migration safety** — `pnpm exec prisma migrate status` (with `DIRECT_DATABASE_URL` set).  
   Must read "Database schema is up to date" OR show only migrations the deployer authored.
   Any pending destructive migration by another author → STOP.

3. **Field alias preservation** — for any backend response field renamed in this deploy,
   the old key must remain as a deprecated alias until the frontend is updated.
   Confirm no frontend break before proceeding.

4. **Build verification** — build the Docker image locally or via Cloud Build dry-run
   before routing traffic. Confirm clean build log.

**Last deployed revision:** `backend-00022-grd` (commit `da6f2a9`,
deployed 2026-05-22T21:11 UTC). A16 commits (`f46b101`…`cc99357`) are on `origin/main`
but not yet deployed as of 2026-05-22T22:00 UTC.

**Rationale:** no automatic triggers exist; Cloud Build must be submitted manually via
`gcloud builds submit --project=coordinacion-electoral`. The project owner retains the
deploy gate.

---

### Amendment A20 — GET endpoints for Abogados, Refrigerios, Comparendos (2026-05-23)

**Context:** Phase 16 frontend (branch `phase-16-rewrite`) shipped write-forward UI for
these three resources under Amendment A19, which deferred the backend GET endpoints to
Phase 17. During Phase 16 pre-cutover review, the owner flagged A19 as a D-day blocker:
coordinators would lose visibility of records they entered whenever the browser reloaded,
producing UX indistinguishable from data loss. A20 is the approved exception to the
Phase 16 "NO BACKEND CHANGES" constraint.

**Scope (strict — no other backend files modified):**
- `AbogadosService.findByMunicipio(municipioId, user)` — query by `municipioId`, scope-guard via `PermissionsService.canAccess(user, MUNICIPIO, municipioId)`
- `AbogadosController`: add `GET /municipios/:municipioId/abogados` with `@UseGuards(ScopeGuard)` + `@RequireScope(ScopeType.MUNICIPIO, 'municipioId')`
- `RefrigeriosService.findByPuesto(puestoId, user)` — query by `scopeType=PUESTO, scopeId=puestoId`, scope-guard via `canAccess(user, PUESTO, puestoId)`
- `RefrigeriosController`: add `GET /refrigerios?puestoId=<id>` (scope check in service)
- `ComparendosService.findByComuna(comunaId, user)` — query by `scopeType=COMUNA, scopeId=comunaId`, scope-guard via `canAccess(user, COMUNA, comunaId)`; PUESTO_COORDINATOR fallback: `canAccess` already returns true if they have a puesto in that comuna
- `ComparendosController`: add `GET /comparendos?comunaId=<id>` (scope check in service)

**No schema change.** No migration. Read-only additions to existing controllers/services.

**Test coverage added:**
- `backend/src/resources/abogados/abogados.spec.ts` — unit tests: happy path, empty result, ForbiddenException
- `backend/src/resources/refrigerios/refrigerios.spec.ts` — same
- `backend/src/resources/comparendos/comparendos.spec.ts` — same, including PUESTO_COORDINATOR scope fallback

**Frontend follow-up (branch `phase-16-rewrite`, PART C):**
- Replace `useState` with `useQuery` in all three features
- Remove A19 banners
- Contract tests A-7, A-8, A-9 added

**Deploy:** manual via `gcloud builds submit` per Amendment A17 ritual.
After deploy, backend revision name recorded in CUTOVER_DECISION.md.
