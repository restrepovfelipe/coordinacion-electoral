# POSTMORTEM — Coordinación Electoral AMVA 2026

**Fecha de cierre:** 2026-05-21  
**Alcance:** Migración completa de Firestore/Frontend-only a PostgreSQL + NestJS REST API + Cloud Run  
**Estado final:** Producción activa en `https://backend-210392280319.us-central1.run.app`

---

## Resumen ejecutivo

Se migró una aplicación de coordinación electoral de una arquitectura Firestore-only (11 endpoints de escritura directa desde el cliente) a una arquitectura de tres capas: frontend Vercel + backend NestJS en Cloud Run + Cloud SQL PostgreSQL. La migración se ejecutó en 11 enmiendas/fases sin interrumpir la operación del sistema original.

---

## Timeline de enmiendas

| Enmienda | Descripción |
|----------|-------------|
| 1 | Análisis inicial: 21 sitios de escritura Firestore identificados en `DISCOVERY.md` |
| 2 | Diseño del esquema PostgreSQL con Prisma 6 |
| 3 | NestJS bootstrap: auth con firebase-admin (sin passport), RBAC |
| 4 | Endpoints de referencia (subregiones, municipios, zonas, comunas, puestos) |
| 5 | Endpoints de recursos (testigos, abogados, refrigerios, comparendos, movilidad) |
| 6 | Decisión: Cloud Build (sin Docker local), Artifact Registry, Cloud Run |
| 7 | SSE realtime con EventSource |
| 8 | Auditoría, paginación, filtros |
| 9 | Prisma 6.x específico (pin de versión) |
| 10 | Eliminación de endpoints de movilidad del ADLE (datos de modelo no mapeado) |
| 11 | Revisión de seguridad: XSS, CORS, timeout de inactividad |

---

## Arquitectura final

```
Vercel (frontend) → Cloud Run (NestJS) → Cloud SQL (PostgreSQL 16)
                    ↑
              Secret Manager (4 secrets)
              Firebase Auth (verificación de tokens)
```

**Datos de producción al cierre:**
- 9 subregiones
- 125 municipios
- 1.282 puestos de votación
- 0 testigos (carga el día de elecciones)

---

## Problemas encontrados y resoluciones

### 1. Cloud Build SA sin permisos de Artifact Registry
El SA `210392280319-compute@developer.gserviceaccount.com` necesitaba `roles/artifactregistry.writer`.  
**Fix:** `gcloud projects add-iam-policy-binding --role=roles/artifactregistry.writer`

### 2. pnpm `ERR_PNPM_IGNORED_BUILDS`
`pnpm-workspace.yaml` tenía strings literales en vez de booleanos para `@firebase/util`, `esbuild`, `protobufjs`.  
**Fix:** Corregir valores a `true`/`false` en `allowBuilds`.

### 3. `nest build` compilando `scripts/`
Los scripts de seed/bootstrap importan `dotenv` que no está en dependencias de producción.  
**Fix:** Agregar `"scripts"` al array `exclude` de `tsconfig.build.json`.

### 4. `DATABASE_URL` vacía por BOM de UTF-8
PowerShell `[System.Text.Encoding]::UTF8` agrega BOM. El secret se creó con BOM → `gcloud secrets versions access` crasheaba con `UnicodeEncodeError`. El secret se leía como vacío.  
**Fix:** Usar `[System.Text.UTF8Encoding]::new($false)` y `--out-file` en lugar de pipe.

### 5. Prefijo doble `/api/api/...`
Los controllers usaban `@Controller('api/puestos')` y además `setGlobalPrefix('api')` en `main.ts`.  
**Fix:** Remover el prefijo `api/` de todos los controllers de recursos.

### 6. Formato de `DATABASE_URL` para Cloud SQL Unix socket
Prisma rechaza URL con host vacío (`@/database`). Requiere host explícito: `@localhost/database?host=/cloudsql/...`.

### 7. Cloud Build trigger requiere GitHub App connection
`gcloud builds triggers create github` falla sin la GitHub App instalada.  
**Fix pendiente:** Conectar en Cloud Console → Cloud Build → Triggers → Connect Repository. El archivo `backend/cloudbuild.yaml` está listo.

---

## Procedimiento de reescritura de historial git (NO ejecutar sin consenso del equipo)

> **ADVERTENCIA:** Este procedimiento destruye el historial de git permanentemente. Requiere force-push y coordinación con todos los colaboradores.

Las contraseñas `Cord1.2026*`–`Cord4.2026*` estuvieron presentes en `js/auth.js` en commits históricos antes de la migración. Si se considera que estas contraseñas son sensibles y deben eliminarse del historial público:

1. **Instalar BFG Repo Cleaner** (https://rtyley.github.io/bfg-repo-cleaner/)

2. **Crear archivo de contraseñas a eliminar** (`passwords.txt`):
   ```
   Cord1.2026*
   Cord2.2026*
   Cord3.2026*
   Cord4.2026*
   ```

3. **Ejecutar BFG** (fuera del directorio del repo):
   ```bash
   java -jar bfg.jar --replace-text passwords.txt coordinacion-electoral.git
   ```

4. **Limpiar y force-push**:
   ```bash
   cd coordinacion-electoral
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push origin --force --all
   git push origin --force --tags
   ```

5. **Notificar a todos los colaboradores** para que hagan `git clone` fresco. Los forks existentes pueden seguir teniendo el historial original.

**Evaluación de riesgo:** Las contraseñas `Cord1-4` eran credenciales de coordinadores que ya no existen en el sistema (migrado a Firebase Auth). Su exposición en el historial es baja criticidad. La decisión de ejecutar la reescritura queda a criterio del propietario del proyecto.

---

## Estado de CI/CD al cierre

| Componente | Estado |
|-----------|--------|
| Artifact Registry | ✅ `us-central1-docker.pkg.dev/coordinacion-electoral/defensores` |
| Cloud Run | ✅ `backend-00005-7n7` (imagen `33ddad7`) |
| Cloud SQL | ✅ `defensores-pg` PostgreSQL 16, 2 migraciones aplicadas |
| Vercel | ✅ Auto-deploy en push a `main` |
| Cloud Build trigger | ⚠️ `cloudbuild.yaml` listo, falta conectar GitHub App en consola |

---

## Backlog v2 (no implementado en este ciclo)

- [ ] Conectar Cloud Build trigger via GitHub App (T49.5 manual pendiente)
- [ ] Paginación en endpoints de listado (municipios, puestos)
- [ ] Notificaciones push para eventos críticos (comparendos nuevos)
- [ ] Export PDF/Excel desde el backend (actualmente solo en frontend)
- [ ] Dashboard de administración web
- [ ] Tests de integración automatizados (actualmente solo adversariales manuales)
- [ ] Rotación automática de secretos en Secret Manager
- [ ] Cloud Armor WAF delante de Cloud Run
- [ ] Backup automático de Cloud SQL a GCS

---

## Limitaciones conocidas al cierre

1. **Sin paginación**: `GET /api/puestos` devuelve los 1.282 registros en una sola respuesta. Aceptable para el volumen actual.
2. **CORS fijo**: `CORS_ORIGINS` debe actualizarse manualmente si el dominio de Vercel cambia.
3. **Cold start**: con `min-instances=1`, no hay cold start en producción. Si se reduce a 0 fuera de temporada, el primer request tarda ~3-5 segundos.
4. **Reescritura de historial pendiente**: ver sección anterior.
5. **Cloud Build trigger manual**: requiere conexión de GitHub App en GCP Console.

---

## Métricas del proyecto

| Métrica | Valor |
|---------|-------|
| Commits en esta migración | ~20 |
| Archivos backend modificados | ~40 |
| Endpoints REST implementados | ~30 |
| Tests adversariales pasados | 10/10 |
| Vulnerabilidades pnpm audit HIGH/CRITICAL | 0 |
| Tiempo desde primer commit hasta prod | — |

---

## Phase 16 backlog

Items explicitly deferred from Phase 15 (Issue B Decision D3):

### Movilidad persistence

**Current state:** Movilidad data (responsables, motos/carros counts, motos_nec/carros_nec) is saved exclusively in localStorage under key `amva26v2`. A warning banner is shown in the UI.

**Phase 16 work required:**
- New DB tables: `Movilidad` (per-commune movilidad config with needs/requirements) and `MovilidadResponsable` (individual responsible person with nombre, telefono, motos, carros counts)
- Prisma migration + seed
- `MovilidadService` with CRUD endpoints: `GET /api/municipios/:id/movilidad`, `PATCH /api/movilidad/:communeId`, `POST/DELETE /api/movilidad/:communeId/responsables/:id`
- In-browser data migration script: read existing localStorage state, POST to backend, mark as migrated
- Remove movilidad callers of `writeMuni()` (3 sites: addResp@app.js, delResp@app.js, saveMovAll@app.js)
- Remove `writeMuni()` function entirely once movilidad migrated (Phase 16 cleanup)
- Remove movilidad warning banner from `renderMovPanel()`
