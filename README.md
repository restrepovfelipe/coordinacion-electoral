# Coordinación Electoral AMVA 2026

Herramienta de coordinación electoral para los 9 subregiones y 125 municipios del Área Metropolitana del Valle de Aburrá (AMVA). Gestiona coordinadores, testigos electorales, abogados, comparendos y recursos de movilidad por puesto de votación, con autenticación por identidad y sincronización en tiempo real.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Vercel)                                           │
│  coordinacion-electoral.vercel.app                         │
│  HTML/CSS/JS vanilla — sin bundler                         │
│  Firebase Auth SDK (email/password)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS + Bearer token
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  Cloud Run (us-central1)                                    │
│  backend-210392280319.us-central1.run.app                   │
│  NestJS 11 · Node 24 · TypeScript strict                   │
│  Prisma 6 ORM                                              │
│  min-instances: 1  max-instances: 5                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ Unix socket / Cloud SQL Auth Proxy
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  Cloud SQL (us-central1)                                    │
│  defensores-pg — PostgreSQL 16                             │
│  Instance: coordinacion-electoral:us-central1:defensores-pg │
└─────────────────────────────────────────────────────────────┘

Secrets: Google Cloud Secret Manager
  DATABASE_URL, CIP_WEB_API_KEY, DB_APP_USER_PASSWORD,
  BOOTSTRAP_SUPER_ADMINS_JSON

Auth: Firebase Authentication (project: coordinacion-electoral)
      Backend verifies tokens with firebase-admin (no passport)

CI/CD: Cloud Build (cloudbuild.yaml) → Artifact Registry → Cloud Run
       Vercel auto-deploys on push to main (frontend)
```

## URLs de producción

| Servicio | URL |
|---------|-----|
| Frontend | https://coordinacion-electoral.vercel.app |
| Backend API | https://backend-210392280319.us-central1.run.app |
| Health | https://backend-210392280319.us-central1.run.app/api/healthz |

## Desarrollo local

### Frontend

```bash
# Desde la raíz del repo
npx serve . -p 5500
# Abre http://localhost:5500
```

El `API_BASE` en `js/api.js` apunta al backend de producción en Cloud Run. Para desarrollo local del backend, cámbialo temporalmente a `http://localhost:3000/api`.

### Backend

```bash
cd backend
cp .env.local.example .env.local   # completar DATABASE_URL local
pnpm install
pnpm start:dev
```

Para conectar a Cloud SQL desde local: usar el proxy incluido en `scripts/local/`.

```bash
./scripts/local/cloud-sql-proxy.exe coordinacion-electoral:us-central1:defensores-pg --port=5432
```

## Cómo agregar usuarios

Los usuarios se crean vía la API de admin. Se requiere un token de SUPER_ADMIN.

```bash
# POST /api/users
curl -X POST https://backend-210392280319.us-central1.run.app/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuevo@ejemplo.com",
    "password": "TempPass.2026!",
    "displayName": "Nombre Coordinador",
    "role": "MUNICIPAL_COORDINATOR",
    "mustChangePassword": true
  }'
```

El usuario recibirá credenciales temporales y deberá cambiar su contraseña en el primer login.

## Runbook — Día D (Elecciones)

### Antes (06:00)

1. Verificar health: `curl https://backend-210392280319.us-central1.run.app/api/healthz` → debe responder `{"status":"ok"}`
2. Verificar instancias mínimas de Cloud Run: en GCP Console → Cloud Run → `backend` → min-instances debe ser ≥ 1
3. Verificar Cloud SQL está activo: GCP Console → Cloud SQL → `defensores-pg` → estado `RUNNABLE`

### Durante (06:00–20:00)

- **Si el backend no responde**: revisar Cloud Run logs en GCP Console → Cloud Run → backend → Logs
- **Si Cloud SQL responde lento**: revisar métricas en Cloud SQL → defensores-pg → Monitoring
- **Si se necesita reiniciar**: GCP Console → Cloud Run → backend → Edit & Deploy New Revision (sin cambios fuerza restart)

### Después (20:00)

- Exportar datos si es necesario antes de pausar la instancia
- Reducir min-instances a 0 si se quiere ahorrar costos (el backend tardará ~5s en el primer request)

## Cómo pausar/reanudar Cloud SQL

Cloud SQL cobra por instancia activa. Fuera del período electoral se puede pausar para reducir costos.

### Pausar (ahorra ~$50/mes)

```bash
gcloud sql instances patch defensores-pg \
  --activation-policy=NEVER \
  --project=coordinacion-electoral
```

**Advertencia**: al pausar, Cloud Run no puede conectar a la base de datos. El health check fallará.

### Reanudar

```bash
gcloud sql instances patch defensores-pg \
  --activation-policy=ALWAYS \
  --project=coordinacion-electoral
```

Esperar ~1 minuto para que la instancia esté disponible.

## Estructura del repositorio

```
/index.html              → Página principal
/css/styles.css          → Estilos
/js/
  api.js                 → ApiClient REST con Bearer token
  auth.js                → Firebase Auth (email/password), inactividad 1h
  app.js                 → Lógica de UI, estado local, handlers
  data.js                → Datos estáticos (subregiones, municipios seed)
  firebase-init.js       → Inicialización Firebase SDK
/backend/
  src/                   → NestJS: auth, users, resources, health, realtime
  prisma/                → Schema PostgreSQL, migraciones
  scripts/
    bootstrap/           → Script de arranque (super-admin inicial)
    seed/                → Scripts de carga inicial de datos
    local/               → Cloud SQL Proxy para desarrollo local
  cloudbuild.yaml        → Pipeline CI/CD para Cloud Build
/tests/
  adversarial.md         → Resultados de pruebas adversariales
/POSTMORTEM.md           → Retrospectiva del proyecto
/DISCOVERY.md            → Análisis de la arquitectura original Firestore
```

## Seguridad

- Autenticación: Firebase Authentication (email/password) — tokens verificados en el backend con `firebase-admin.auth().verifyIdToken()`
- Autorización: RBAC por roles (SUPER_ADMIN, REGIONAL_COORDINATOR, MUNICIPAL_COORDINATOR, ZONE_COORDINATOR, COMUNA_COORDINATOR, PUESTO_COORDINATOR)
- Secrets: ninguna credencial en código fuente — todas en GCP Secret Manager
- CORS: solo permite `https://coordinacion-electoral.vercel.app` en producción
- Rate limiting: ThrottlerModule (10 req/min por IP)
- Validación: class-validator con `whitelist: true` en todos los endpoints
