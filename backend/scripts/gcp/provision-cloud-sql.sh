#!/usr/bin/env bash
# Provisions the Cloud SQL PostgreSQL instance for Comando Electoral 2026.
# Canonical source: MIGRATION_SPEC.md §1.5. Defaults reflect the values pinned
# at the Phase 0 -> 1 gate (project = coordinacion-electoral, not the spec's
# `defensores-2026` example).
#
# NOTE: on the current Windows dev host, gcloud runs only under PowerShell —
# Git Bash hits the SDK's bundled-Python lookup (see DISCOVERY.md / memory).
# This file is the canonical, portable artifact; on this host T09 was executed
# by running the equivalent gcloud commands via PowerShell.
set -euo pipefail
PROJECT=${1:-coordinacion-electoral}
REGION=${2:-us-central1}
INSTANCE=${3:-defensores-pg}
DB_NAME=defensores

gcloud sql instances create "$INSTANCE" \
  --project="$PROJECT" \
  --database-version=POSTGRES_16 \
  --edition=ENTERPRISE \
  --tier=db-g1-small \
  --region="$REGION" \
  --storage-size=10GB --storage-auto-increase \
  --backup --backup-start-time=03:00

DB_PWD=$(gcloud secrets versions access latest --secret=DB_APP_USER_PASSWORD --project="$PROJECT")

gcloud sql databases create "$DB_NAME" --instance="$INSTANCE" --project="$PROJECT"
gcloud sql users create app_user --instance="$INSTANCE" --password="$DB_PWD" --project="$PROJECT"

echo "Connection name: $(gcloud sql instances describe "$INSTANCE" --project="$PROJECT" --format='value(connectionName)')"
