# RUNBOOK — Día D Electoral (Coordinación Electoral AMVA 2026)

> **Audiencia:** PMU (Puesto de Mando Unificado), operadores de sala, coordinador TI.
> **Propósito:** Guía operacional para monitorear y responder a incidentes el día de
> elecciones.
> **Sistema:** frontend Vercel + NestJS en Cloud Run + Cloud SQL PostgreSQL (GCP).
> **Fecha de última revisión:** 2026-05-21

---

## 1. Acceso al Dashboard de Monitoreo

### URL del Dashboard PMU

```
https://console.cloud.google.com/monitoring/dashboards?project=coordinacion-electoral
```

Buscar el dashboard "PMU Electoral Day D Dashboard". Bookmarkear la URL directa del
dashboard una vez abierto.

### Quién tiene acceso

| Persona | Correo | Rol GCP |
|---------|--------|---------|
| Propietario | jdmg206@gmail.com | Owner |

Para agregar acceso: **IAM & Admin → Agregar miembro → Rol: Monitoring Viewer**.

### URLs de acceso rápido

| Recurso | URL |
|---------|-----|
| Dashboard PMU | https://console.cloud.google.com/monitoring/dashboards?project=coordinacion-electoral |
| Alertas activas | https://console.cloud.google.com/monitoring/alerting?project=coordinacion-electoral |
| Uptime checks | https://console.cloud.google.com/monitoring/uptime?project=coordinacion-electoral |
| Cloud Run logs | https://console.cloud.google.com/run/detail/us-central1/backend/logs?project=coordinacion-electoral |
| Cloud SQL | https://console.cloud.google.com/sql/instances/defensores-pg/overview?project=coordinacion-electoral |
| Frontend (Vercel) | https://coordinacion-electoral.vercel.app |
| Backend healthz | https://backend-210392280319.us-central1.run.app/api/healthz |

---

## 2. Qué mide cada métrica

### Fila 1 — Números grandes (estado inmediato)

| Widget | Métrica | Qué significa |
|--------|---------|--------------|
| SSE Active Connections | `custom.googleapis.com/electoral/sse_active_connections` | Coordinadores/testigos con sesión activa. Esperado día D: 5-20. |
| Requests últimos 5 min | `run.googleapis.com/request_count` | Requests HTTP totales al backend. |
| Tasa de errores 5xx | Idem filtrado `response_code_class=5xx` | Errors de servidor. En operación normal: 0. |

### Fila 2 — Cloud SQL

| Widget | Métrica | Umbral crítico |
|--------|---------|---------------|
| Conexiones activas | `cloudsql.googleapis.com/database/network/connections` | > 20 = alerta CRÍTICA (max db-g1-small ≈ 25) |
| CPU utilización | `cloudsql.googleapis.com/database/cpu/utilization` | > 80% sostenido = problema |
| Almacenamiento | `cloudsql.googleapis.com/database/disk/bytes_used` | Informativo |

### Fila 3 — Cloud Run

| Widget | Métrica | Umbral |
|--------|---------|--------|
| Instancias activas | `run.googleapis.com/container/instance_count` | > 4 = advertencia (max=5) |
| Latencia p50/p95/p99 | `run.googleapis.com/request_latencies` | p95 > 2000 ms = alerta |

### Fila 4 — Por rol / recurso (actividad coordinadores)

| Widget | Métrica | Qué ver |
|--------|---------|---------|
| Requests por rol | `custom.googleapis.com/electoral/api_requests_by_role` | Qué roles están activos |
| Pool DB activo | `custom.googleapis.com/electoral/db_pool_size` | Requests in-flight concurrentes |
| Mutaciones por recurso | `custom.googleapis.com/electoral/mutation_count_by_resource` | testigos/abogados/etc. escritos |
| Uptime | `monitoring.googleapis.com/uptime_check/check_passed` | 1.0 = OK, < 1 = outage |

---

## 3. Interpretación de Alertas

### CRÍTICA: Backend error rate > 5% (2 min)

**Dispara cuando:** más del 5% de requests devuelven 5xx durante 2 minutos continuos.

**Qué hacer:**
1. Ver logs: `gcloud run services logs tail backend --project=coordinacion-electoral`
2. Buscar `ERROR` o stack traces.
3. Verificar que la BD responde: `curl https://backend-210392280319.us-central1.run.app/api/healthz`
4. Si la BD está caída: ver §5 (escalado Cloud SQL).
5. Si es un bug en código nuevo: hacer rollback — ver §6.

---

### CRÍTICA: Cloud SQL connections > 20

**Dispara cuando:** la BD tiene más de 20 conexiones simultáneas (80% del máximo).

**Qué hacer:**
1. Verificar cuántas instancias de Cloud Run hay activas (widget "Instancias activas").
2. Verificar si hay queries lentas:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
     AND state != 'idle';
   ```
   Para ejecutar: usar Cloud SQL Studio en la consola GCP o Cloud SQL Auth Proxy.
3. Si hay queries colgadas, terminarlas:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle in transaction' AND query_start < now() - interval '2 minutes';
   ```
4. Si el pool está saturado por carga legítima: escalar Cloud SQL — ver §5.

---

### CRÍTICA: Backend healthz check failing

**Dispara cuando:** el endpoint `/api/healthz` no responde desde alguna región.

**Qué hacer:**
1. Verificar manualmente:
   ```bash
   curl -v https://backend-210392280319.us-central1.run.app/api/healthz
   ```
2. Verificar estado Cloud Run:
   ```bash
   gcloud run services describe backend --region=us-central1 --project=coordinacion-electoral
   ```
3. Si Cloud Run no tiene instancias activas, escalar:
   ```bash
   gcloud run services update backend \
     --min-instances=1 \
     --region=us-central1 \
     --project=coordinacion-electoral
   ```

---

### CRÍTICA: 5xx spike > 10 por minuto

**Dispara cuando:** se detectan más de 10 errores de servidor en 60 segundos.

**Qué hacer:**
1. Ver logs en tiempo real:
   ```bash
   gcloud run services logs tail backend --project=coordinacion-electoral --region=us-central1
   ```
2. Si el error es de BD (connection refused, timeout): ir a §5.
3. Si el error es 500 de aplicación: revisar logs para el stack trace específico.

---

### WARNING: Backend latency p95 > 2s (2 min)

**Dispara cuando:** el 95% de requests tarda más de 2 segundos durante 2 minutos.

**Qué hacer:**
1. Verificar conexiones Cloud SQL (¿está llegando al límite?).
2. Verificar instancias Cloud Run (¿hay cold starts?).
3. Si es por carga: el sistema escala automáticamente hasta 5 instancias.
4. Si no mejora en 5 min: escalar Cloud SQL — ver §5.

---

### WARNING: Cloud Run at max instances (5 min)

**Dispara cuando:** Cloud Run tiene 5 instancias activas durante 5 minutos continuos.

**Qué hacer:**
1. Verificar tráfico total (¿es carga legítima del día D?).
2. Si es tráfico legítimo, considerar aumentar el máximo:
   ```bash
   gcloud run services update backend \
     --max-instances=10 \
     --region=us-central1 \
     --project=coordinacion-electoral
   ```
3. Monitorear que Cloud SQL no se sature con más instancias (cada instancia usa conexiones BD).

---

## 4. Ver logs en tiempo real

### Logs del backend (Cloud Run)

```bash
# Streaming de logs (requiere gcloud autenticado)
gcloud run services logs tail backend \
  --project=coordinacion-electoral \
  --region=us-central1

# Logs de los últimos 10 minutos
gcloud run services logs read backend \
  --project=coordinacion-electoral \
  --region=us-central1 \
  --limit=100

# Filtrar solo errores
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="backend" AND severity>=ERROR' \
  --project=coordinacion-electoral \
  --limit=50 \
  --format='value(textPayload, jsonPayload.message)'
```

### Desde Cloud Console

URL directa: https://console.cloud.google.com/run/detail/us-central1/backend/logs?project=coordinacion-electoral

---

## 5. Escalar Cloud SQL si la BD se satura

> **ADVERTENCIA:** Cambiar el tier de Cloud SQL requiere un reinicio (~2 min downtime).
> Solo ejecutar si la situación lo amerita (conexiones al límite + latencia alta + queries lentas).

### Paso 1 — Verificar estado actual

```bash
gcloud sql instances describe defensores-pg --project=coordinacion-electoral
# Buscar: tier, state, settings.ipConfiguration.maxConnections
```

### Paso 2 — Aumentar tier (de db-g1-small a db-f1-micro o db-n1-standard-1)

```bash
# ADVERTENCIA: requiere reinicio (~2 min de downtime)
gcloud sql instances patch defensores-pg \
  --tier=db-n1-standard-1 \
  --project=coordinacion-electoral
```

Tiers disponibles y sus límites de conexión:
- `db-g1-small`: 25 max conexiones (actual)
- `db-f1-micro`: 25 max conexiones (más RAM)
- `db-n1-standard-1`: 4000 max conexiones (~$50/mes)

### Paso 3 — Verificar recuperación

```bash
# Esperar ~3 min y verificar
curl https://backend-210392280319.us-central1.run.app/api/healthz
```

---

## 6. Rollback de imagen de Cloud Run

Si un despliegue reciente rompió algo:

```bash
# Ver revisiones disponibles
gcloud run revisions list \
  --service=backend \
  --region=us-central1 \
  --project=coordinacion-electoral

# Hacer rollback a una revisión anterior (por ejemplo backend-00004-abc)
gcloud run services update-traffic backend \
  --to-revisions=backend-00004-abc=100 \
  --region=us-central1 \
  --project=coordinacion-electoral
```

---

## 7. Queries de diagnóstico (Cloud SQL)

Para ejecutar: usar **Cloud SQL Studio** en la consola GCP, o conectarse via Cloud SQL Auth Proxy:

```bash
# Iniciar proxy local
./cloud-sql-proxy coordinacion-electoral:us-central1:defensores-pg &
psql -h localhost -U app_user -d defensores
```

### Queries útiles

```sql
-- Actividad actual de la BD
SELECT pid, usename, application_name, state, query_start,
       now() - query_start AS duration, left(query, 100) AS query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Conteo de conexiones por estado
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Testigos registrados hoy
SELECT count(*) FROM "Testigo" WHERE "createdAt" > CURRENT_DATE;

-- Testigos con puesto asignado vs sin asignar
SELECT
  COUNT(*) FILTER (WHERE "puestoId" IS NOT NULL) AS con_puesto,
  COUNT(*) FILTER (WHERE "puestoId" IS NULL) AS sin_puesto,
  COUNT(*) AS total
FROM "Testigo";

-- Última actividad de audit por usuario
SELECT u.username, a.action, a."createdAt"
FROM "AuditLog" a
JOIN "User" u ON a."actorUserId" = u.id
ORDER BY a."createdAt" DESC
LIMIT 20;

-- Locks activos
SELECT pg_stat_activity.pid, pg_class.relname, pg_locks.mode,
       now() - pg_stat_activity.query_start AS duration
FROM pg_locks
JOIN pg_class ON pg_locks.relation = pg_class.oid
JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE pg_locks.granted = false
ORDER BY duration DESC;
```

---

## 8. Contactos y escalación

| Rol | Responsabilidad | Contacto |
|-----|----------------|---------|
| Propietario del sistema | Decisiones de infraestructura, rollback | jdmg206@gmail.com |
| Coordinador TI | Operación día D, monitoreo dashboard | — |
| Soporte GCP | Incidentes de plataforma GCP | https://cloud.google.com/support |

### Escalación

1. **Alerta dispara** → verificar dashboard → 2 min
2. **Si no se resuelve solo** → aplicar remediación de §3 → 5 min
3. **Si persiste** → contactar propietario del sistema
4. **Incidente de plataforma GCP** → verificar https://status.cloud.google.com

---

## 9. Checklist Día D (ejecutar antes de apertura de urnas)

```
[ ] Dashboard PMU abierto en pantalla de sala
[ ] Alertas activas: 0 en estado FIRING
[ ] Uptime check: 100% (verde)
[ ] /api/healthz responde con {"status":"ok"}
[ ] Cloud Run: 1 instancia activa (min-instances=1 configurado)
[ ] Cloud SQL: RUNNABLE, < 5 conexiones activas (en reposo)
[ ] Último deploy verificado (no hay deploy en progreso)
[ ] Correo jdmg206@gmail.com configurado como canal de notificación
[ ] Acceso a GCP Console verificado
```

---

## 10. Información de infraestructura

| Componente | Detalles |
|-----------|---------|
| Cloud Run service | `backend` — `us-central1` — max 5 instancias — min 1 |
| Cloud Run URL | `https://backend-210392280319.us-central1.run.app` |
| Cloud SQL | `defensores-pg` — PostgreSQL 16 — `db-g1-small` — `us-central1` |
| Artifact Registry | `us-central1-docker.pkg.dev/coordinacion-electoral/defensores` |
| Service Account | `app-backend@coordinacion-electoral.iam.gserviceaccount.com` |
| Frontend | `https://coordinacion-electoral.vercel.app` (auto-deploy en push a main) |
