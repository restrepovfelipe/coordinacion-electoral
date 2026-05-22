# AUDIT_PHASE_15.md

## Coordinación Electoral — Frontend JS Diagnostic Audit
**Date:** 2026-05-22 | **Scope:** Vanilla JS frontend, all files in `js/` + `index.html`

---

## SECTION A — All fetch/XHR calls in frontend JS files

### Summary
The frontend uses a centralized `ApiClient` class (in `api.js`) that wraps all HTTP calls. There are **no raw `fetch()` calls**; all communication goes through the `api` object with methods: `get()`, `post()`, `patch()`, `delete()`.

**Base API:** `https://backend-210392280319.us-central1.run.app/api`

### All Endpoints Called

| File | Line | Endpoint | Method | Used By | ETag Cache? | SSE Tag? |
|------|------|----------|--------|---------|------------|----------|
| auth.js | 51 | `/auth/me` | GET | `doLogin()` | No | No |
| auth.js | 119 | `/auth/password-changed` | POST | `doChangePassword()` | No | No |
| auth.js | 172 | `/auth/logout` | POST | `doLogout()` | No | No |
| auth.js | 187 | `/auth/me` | GET | `onAuthStateChanged()` | No | No |
| app.js | 31 | `/municipios` | GET | `_buildMuniIdMap()` | Yes (ref cache) | No |
| app.js | 46 | `/dashboard/testigos-counts` | GET | `getTestigoCounts()` | Yes (explicit) | Yes (`testigo:count_changed`) |
| app.js | 80 | `/dashboard/stats` | GET | `getDashboardStats()` | Yes (explicit) | Yes (`prioridad:config_changed` triggers refresh) |
| app.js | 117 | `/municipios` | GET | `loadPuestoIds()` | Yes (ref cache) | No |
| app.js | 122 | `/puestos?municipioId={id}` | GET | `loadPuestoIds()` | Yes (ref cache) | No |
| app.js | 215 | `/dashboard/prioridad/puestos` | GET | `getPrioridadPuestos()` | No | No |
| app.js | 224 | `/dashboard/prioridad/mapa` | GET | `getPrioridadMapa()` | No | No |
| app.js | 232 | `/admin/prioridad/config` | GET | `getPrioridadConfig()` | No | No |
| app.js | 239 | `/admin/prioridad/config` | PATCH | `updatePrioridadConfig()` | No | Yes (triggers `prioridad:config_changed`) |
| app.js | 713 | `/puestos/{id}/testigos` | GET | `loadTestigosForComune()` | No | No |
| app.js | 811 | `/puestos/{id}/testigos` | POST | `addTestigo()` | No | Yes (reflected in count) |
| app.js | 837 | `/testigos/{id}` | PATCH | `updateTestigo()` | No | Yes (reflected in count) |
| app.js | 847 | `/testigos/{id}` | DELETE | `delTestigo()` | No | Yes (reflected in count) |
| app.js | 1458 | `/abogados/{id}` | PATCH | `saveAbogado()` | No | No |
| app.js | 1464 | `/municipios/{id}/abogados` | POST | `saveAbogado()` | No | No |
| app.js | 1522 | `/refrigerios/{id}` | PATCH | `saveRefrig()` | No | No |
| app.js | 1526 | `/refrigerios` | POST | `saveRefrig()` | No | No |
| app.js | 1605 | `/comparendos` | POST | `addComparendo()` | No | No |
| app.js | 1636 | `/comparendos/{id}` | PATCH | `saveComparendos()` | No | No |
| prioridad.js | 29 | `/municipios` | GET | `_getMuniId()` | Yes (ref cache) | No |
| profile-widget.js | 87 | `/users/me` | PATCH | `_saveProfile()` | No | No |
| users-admin.js | 75 | `/users` | GET | `loadUsersPage()` | No | No |
| users-admin.js | 138 | `/users/{id}` | DELETE | User deactivation | No | No |
| users-admin.js | 166 | `/users` | POST | `handleCreateUser()` | No | No |

### ETag Caching Implementation

**Reference data caching** (stale-while-revalidate pattern in `api.js`):
- **Paths eligible:** `/subregiones`, `/municipios`, `/comunas`, `/zonas`, `/puestos`
- **Headers:** `If-None-Match` (request), `ETag` (response)
- **Logic:** Return cached data immediately; revalidate in background. 304 = no update.
- **Storage:** `localStorage[ref_cache:{uid}:{path}]` containing `{etag, data}`

**Explicit caching:**
- `/dashboard/testigos-counts`: Cache key `cache:testigo-counts`, uses ETag, manual revalidate
- `/dashboard/stats`: Cache key `cache:dashboard-stats`, uses ETag, manual revalidate

### SSE Invalidation Tags

**Found in:** `sync.js` handler `handleRealtimeEvent(event)`
- `event.type === 'testigo:count_changed'` → debounced refresh of testigos-counts + dashboard-stats
- `event.type === 'prioridad:config_changed'` → debounced refresh of dashboard-stats (300ms debounce)

---

## SECTION B — Legacy / obsolete endpoints

### Analysis

Searched frontend code for all referenced endpoints. **No references to obsolete patterns found.** All endpoints follow current backend structure.

### Endpoints by Status

| Endpoint Pattern | Status | Notes |
|------------------|--------|-------|
| `/auth/**` | LIKELY_OK | Auth flow (login, logout, password change, me) |
| `/municipios`, `/puestos`, `/comunas`, `/zonas`, `/subregiones` | LIKELY_OK | Reference data; used in multiple places |
| `/dashboard/testigos-counts` | LIKELY_OK | Testigo count display; SSE invalidation wired |
| `/dashboard/stats` | LIKELY_OK | Phase 14 coverage stats; replaces scattered local reads |
| `/dashboard/prioridad/**` | LIKELY_OK | Phase 14 new endpoints (puestos list, map data, config) |
| `/admin/prioridad/config` | LIKELY_OK | Super-admin only config; SSE invalidation on update |
| `/testigos/**` | LIKELY_OK | CRUD on testigos; scoped to puestos |
| `/abogados/**`, `/refrigerios`, `/comparendos` | LIKELY_OK | Operational data; proper POST/PATCH pattern |
| `/users/**` | LIKELY_OK | User management (admin only) |

**Conclusion:** No obsolete endpoints detected.

---

## SECTION C — Coverage % computations

### Summary

Coverage percentage is computed/displayed in two ways: local frontend computation and backend-provided `coberturaPct` field.

### Local Frontend Computations

| File | Line | Formula | Numerator | Denominator | Context |
|------|------|---------|-----------|-------------|---------|
| app.js | 303 | `Math.round(testReg / totMesas * 100)` | testigos registered | total mesas in commune | Commune drill-down |
| app.js | 360 | `Math.round(testReg / totMesas * 100)` | testigos reg. per puesto | mesas per puesto | Puesto detail |
| app.js | 440 | `Math.round(totTestReg / totMesas * 100)` | zone testigos sum | zone mesas sum | Zone aggregate |
| app.js | 1051 | `Math.round(rTestReg / rTotM * 100)` | region testigos sum | region mesas sum | Region aggregate |
| app.js | 1080 | `Math.round(testReg / totM * 100)` | muni testigos | muni mesas | Municipio card |
| app.js | 1669 | `Math.round(ts / p.mesas * 100)` | testigos for 1 puesto | mesas in puesto | Map popup |
| prioridad.js | 260 | `Math.min(100, Math.round(p.testigosAsignados / p.testigosRequeridos * 100))` | testigos assigned | testigos required | Prioridad list |
| prioridad.js | 272 | Same | per puesto | Backend field | Prioridad map popup |

### Backend-Provided Coverage Fields

| File | Line | Field | Source | Usage |
|------|------|-------|--------|-------|
| app.js | 105 | `s.coberturaPct` | `/dashboard/stats` | `_applyDashboardStatsToDom()` → `data-cobertura-muni` |
| app.js | 1084 | `apiStat.coberturaPct` | `_dashboardStatsByMuni[n]` | Overview card display — **prefers API over local** |
| prioridad.js | 176 | `item.coberturaPct` | `/dashboard/prioridad/puestos` | Prioridad list table |

### Display Logic (app.js:1084)

```javascript
const displayPct = apiStat !== undefined ? apiStat.coberturaPct : pct;
```

**Two parallel formula paths confirmed:**
- **Aggregate AMVA view** → uses `apiStat.coberturaPct` from `/dashboard/stats` (backend aggregate)
- **Drill-down (commune/puesto level)** → uses local computation: `testReg / totMesas * 100` from localStorage state

**This is the source of BUG #1.** The backend computes coverage via its own formula (may cap at 100 or use a different testigos-required formula). The frontend drill-down uses raw `testigos / mesas` from localStorage state — which can diverge from what the backend reports as `coberturaPct`.

---

## SECTION D — Coordinador Ciudad reads/writes

### Summary

"Coordinador" fields exist at 3 levels: **muni**, **commune/zone**, **puesto**. No `coordinadorCiudad` or `coordinadorAdHoc` field names exist in frontend code.

### All Coordinador References

| File | Line | Field | Context | Type | Persisted? |
|------|------|-------|---------|------|-----------|
| app.js | 155 | `s.coord`, `s.phone` | Muni-level state object | Read/Write | **No — localStorage only** |
| app.js | 272 | `s.coord` | Sidebar display | Read | N/A |
| app.js | 312 | `s.coord` | Muni header | Read | N/A |
| app.js | 487 | `sc.coord`, `sc.phone` | Commune state | Read | **No — localStorage only** |
| app.js | 579–580 | `ps.coord`, `ps.phone` | Puesto state | Read | N/A |
| app.js | 604 | `ps.coord` | Puesto edit input | Read/Write | **No — localStorage only** |
| app.js | 989 | `s.coord`, `s.phone` | Muni modal save | Write | **No — localStorage only** |
| app.js | 993 | `s.comunas[MCX.ck] = { coord, phone }` | Commune modal save | Write | **No — localStorage only** |
| app.js | 997 | `s.puestos[MCX.k] = { coord, phone, tag, notes }` | Puesto modal save | Write | **No — localStorage only** |
| app.js | 1002 | `s.zonas[MCX.zonaNombre] = { coord, phone }` | Zone modal save | Write | **No — localStorage only** |
| app.js | 1113 | `s.coord` | Directorio export (muni) | Read | N/A |
| app.js | 1116 | `sc.coord` | Directorio export (zone) | Read | N/A |
| app.js | 1119 | `ps.coord` | Directorio export (puesto) | Read | N/A |

### Critical Finding — No Backend Persistence

All coordinator writes call `writeMuni()` which is a **no-op** — data stays in `localStorage` key `amva26v2`. There is no `PATCH /api/municipios/{id}` or equivalent call for coordinator fields.

**This is BUG #2.** T94 will add `coordinadorAdHocNombre` / `coordinadorAdHocTelefono` columns to the Municipio table and wire up a new display/patch endpoint.

---

## SECTION E — Stale references

### Search Results

| Pattern Searched | Matches | Notes |
|-----------------|---------|-------|
| `pregoneros` | **0** | Table fully removed; no frontend references |
| `coordinadorAdHoc` | **0** | Not yet implemented (target of T94) |
| `coordinadorCiudad` | **0** | Not a current field name |
| Firestore direct calls | **0** | Firebase Auth only |

### Unusual Fields Checked

| Field | File | Status |
|-------|------|--------|
| `_backendId` | app.js | **OK** — tracks DB record ID for PATCH/DELETE |
| `_preload_version` | app.js | **OK** — migration version for localStorage data |
| `_puestoIdCache` | app.js | **OK** — performance cache for puesto IDs |
| `_muniIdToName` | app.js | **OK** — SSE event name lookup |

**Conclusion:** No stale references. Code is clean.

---

## Summary

### Key Findings

| # | Finding | Severity | T# |
|---|---------|----------|----|
| 1 | **Two parallel coverage formula paths** — AMVA aggregate uses `apiStat.coberturaPct` (backend), drill-down uses local `testReg/mesas` (localStorage) | **HIGH** — BUG #1 | T92 |
| 2 | **Coordinator data NOT persisted** — All `coord`/`phone` writes stay in localStorage; no API call | **HIGH** — BUG #2 | T94 |
| 3 | Auth flash (not visible in frontend code, but DOM init order issue) | **MEDIUM** — BUG #3 | T95 |
| 4 | No `coordinadorAdHoc` fields exist yet in frontend | INFO | T94 |
| 5 | All HTTP calls routed through `ApiClient` — good pattern | INFO | — |
| 6 | ETag caching works for reference data and dashboard stats | INFO | — |
| 7 | SSE invalidation covers testigo counts and prioridad config | INFO | — |

### Files Examined

- `js/api.js` — API client, caching, error handling
- `js/auth.js` — Login, logout, password change, session restore
- `js/app.js` — Core municipality/puesto/testigo UI (~2080 lines)
- `js/sync.js` — Sync badge, realtime event handler, no-op write stubs
- `js/prioridad.js` — Prioridad list/map, admin config UI
- `js/realtime.js` — EventSource wrapper, reconnect logic
- `js/firebase-init.js` — Firebase Auth init
- `js/users-admin.js` — Super-admin user management
- `js/profile-widget.js` — User profile edit modal
- `js/data.js` — Reference data stubs
- `index.html` — Script loads, markup
