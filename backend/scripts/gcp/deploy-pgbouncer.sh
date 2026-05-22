#!/usr/bin/env bash
# =============================================================================
# deploy-pgbouncer.sh — Apply PgBouncer sidecar configuration to Cloud Run
#
# Covers T72 (Amendment A14). Run ONCE after the new Docker image (with the
# PgBouncer sidecar) has been built and pushed to Artifact Registry.
#
# Prerequisites:
#   gcloud auth login (as jdmg206@gmail.com)
#   gcloud config set project coordinacion-electoral
#   The new backend image is already deployed (via Cloud Build / cloudbuild.yaml)
#
# What this script does:
#   1. Creates the DIRECT_DATABASE_URL secret (for realtime LISTEN + migrations).
#   2. Updates the DATABASE_URL secret to use localhost:5432 (PgBouncer).
#   3. Updates the Cloud Run service: mounts both secrets, sets max-instances=5,
#      adds DB_INSTANCE_CONN env var.
#   4. Verifies /api/healthz returns 200.
# =============================================================================
set -euo pipefail

PROJECT="coordinacion-electoral"
REGION="us-central1"
SERVICE="backend"
INSTANCE_CONN="coordinacion-electoral:us-central1:defensores-pg"

# ─── Step 0 — Fetch the existing DB password from Secret Manager ──────────────
echo "Fetching DB_APP_USER_PASSWORD from Secret Manager..."
DB_PWD=$(gcloud secrets versions access latest \
  --secret="DB_APP_USER_PASSWORD" \
  --project="${PROJECT}")

# URL-encode for use in connection strings (Python one-liner, portable)
DB_PWD_ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.stdin.read().strip(), safe=''))" <<< "${DB_PWD}")

# ─── Step 1 — Create / update DIRECT_DATABASE_URL secret ─────────────────────
# Direct URL: Cloud SQL Unix socket, no PgBouncer. Used by:
#   - realtime.service.ts (LISTEN/NOTIFY)
#   - prisma migrate deploy (directUrl in schema.prisma)
DIRECT_URL="postgresql://app_user:${DB_PWD_ENCODED}@/defensores?host=/cloudsql/${INSTANCE_CONN}"

if gcloud secrets describe DIRECT_DATABASE_URL --project="${PROJECT}" &>/dev/null; then
  echo "Updating DIRECT_DATABASE_URL secret..."
  echo -n "${DIRECT_URL}" | gcloud secrets versions add DIRECT_DATABASE_URL \
    --data-file=- --project="${PROJECT}"
else
  echo "Creating DIRECT_DATABASE_URL secret..."
  echo -n "${DIRECT_URL}" | gcloud secrets create DIRECT_DATABASE_URL \
    --data-file=- --project="${PROJECT}"
fi

# Grant Cloud Run SA access to the new secret
gcloud secrets add-iam-policy-binding DIRECT_DATABASE_URL \
  --member="serviceAccount:app-backend@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT}"

# ─── Step 2 — Create / update DATABASE_URL secret (PgBouncer localhost) ───────
# This replaces the old Cloud SQL URL. NestJS (Prisma) now connects to PgBouncer.
PGB_URL="postgresql://app_user:${DB_PWD_ENCODED}@localhost:5432/defensores?pgbouncer=true&statement_cache_size=0"

if gcloud secrets describe DATABASE_URL --project="${PROJECT}" &>/dev/null; then
  echo "Updating DATABASE_URL secret..."
  echo -n "${PGB_URL}" | gcloud secrets versions add DATABASE_URL \
    --data-file=- --project="${PROJECT}"
else
  echo "Creating DATABASE_URL secret..."
  echo -n "${PGB_URL}" | gcloud secrets create DATABASE_URL \
    --data-file=- --project="${PROJECT}"
fi

gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:app-backend@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT}"

# ─── Step 3 — Update Cloud Run service ───────────────────────────────────────
echo "Updating Cloud Run service '${SERVICE}'..."
gcloud run services update "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --max-instances=5 \
  --set-env-vars="DB_INSTANCE_CONN=${INSTANCE_CONN}" \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest,DIRECT_DATABASE_URL=DIRECT_DATABASE_URL:latest,DB_APP_USER_PASSWORD=DB_APP_USER_PASSWORD:latest,CIP_WEB_API_KEY=CIP_WEB_API_KEY:latest"

# ─── Step 4 — Verify healthz ──────────────────────────────────────────────────
echo "Waiting 15 s for new revision to become ready..."
sleep 15

echo "Verifying /api/healthz..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://backend-210392280319.us-central1.run.app/api/healthz")

if [ "${STATUS}" = "200" ]; then
  echo "✅ /api/healthz → 200 OK. PgBouncer sidecar deployed successfully."
else
  echo "❌ /api/healthz returned ${STATUS}. Check Cloud Run logs:" >&2
  echo "   gcloud run services logs tail ${SERVICE} --region=${REGION} --project=${PROJECT}" >&2
  exit 1
fi
