# Adversarial Test Results

**Date:** 2026-05-21  
**Target:** `https://backend-210392280319.us-central1.run.app`  
**Revision:** backend-00005-7n7 (image `33ddad7`)

All 10 scenarios passed.

| # | Scenario | Input | Expected | Result |
|---|----------|-------|----------|--------|
| A | Unauthenticated read | `GET /api/municipios` (no token) | 401 | ✅ 401 |
| B | Unauthenticated write | `POST /api/comparendos` (no token) | 401 | ✅ 401 |
| C | Health endpoint without auth | `GET /api/healthz` (no token) | 200 | ✅ 200 |
| D | SQL injection in path param | `GET /api/municipios/1' OR 1=1` (URL-encoded) | 401/404 | ✅ 404 |
| E | XSS payload in JSON body | `POST /api/comparendos` body `{"name":"<script>alert(1)</script>"}` | 401 | ✅ 401 |
| F | Very long URL path (2000 chars) | `GET /api/aaaa…` | 401/404 | ✅ 404 |
| G | Missing Content-Type on POST | `POST /api/comparendos` raw body, no content-type | 400/401 | ✅ 401 |
| H | Wrong HTTP method on endpoint | `DELETE /api/healthz` | 404/405 | ✅ 404 |
| I | Malformed/invalid Bearer token | `GET /api/municipios` with `Authorization: Bearer not-a-valid-token` | 401 | ✅ 401 |
| J | Oversized JSON body (100 KB) | `POST /api/comparendos` with 100 KB payload | 401/413 | ✅ 401 |

## Notes

- All write endpoints (POST/PATCH/DELETE) reject unauthenticated requests before parsing the body, so oversized/malformed bodies return 401 not 413. This is the correct behavior — auth fails fast before body processing.
- SQL injection in path params reaches the route matcher which returns 404 (no matching route), never reaching the database layer.
- The `/api/healthz` endpoint is intentionally unauthenticated and performs a live `SELECT 1` against Cloud SQL, confirming DB connectivity.
- No 500 errors were triggered by any adversarial input.
