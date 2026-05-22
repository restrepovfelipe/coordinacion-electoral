#!/bin/bash
# Sidecar entrypoint: start PgBouncer, wait for it, then exec the NestJS process.
# PgBouncer listens on 127.0.0.1:5432 and pools connections to Cloud SQL via
# Unix socket. NestJS (DATABASE_URL) connects through PgBouncer.
# The realtime LISTEN/NOTIFY client uses DIRECT_DATABASE_URL to bypass the pool.
#
# Required env vars (injected by Cloud Run from Secret Manager):
#   DB_APP_USER_PASSWORD  — postgres app_user password (secret)
#   DB_INSTANCE_CONN      — Cloud SQL instance connection name (plain env var)
#                           e.g. coordinacion-electoral:us-central1:defensores-pg
#
# Pool sizing: pool_size=5, max_client_conn=100
# At max scale (5 Cloud Run instances): 5×5 = 25 real DB connections ≤ Cloud SQL limit.

set -euo pipefail

# ─── Validate required env vars ───────────────────────────────────────────────
: "${DB_APP_USER_PASSWORD:?DB_APP_USER_PASSWORD must be set}"
: "${DB_INSTANCE_CONN:?DB_INSTANCE_CONN must be set}"

# ─── Generate PgBouncer config files in /tmp (writable at runtime) ────────────

# auth_type=trust means clients on localhost need no password;
# PgBouncer uses the password from [databases] to authenticate to PostgreSQL.
# pidfile in /tmp because the container may not have write access elsewhere.
cat > /tmp/pgbouncer.ini <<EOF
[databases]
defensores = host=/cloudsql/${DB_INSTANCE_CONN} dbname=defensores user=app_user password=${DB_APP_USER_PASSWORD}

[pgbouncer]
listen_port     = 5432
listen_addr     = 127.0.0.1
auth_type       = trust
auth_file       = /tmp/pgbouncer-userlist.txt
pidfile         = /tmp/pgbouncer.pid
pool_mode       = transaction
max_client_conn = 100
default_pool_size   = 5
min_pool_size       = 2
reserve_pool_size   = 2
server_lifetime     = 3600
server_idle_timeout = 600
log_connections     = 1
log_disconnections  = 0
server_reset_query  = DISCARD ALL
EOF

# Userlist needed even with trust auth (PgBouncer validates usernames).
printf '"app_user" ""\n' > /tmp/pgbouncer-userlist.txt

# ─── Start PgBouncer ──────────────────────────────────────────────────────────
# ─── Apply pending Prisma migrations (uses DIRECT_DATABASE_URL, bypasses PgBouncer) ──
# Runs before PgBouncer starts so DDL advisory locks are never blocked by pooler.
# Idempotent: Prisma tracks applied migrations in _prisma_migrations table.
echo "[entrypoint] Running prisma migrate deploy..."
node /app/node_modules/.bin/prisma migrate deploy
echo "[entrypoint] Migrations complete."

# -u nobody: drop from root to nobody after binding the port (required by PgBouncer).
# Logs go to stdout (no logfile= set) so Cloud Run captures them.
pgbouncer -u nobody /tmp/pgbouncer.ini &
PGB_PID=$!

echo "[entrypoint] PgBouncer starting (pid ${PGB_PID})..."

# Wait up to 5 s for PgBouncer to bind 127.0.0.1:5432
for i in $(seq 1 25); do
  if (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null; then
    echo "[entrypoint] PgBouncer started on localhost:5432"
    break
  fi
  sleep 0.2
  if [ "${i}" -eq 25 ]; then
    echo "[entrypoint] ERROR: PgBouncer did not start within 5 s" >&2
    exit 1
  fi
done

# ─── Hand off to NestJS ───────────────────────────────────────────────────────
exec node /app/dist/main
