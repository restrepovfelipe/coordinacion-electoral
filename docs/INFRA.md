# Infrastructure Reference — Coordinación Electoral 2026

**Last updated:** 2026-05-21

---

## Architecture Overview

```
Browser → Vercel (frontend) → Cloud Run (backend + PgBouncer sidecar) → Cloud SQL (PostgreSQL)
                                      ↑
                         Firebase Auth (ID token validation)
```

| Component | Details |
|-----------|---------|
| Frontend | Vercel, auto-deploy on push to `main` |
| Backend | Cloud Run `backend`, `us-central1` |
| Database | Cloud SQL `defensores-pg`, PostgreSQL 16, `db-g1-small` |
| Connection pool | PgBouncer sidecar inside the backend container |
| Auth | Firebase Auth + custom NestJS `AuthGuard` |

---

## PgBouncer Connection Pool — HARD CEILING

PgBouncer runs as a **sidecar process** inside the backend Cloud Run container.
It listens on `localhost:5432` and proxies to Cloud SQL via Unix socket.

### Pool parameters (entrypoint.sh)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `pool_mode` | `transaction` | Connection released after each transaction; supports high concurrency |
| `default_pool_size` | **5** | Real DB connections per Cloud Run instance |
| `min_pool_size` | 2 | Keep at least 2 open when idle |
| `reserve_pool_size` | 2 | Emergency connections for bursts |
| `max_client_conn` | 100 | Logical client connections (in-memory, cheap) |
| `server_lifetime` | 3600 s | Max age of a server connection |
| `server_idle_timeout` | 600 s | Close idle server connections after 10 min |

### Scaling math

```
Real DB connections = pool_size × max Cloud Run instances
                    = 5 × 5
                    = 25 ≤ Cloud SQL db-g1-small max (~25)
```

**Cloud Run `--max-instances=5` is a HARD CEILING tied to this pool config.**
Do NOT increase `max-instances` without adjusting `pool_size` first.

### Formula for future tier changes

```
pool_size = floor((cloudsql_max_connections - 5 reserved) / max_run_instances)
```

Examples:
- `db-g1-small` (25 max) with 5 instances → `floor((25-5)/5) = 4` (conservative) or `5` (current)
- `db-n1-standard-1` (4000 max) with 5 instances → `floor((4000-5)/5) = 799` (plenty)

If the Cloud SQL tier is upgraded, update `pool_size` in `backend/entrypoint.sh` and redeploy.

### Connection routing

| Client | Route | Why |
|--------|-------|-----|
| Prisma (ORM queries) | `DATABASE_URL` → PgBouncer localhost:5432 | Pooled, efficient |
| Realtime LISTEN/NOTIFY | `DIRECT_DATABASE_URL` → Cloud SQL Unix socket | Persistent connection required; PgBouncer transaction mode drops it |
| Prisma `migrate deploy` | `directUrl` in schema.prisma → `DIRECT_DATABASE_URL` | Migrations need DDL advisory locks, incompatible with PgBouncer |

### Environment variables in Cloud Run

| Variable | Source | Purpose |
|----------|--------|---------|
| `DATABASE_URL` | Secret Manager | PgBouncer URL (`localhost:5432`, with `pgbouncer=true`) |
| `DIRECT_DATABASE_URL` | Secret Manager | Cloud SQL socket URL (realtime + migrations) |
| `DB_APP_USER_PASSWORD` | Secret Manager | Raw DB password (entrypoint generates PgBouncer config) |
| `DB_INSTANCE_CONN` | Env var | Cloud SQL instance connection name |

---

## Cloud SQL Scaling Playbook

> Only needed if connections or CPU stay critical despite PgBouncer. A Cloud SQL tier change requires ~2 min downtime.

```bash
# Current tier
gcloud sql instances describe defensores-pg --project=coordinacion-electoral --format='value(settings.tier)'

# Upgrade to db-n1-standard-1 (4,000 max connections)
gcloud sql instances patch defensores-pg \
  --tier=db-n1-standard-1 \
  --project=coordinacion-electoral

# After upgrade: recalculate pool_size, update entrypoint.sh, rebuild image, redeploy
```

---

## Cloud Run Max-Instances Lock

The `--max-instances=5` limit is enforced in both:
- `backend/cloudbuild.yaml` (CI/CD)
- `backend/scripts/gcp/deploy-pgbouncer.sh` (one-time PgBouncer setup)

**Never increase this without recalculating pool_size.** See formula above.
