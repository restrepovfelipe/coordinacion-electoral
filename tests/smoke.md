# Smoke Test Checklist — Coordinación Electoral 2026

## Pre-conditions
- Backend is deployed and running (Cloud Run)
- Database has been seeded with municipalities, puestos, and one SUPER_ADMIN user
- Firebase CIP is configured with the correct project

## 1. Authentication

- [ ] Login page loads at root URL with title "Coordinación Electoral — Defensores de la Patria 2026"
- [ ] Logging in with invalid credentials shows "Usuario o contraseña incorrectos"
- [ ] Logging in with valid credentials redirects to the main app view
- [ ] After login, the user's name/role is visible in the top-right user badge
- [ ] First-time login with a temporary password shows the "Cambio de contraseña requerido" modal
- [ ] Password change works: entering matching passwords ≥8 chars succeeds
- [ ] After password change, user proceeds to main app
- [ ] Clicking "Salir" in the user badge signs out and returns to login screen
- [ ] After 30 minutes of inactivity, the user is automatically logged out

## 2. Scope sidebar

- [ ] The sidebar shows municipalities grouped by region under "Municipios"
- [ ] Search box ("Buscar...") filters the municipality list in real time
- [ ] Clicking a municipality opens its detail view in the main content area
- [ ] The "← Inicio" back button returns to the overview (Centro de Comando Antioquia)
- [ ] SUPER_ADMIN sees all municipalities

## 3. Resource creation (Testigos)

- [ ] Navigate to a municipality → open a puesto card
- [ ] Click "Agregar testigo" button
- [ ] A new testigo row appears in the local UI
- [ ] Local changes are saved to localStorage (refresh page → data persists)

## 4. REST API (test via browser DevTools Network tab)

- [ ] `GET /api/auth/me` returns 200 with user data (no `cipUid` field)
- [ ] `GET /api/subregiones` returns 200 with array
- [ ] `GET /api/municipios` returns 200 with array
- [ ] `GET /api/puestos?municipioId=1` returns 200 with array
- [ ] `POST /api/puestos/1/testigos` with a valid body returns 201
- [ ] `GET /api/users` returns 403 when not SUPER_ADMIN

## 5. User management (SUPER_ADMIN only)

- [ ] "👥 Usuarios" button is visible for SUPER_ADMIN, hidden for other roles
- [ ] Clicking "👥 Usuarios" opens the user management panel
- [ ] User list loads and shows pagination
- [ ] Creating a user with username, displayName, and role succeeds (201)
- [ ] Creating a user with missing fields shows a validation error
- [ ] Deactivating a user shows confirmation dialog and succeeds

## 6. Swagger / API docs

- [ ] `/api/docs` loads in non-production environment
- [ ] All API groups visible: auth, users, testigos, abogados, movilidad, refrigerios, comparendos, reference, realtime
- [ ] Bearer auth works in Swagger UI

## 7. Real-time SSE

- [ ] `GET /api/events?token=<idToken>` returns 200 with `text/event-stream` content-type
- [ ] Connection stays open and sends heartbeat every ~25 seconds
- [ ] After a testigo is added via REST API, the SSE stream emits an event

## 8. Security checks

- [ ] `GET /api/users` without Authorization header returns 401
- [ ] `GET /api/events` without Authorization token returns 401
- [ ] `PATCH /api/testigos/:id` with wrong userId returns 403
- [ ] No `cipUid` visible in any API response
- [ ] No passwords or tokens appear in browser console logs
- [ ] `/api/docs` returns 404 in production environment (NODE_ENV=production)

## 9. Error scenarios

- [ ] Invalid JWT token returns 401
- [ ] Expired/inactive user session returns 401
- [ ] `PATCH` with stale `If-Match` header returns 412

## Sign-off

- [ ] All P0 items (sections 1-4) passing
- [ ] No HIGH/CRITICAL security audit findings (`pnpm audit --audit-level=high` in backend/)
- [ ] TypeScript compiles clean (`npx tsc --noEmit` in backend/)

**Tested by:** _______________  
**Date:** _______________  
**Environment:** _______________
