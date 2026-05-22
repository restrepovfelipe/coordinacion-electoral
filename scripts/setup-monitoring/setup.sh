#!/usr/bin/env bash
# =============================================================================
# setup.sh — Coordinación Electoral 2026 observability stack
#
# Thin wrapper: delegates all Cloud Monitoring resource creation to
# setup_alerts.py (Python), which handles JSON serialization correctly.
#
# Covers T63-T67. Run once after gcloud auth login.
#
# Prerequisites:
#   gcloud auth login (user: jdmg206@gmail.com)
#   gcloud config set project coordinacion-electoral
#   Python 3.7+ on PATH
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running monitoring setup..."
python3 "${SCRIPT_DIR}/setup_alerts.py"
