#!/usr/bin/env bash
# Starts the Cloud SQL Auth Proxy, tunnelling the defensores-pg instance to
# localhost:5432 for local development. Canonical source: MIGRATION_SPEC.md §1.6.
#
# NOTE: on the Windows dev host, gcloud runs only under PowerShell (Git Bash hits
# the SDK's bundled-Python lookup — see DISCOVERY.md / memory). To run the proxy
# here, invoke cloud-sql-proxy directly via PowerShell with the connection name
# (coordinacion-electoral:us-central1:defensores-pg). This .sh is the canonical,
# portable artifact for a POSIX dev environment / Cloud Shell.
set -euo pipefail
CONN=$(gcloud sql instances describe defensores-pg --project=coordinacion-electoral --format='value(connectionName)')
cloud-sql-proxy --port 5432 "$CONN"
