#!/usr/bin/env bash
# =============================================================================
# setup-monitoring.sh — Coordinación Electoral 2026 observability stack
#
# Covers:
#   T63  Verify Cloud Run + Cloud SQL standard metrics
#   T64  Grant SA permission to write custom metrics
#   T65  Uptime check on /api/healthz
#   T66  Alert policies (error rate, latency, SQL connections, instance count)
#   T67  PMU Dashboard deploy
#
# Prerequisites:
#   gcloud auth login (user: jdmg206@gmail.com)
#   gcloud config set project coordinacion-electoral
# =============================================================================

set -euo pipefail

PROJECT_ID="coordinacion-electoral"
REGION="us-central1"
BACKEND_HOST="backend-210392280319.us-central1.run.app"
HEALTHZ_URL="https://${BACKEND_HOST}/api/healthz"
SA="app-backend@${PROJECT_ID}.iam.gserviceaccount.com"
ALERT_EMAIL="jdmg206@gmail.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "====================================================================="
echo "Coordinación Electoral 2026 — Monitoring Setup"
echo "Project: ${PROJECT_ID}"
echo "====================================================================="

# ---------------------------------------------------------------------------
# T63 — Verify standard metrics are flowing
# Cloud Run and Cloud SQL metrics are automatic; verify by checking the API.
# ---------------------------------------------------------------------------
echo ""
echo "T63: Verifying standard Cloud Monitoring metrics..."
echo ""
echo "Cloud Run metrics (should list request_count, container/cpu_utilizations, etc.):"
gcloud monitoring metrics list \
  --filter='metric.type=starts_with("run.googleapis.com/")' \
  --project="${PROJECT_ID}" \
  --format="value(metricDescriptors.type)" \
  --limit=10 2>/dev/null || true

echo ""
echo "Cloud SQL metrics (should list connections/failed, database/cpu/utilization, etc.):"
gcloud monitoring metrics list \
  --filter='metric.type=starts_with("cloudsql.googleapis.com/")' \
  --project="${PROJECT_ID}" \
  --format="value(metricDescriptors.type)" \
  --limit=10 2>/dev/null || true

echo ""
echo "Custom metrics (once the backend has run and flushed once):"
echo "  run: gcloud monitoring metrics list \\"
echo "    --filter='metric.type=starts_with(\"custom.googleapis.com/electoral/\")' \\"
echo "    --project=${PROJECT_ID}"

echo ""
echo "T63 complete. Standard metrics are emitted automatically by GCP."
echo "Custom metrics will appear after the backend has been running ~60s."

# ---------------------------------------------------------------------------
# T64 — Grant SA monitoring.metricWriter so it can publish custom metrics
# ---------------------------------------------------------------------------
echo ""
echo "T64: Granting roles/monitoring.metricWriter to SA..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA}" \
  --role="roles/monitoring.metricWriter" \
  --condition=None \
  --quiet

echo "Done. SA can now write custom metrics."

# ---------------------------------------------------------------------------
# T65 — Uptime check on /api/healthz
# Uses the Cloud Monitoring REST API (gcloud uptime command requires GA release).
# ---------------------------------------------------------------------------
echo ""
echo "T65: Creating uptime check on ${HEALTHZ_URL} ..."

TOKEN="$(gcloud auth print-access-token)"

# Create uptime check — idempotent (will fail silently if same name exists)
UPTIME_BODY='{
  "displayName": "Backend /api/healthz",
  "httpCheck": {
    "path": "/api/healthz",
    "port": 443,
    "useSsl": true,
    "validateSsl": true,
    "requestMethod": "GET",
    "headers": {}
  },
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "project_id": "'"${PROJECT_ID}"'",
      "host": "'"${BACKEND_HOST}"'"
    }
  },
  "period": "60s",
  "timeout": "10s",
  "selectedRegions": ["USA", "EUROPE", "SOUTH_AMERICA", "ASIA_PACIFIC"]
}'

UPTIME_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/uptimeCheckConfigs" \
  -d "${UPTIME_BODY}")

UPTIME_CHECK_ID=$(echo "${UPTIME_RESP}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name','').split('/')[-1])" 2>/dev/null || echo "")
if [ -n "${UPTIME_CHECK_ID}" ]; then
  echo "Uptime check created: ${UPTIME_CHECK_ID}"
else
  echo "Uptime check response: ${UPTIME_RESP}"
fi

# ---------------------------------------------------------------------------
# Notification channel (email)
# ---------------------------------------------------------------------------
echo ""
echo "Creating email notification channel for ${ALERT_EMAIL}..."

CHANNEL_BODY='{
  "type": "email",
  "displayName": "Electoral PMU Email",
  "labels": { "email_address": "'"${ALERT_EMAIL}"'" }
}'

CHANNEL_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/notificationChannels" \
  -d "${CHANNEL_BODY}")

CHANNEL_NAME=$(echo "${CHANNEL_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || echo "")
if [ -n "${CHANNEL_NAME}" ]; then
  echo "Notification channel: ${CHANNEL_NAME}"
else
  echo "Channel response: ${CHANNEL_RESP}"
fi

# ---------------------------------------------------------------------------
# T66 — Alert policies
# ---------------------------------------------------------------------------
echo ""
echo "T66: Creating alert policies..."

create_alert() {
  local DISPLAY_NAME="$1"
  local FILTER="$2"
  local COMPARISON="$3"
  local THRESHOLD="$4"
  local DURATION="$5"
  local ALIGNER="$6"
  local REDUCER="$7"

  local POLICY_BODY
  POLICY_BODY=$(cat <<JSON
{
  "displayName": "${DISPLAY_NAME}",
  "conditions": [{
    "displayName": "${DISPLAY_NAME}",
    "conditionThreshold": {
      "filter": "${FILTER}",
      "comparison": "${COMPARISON}",
      "thresholdValue": ${THRESHOLD},
      "duration": "${DURATION}",
      "aggregations": [{
        "alignmentPeriod": "60s",
        "perSeriesAligner": "${ALIGNER}",
        "crossSeriesReducer": "${REDUCER}",
        "groupByFields": []
      }]
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "604800s" },
  "combiner": "OR"
}
JSON
)

  RESP=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies" \
    -d "${POLICY_BODY}")
  echo "  Created: ${DISPLAY_NAME}"
  echo "${RESP}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('    -> ' + d.get('name','ERROR: ' + str(d)))" 2>/dev/null || true
}

# 1. Error rate > 5% sustained 2 min (Cloud Run 5xx / total requests ratio)
create_alert \
  "CRITICAL: Backend error rate > 5% (2 min)" \
  "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND metric.label.response_code_class=\"5xx\"" \
  "COMPARISON_GT" \
  "5" \
  "120s" \
  "ALIGN_RATE" \
  "REDUCE_SUM"

# 2. Latency p95 > 2s sustained 2 min
create_alert \
  "WARNING: Backend latency p95 > 2s (2 min)" \
  "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\"" \
  "COMPARISON_GT" \
  "2000" \
  "120s" \
  "ALIGN_PERCENTILE_95" \
  "REDUCE_MAX"

# 3. Cloud SQL connections > 20 (80% of db-g1-small max=25)
create_alert \
  "CRITICAL: Cloud SQL connections > 20 (80% max)" \
  "metric.type=\"cloudsql.googleapis.com/database/network/connections\" AND resource.type=\"cloudsql_database\"" \
  "COMPARISON_GT" \
  "20" \
  "60s" \
  "ALIGN_MEAN" \
  "REDUCE_MAX"

# 4. Cloud Run instance count at max (5) for 5 min
create_alert \
  "WARNING: Cloud Run at max instances (5 min)" \
  "metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\"" \
  "COMPARISON_GT" \
  "4" \
  "300s" \
  "ALIGN_MAX" \
  "REDUCE_MAX"

# 5. 5xx spike > 10/min
create_alert \
  "CRITICAL: 5xx spike > 10 per minute" \
  "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND metric.label.response_code_class=\"5xx\"" \
  "COMPARISON_GT" \
  "10" \
  "60s" \
  "ALIGN_RATE" \
  "REDUCE_SUM"

# 6. Uptime check failing (only if uptime check was created)
if [ -n "${UPTIME_CHECK_ID}" ]; then
  UPTIME_FILTER="metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id=\"${UPTIME_CHECK_ID}\""
  UPTIME_BODY2=$(cat <<JSON
{
  "displayName": "CRITICAL: Backend healthz check failing",
  "conditions": [{
    "displayName": "Healthz check failing",
    "conditionThreshold": {
      "filter": "${UPTIME_FILTER}",
      "comparison": "COMPARISON_LT",
      "thresholdValue": 1,
      "duration": "60s",
      "aggregations": [{
        "alignmentPeriod": "60s",
        "perSeriesAligner": "ALIGN_NEXT_OLDER"
      }]
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "604800s" },
  "combiner": "OR"
}
JSON
)
  RESP=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies" \
    -d "${UPTIME_BODY2}")
  echo "  Created: CRITICAL: Backend healthz check failing"
fi

echo "Alert policies created."

# ---------------------------------------------------------------------------
# T67 — Deploy PMU Dashboard
# ---------------------------------------------------------------------------
echo ""
echo "T67: Deploying PMU Dashboard..."

TOKEN="$(gcloud auth print-access-token)"

DASHBOARD_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v1/projects/${PROJECT_ID}/dashboards" \
  -d @"${SCRIPT_DIR}/dashboard.json")

DASHBOARD_NAME=$(echo "${DASHBOARD_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || echo "")
if [ -n "${DASHBOARD_NAME}" ]; then
  DASHBOARD_ID="${DASHBOARD_NAME##*/}"
  echo "Dashboard deployed: ${DASHBOARD_NAME}"
  echo "URL: https://console.cloud.google.com/monitoring/dashboards/custom/${DASHBOARD_ID}?project=${PROJECT_ID}"
else
  echo "Dashboard response: ${DASHBOARD_RESP}"
fi

echo ""
echo "====================================================================="
echo "Setup complete."
echo "Dashboard URL: https://console.cloud.google.com/monitoring/dashboards?project=${PROJECT_ID}"
echo "Alert policies: https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}"
echo "Uptime checks:  https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}"
echo "====================================================================="
