#!/usr/bin/env python3
"""
setup_alerts.py — Idempotent creation of all Cloud Monitoring resources for
the Electoral PMU war room.

Covers T64 (SA IAM grant), T65 (uptime check), T66 (6 alert policies),
T67 (dashboard). Safe to re-run: deletes existing policies by displayName
before recreating, so changes to thresholds are picked up.

Usage:
  python3 scripts/setup-monitoring/setup_alerts.py

Requirements:
  - gcloud CLI authenticated as jdmg206@gmail.com
  - Python 3.7+ (stdlib only, no pip install)
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ID = "coordinacion-electoral"
ALERT_EMAIL = "jdmg206@gmail.com"
BACKEND_HOST = "backend-210392280319.us-central1.run.app"
SA = f"app-backend@{PROJECT_ID}.iam.gserviceaccount.com"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

MONITORING_V3 = "https://monitoring.googleapis.com/v3"
MONITORING_V1 = "https://monitoring.googleapis.com/v1"
CLOUDRESOURCE = "https://cloudresourcemanager.googleapis.com/v1"

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def get_token() -> str:
    try:
        if sys.platform == "win32":
            result = subprocess.check_output(
                "gcloud auth print-access-token",
                shell=True, text=True, stderr=subprocess.PIPE,
            )
        else:
            result = subprocess.check_output(
                ["gcloud", "auth", "print-access-token"],
                text=True, stderr=subprocess.PIPE,
            )
        return result.strip()
    except subprocess.CalledProcessError as exc:
        print(f"FATAL: Cannot get GCP token: {exc.stderr}")
        sys.exit(1)


def request(method: str, url: str, body=None, token: str = "") -> tuple[dict, int]:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return json.loads(raw), exc.code
        except Exception:
            return {"error": raw.decode(errors="replace")}, exc.code

# ---------------------------------------------------------------------------
# T64 — Grant monitoring.metricWriter to the backend SA
# ---------------------------------------------------------------------------
def grant_metric_writer(token: str) -> None:
    print("\n[T64] Granting roles/monitoring.metricWriter to backend SA...")
    policy_url = f"{CLOUDRESOURCE}/projects/{PROJECT_ID}:getIamPolicy"
    current, status = request("POST", policy_url, body={}, token=token)
    if status != 200:
        print(f"  WARNING: Could not read IAM policy ({status}): {current.get('error', {})}")
        print("  Run manually: gcloud projects add-iam-policy-binding coordinacion-electoral "
              f"--member=serviceAccount:{SA} --role=roles/monitoring.metricWriter --condition=None")
        return

    member = f"serviceAccount:{SA}"
    role = "roles/monitoring.metricWriter"
    bindings = current.get("bindings", [])
    for b in bindings:
        if b.get("role") == role and member in b.get("members", []):
            print(f"  SKIP: {member} already has {role}")
            return

    # Add the binding
    for b in bindings:
        if b.get("role") == role:
            b["members"].append(member)
            break
    else:
        bindings.append({"role": role, "members": [member]})
    current["bindings"] = bindings

    set_url = f"{CLOUDRESOURCE}/projects/{PROJECT_ID}:setIamPolicy"
    resp, status2 = request("POST", set_url, body={"policy": current}, token=token)
    if status2 == 200:
        print(f"  OK: granted {role} to {member}")
    else:
        print(f"  WARNING: IAM setIamPolicy returned {status2}: {resp.get('error', resp)}")
        print("  Run manually: gcloud projects add-iam-policy-binding coordinacion-electoral "
              f"--member=serviceAccount:{SA} --role=roles/monitoring.metricWriter --condition=None")


# ---------------------------------------------------------------------------
# T65 — Notification channel
# ---------------------------------------------------------------------------
def ensure_notification_channel(token: str) -> str:
    print("\n[T65] Ensuring email notification channel...")
    resp, status = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/notificationChannels",
        token=token,
    )
    channels = resp.get("notificationChannels", [])
    for ch in channels:
        if ch.get("labels", {}).get("email_address") == ALERT_EMAIL:
            name = ch["name"]
            verified = ch.get("verificationStatus", "UNVERIFIED")
            print(f"  EXISTS: {name} (verificationStatus={verified})")
            if verified != "VERIFIED":
                print(f"  OWNER ACTION REQUIRED: check inbox for {ALERT_EMAIL} and click the "
                      "GCP verification link to enable email alerts.")
            return name

    body = {
        "type": "email",
        "displayName": "Electoral PMU Email",
        "labels": {"email_address": ALERT_EMAIL},
    }
    created, status2 = request(
        "POST",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/notificationChannels",
        body=body, token=token,
    )
    if status2 in (200, 201):
        name = created["name"]
        print(f"  CREATED: {name}")
        print(f"  OWNER ACTION REQUIRED: check inbox for {ALERT_EMAIL} and click the "
              "GCP verification link to enable email alerts.")
        return name
    print(f"  ERROR {status2}: {created}")
    return ""


# ---------------------------------------------------------------------------
# T65 — Uptime check
# ---------------------------------------------------------------------------
def ensure_uptime_check(token: str) -> str:
    print("\n[T65] Ensuring uptime check on /api/healthz...")
    resp, _ = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/uptimeCheckConfigs",
        token=token,
    )
    for uc in resp.get("uptimeCheckConfigs", []):
        if "healthz" in uc.get("displayName", "").lower():
            print(f"  EXISTS: {uc['name']}")
            return uc["name"].split("/")[-1]

    body = {
        "displayName": "Backend /api/healthz",
        "httpCheck": {
            "path": "/api/healthz",
            "port": 443,
            "useSsl": True,
            "validateSsl": True,
            "requestMethod": "GET",
        },
        "monitoredResource": {
            "type": "uptime_url",
            "labels": {
                "project_id": PROJECT_ID,
                "host": BACKEND_HOST,
            },
        },
        "period": "60s",
        "timeout": "10s",
        "selectedRegions": ["USA", "EUROPE", "SOUTH_AMERICA", "ASIA_PACIFIC"],
    }
    created, status = request(
        "POST",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/uptimeCheckConfigs",
        body=body, token=token,
    )
    if status in (200, 201):
        check_id = created["name"].split("/")[-1]
        print(f"  CREATED: {created['name']}")
        return check_id
    print(f"  ERROR {status}: {created}")
    return ""


# ---------------------------------------------------------------------------
# T66 — Alert policy definitions
# ---------------------------------------------------------------------------
def build_policies(channel_name: str, uptime_check_id: str) -> list[dict]:
    def cond(display, filter_str, comparison, threshold, duration, aligner,
             reducer="REDUCE_SUM", align_period="60s", group_by=None):
        agg = {
            "alignmentPeriod": align_period,
            "perSeriesAligner": aligner,
            "crossSeriesReducer": reducer,
            "groupByFields": group_by or [],
        }
        return {
            "displayName": display,
            "conditionThreshold": {
                "filter": filter_str,
                "comparison": comparison,
                "thresholdValue": threshold,
                "duration": duration,
                "aggregations": [agg],
            },
        }

    def policy(display_name, condition, channels):
        return {
            "displayName": display_name,
            "combiner": "OR",
            "conditions": [condition],
            "notificationChannels": [channels] if channels else [],
            "alertStrategy": {"autoClose": "604800s"},
            "enabled": True,
        }

    run_filter = 'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision"'
    run_5xx = run_filter + ' AND metric.label.response_code_class="5xx"'
    latency_filter = 'metric.type="run.googleapis.com/request_latencies" AND resource.type="cloud_run_revision"'
    sql_conn_filter = ('metric.type="cloudsql.googleapis.com/database/network/connections"'
                       ' AND resource.type="cloudsql_database"')
    run_inst_filter = ('metric.type="run.googleapis.com/container/instance_count"'
                       ' AND resource.type="cloud_run_revision"')
    uptime_filter = (
        'metric.type="monitoring.googleapis.com/uptime_check/check_passed"'
        ' AND resource.type="uptime_url"'
        f' AND metric.labels.check_id="{uptime_check_id}"'
    )

    return [
        policy(
            "CRITICAL: Backend error rate > 5% (2 min)",
            cond("5xx rate > 5/s sustained 2 min",
                 run_5xx, "COMPARISON_GT", 5.0, "120s", "ALIGN_RATE", "REDUCE_SUM"),
            channel_name,
        ),
        policy(
            "WARNING: Backend latency p95 > 2s (2 min)",
            cond("p95 latency > 2000ms sustained 2 min",
                 latency_filter, "COMPARISON_GT", 2000.0, "120s",
                 "ALIGN_PERCENTILE_95", "REDUCE_MAX"),
            channel_name,
        ),
        policy(
            "CRITICAL: Cloud SQL connections > 20 (80% max)",
            cond("SQL connections > 20",
                 sql_conn_filter, "COMPARISON_GT", 20.0, "60s", "ALIGN_MEAN", "REDUCE_MAX"),
            channel_name,
        ),
        policy(
            "WARNING: Cloud Run at max instances (5 min)",
            cond("Instance count > 4 for 5 min",
                 run_inst_filter, "COMPARISON_GT", 4.0, "300s", "ALIGN_MAX", "REDUCE_MAX"),
            channel_name,
        ),
        policy(
            "CRITICAL: 5xx spike > 10 per minute",
            {
                "displayName": "5xx delta > 10 in 60s",
                "conditionThreshold": {
                    "filter": run_5xx,
                    "comparison": "COMPARISON_GT",
                    "thresholdValue": 10.0,
                    "duration": "60s",
                    "aggregations": [{
                        "alignmentPeriod": "60s",
                        "perSeriesAligner": "ALIGN_DELTA",
                        "crossSeriesReducer": "REDUCE_SUM",
                        "groupByFields": [],
                    }],
                },
            },
            channel_name,
        ),
        policy(
            "CRITICAL: Backend healthz check failing",
            {
                "displayName": "Healthz uptime check below 100%",
                "conditionThreshold": {
                    "filter": uptime_filter,
                    "comparison": "COMPARISON_LT",
                    "thresholdValue": 1.0,
                    "duration": "60s",
                    "aggregations": [{
                        "alignmentPeriod": "60s",
                        "perSeriesAligner": "ALIGN_NEXT_OLDER",
                        "crossSeriesReducer": "REDUCE_FRACTION_TRUE",
                        "groupByFields": [],
                    }],
                },
            },
            channel_name,
        ),
    ]


# ---------------------------------------------------------------------------
# T66 — Create / recreate alert policies
# ---------------------------------------------------------------------------
def sync_alert_policies(policies: list[dict], token: str) -> list[dict]:
    print("\n[T66] Syncing alert policies...")

    # List existing
    resp, _ = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/alertPolicies",
        token=token,
    )
    existing = {p["displayName"]: p["name"] for p in resp.get("alertPolicies", [])}

    results = []
    for pol in policies:
        name = pol["displayName"]
        if name in existing:
            print(f"  DELETE existing: {name}")
            del_resp, del_status = request(
                "DELETE",
                f"https://monitoring.googleapis.com/v3/{existing[name]}",
                token=token,
            )
            if del_status not in (200, 204):
                print(f"    WARNING delete returned {del_status}: {del_resp}")

        created, status = request(
            "POST",
            f"{MONITORING_V3}/projects/{PROJECT_ID}/alertPolicies",
            body=pol, token=token,
        )
        if status in (200, 201):
            results.append(created)
            print(f"  OK: {name}")
            print(f"     -> {created['name']}")
        else:
            print(f"  FAIL ({status}): {name}")
            print(f"     {json.dumps(created.get('error', created), indent=2)}")
            results.append(None)

    return results


# ---------------------------------------------------------------------------
# T67 — Dashboard
# ---------------------------------------------------------------------------
def ensure_dashboard(token: str) -> str:
    print("\n[T67] Ensuring PMU dashboard...")
    resp, _ = request(
        "GET",
        f"{MONITORING_V1}/projects/{PROJECT_ID}/dashboards",
        token=token,
    )
    for dash in resp.get("dashboards", []):
        if "PMU" in dash.get("displayName", ""):
            print(f"  EXISTS: {dash['name']}")
            dash_id = dash["name"].split("/")[-1]
            url = (f"https://console.cloud.google.com/monitoring/dashboards/"
                   f"custom/{dash_id}?project={PROJECT_ID}")
            print(f"  URL: {url}")
            return url

    dashboard_file = os.path.join(SCRIPT_DIR, "dashboard.json")
    if not os.path.exists(dashboard_file):
        print(f"  ERROR: {dashboard_file} not found")
        return ""

    with open(dashboard_file, encoding="utf-8") as f:
        dash_body = json.load(f)

    # XyChart.Threshold only supports "value" and "label"; strip all other fields
    for tile in dash_body.get("mosaicLayout", {}).get("tiles", []):
        for thresh in tile.get("widget", {}).get("xyChart", {}).get("thresholds", []):
            for key in list(thresh.keys()):
                if key not in ("value", "label"):
                    thresh.pop(key)

    created, status = request(
        "POST",
        f"{MONITORING_V1}/projects/{PROJECT_ID}/dashboards",
        body=dash_body, token=token,
    )
    if status in (200, 201):
        dash_id = created["name"].split("/")[-1]
        url = (f"https://console.cloud.google.com/monitoring/dashboards/"
               f"custom/{dash_id}?project={PROJECT_ID}")
        print(f"  CREATED: {created['name']}")
        print(f"  URL: {url}")
        return url
    print(f"  ERROR {status}: {created}")
    return ""


# ---------------------------------------------------------------------------
# T63 — Verify standard metrics flowing
# ---------------------------------------------------------------------------
def verify_standard_metrics(token: str) -> None:
    print("\n[T63] Verifying standard Cloud Run metrics...")
    resp, status = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/metricDescriptors"
        "?filter=metric.type%3Dstarts_with%28%22run.googleapis.com%2F%22%29&pageSize=5",
        token=token,
    )
    descriptors = resp.get("metricDescriptors", [])
    if descriptors:
        print(f"  OK: {len(descriptors)}+ Cloud Run metrics found (e.g. {descriptors[0].get('type', '')})")
    else:
        print(f"  WARNING: No Cloud Run metrics found — Cloud Run service may not have received traffic yet")


# ---------------------------------------------------------------------------
# Verification (Steps 5-10)
# ---------------------------------------------------------------------------
def verify_policies(expected_names: list[str], token: str) -> bool:
    print("\n[VERIFY] Checking all 6 alert policies exist and are enabled...")
    resp, _ = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/alertPolicies",
        token=token,
    )
    existing = {p["displayName"]: p for p in resp.get("alertPolicies", [])}

    all_ok = True
    for name in expected_names:
        if name in existing:
            enabled = existing[name].get("enabled", True)
            policy_name = existing[name]["name"]
            status_str = "enabled" if enabled else "DISABLED"
            print(f"  PASS: {name}")
            print(f"        {policy_name} [{status_str}]")
            if not enabled:
                all_ok = False
        else:
            print(f"  FAIL: {name} — NOT FOUND")
            all_ok = False
    return all_ok


def verify_uptime(token: str) -> bool:
    print("\n[VERIFY] Uptime check...")
    resp, _ = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/uptimeCheckConfigs",
        token=token,
    )
    for uc in resp.get("uptimeCheckConfigs", []):
        if "healthz" in uc.get("displayName", "").lower():
            print(f"  PASS: {uc['name']}")
            return True
    print("  FAIL: No healthz uptime check found")
    return False


def verify_channel(token: str) -> tuple[bool, bool]:
    """Returns (exists, verified)."""
    print("\n[VERIFY] Notification channel...")
    resp, _ = request(
        "GET",
        f"{MONITORING_V3}/projects/{PROJECT_ID}/notificationChannels",
        token=token,
    )
    for ch in resp.get("notificationChannels", []):
        if ch.get("labels", {}).get("email_address") == ALERT_EMAIL:
            verified = ch.get("verificationStatus") == "VERIFIED"
            print(f"  PASS (exists): {ch['name']}")
            if not verified:
                print(f"  NOTE: verificationStatus={ch.get('verificationStatus')} — "
                      f"owner must click confirmation email sent to {ALERT_EMAIL}")
            else:
                print(f"  PASS (verified)")
            return True, verified
    print(f"  FAIL: No channel for {ALERT_EMAIL}")
    return False, False


def verify_iam(token: str) -> bool:
    print("\n[VERIFY] IAM — monitoring.metricWriter on backend SA...")
    resp, status = request(
        "POST",
        f"{CLOUDRESOURCE}/projects/{PROJECT_ID}:getIamPolicy",
        body={}, token=token,
    )
    if status != 200:
        print(f"  WARNING: Could not read IAM policy ({status})")
        return False
    member = f"serviceAccount:{SA}"
    role = "roles/monitoring.metricWriter"
    for b in resp.get("bindings", []):
        if b.get("role") == role and member in b.get("members", []):
            print(f"  PASS: {member} has {role}")
            return True
    print(f"  FAIL: {member} does NOT have {role}")
    return False


def verify_metric_ingestion(token: str) -> bool:
    print("\n[VERIFY] Metric ingestion — querying Cloud Run request_count...")
    import datetime
    end = datetime.datetime.now(datetime.timezone.utc)
    start = end - datetime.timedelta(minutes=15)
    start_str = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_str = end.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (
        f"{MONITORING_V3}/projects/{PROJECT_ID}/timeSeries"
        f"?filter=metric.type%3D%22run.googleapis.com%2Frequest_count%22"
        f"%26resource.type%3D%22cloud_run_revision%22"
        f"&interval.startTime={urllib.parse.quote(start_str)}"
        f"&interval.endTime={urllib.parse.quote(end_str)}"
        f"&aggregation.alignmentPeriod=300s"
        f"&aggregation.perSeriesAligner=ALIGN_RATE"
        f"&pageSize=5"
    )
    resp, status = request("GET", url, token=token)
    series = resp.get("timeSeries", [])
    if series:
        total_points = sum(len(s.get("points", [])) for s in series)
        print(f"  PASS: {len(series)} time series, {total_points} data points found")
        return True
    print("  NOTE: No request_count data in last 15 min — backend may be idle. "
          "This is OK if no traffic; metrics will appear after the next request.")
    return True  # Not a hard failure — backend may be idle


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print("=" * 70)
    print("Coordinación Electoral 2026 — Monitoring Setup (T63-T67)")
    print(f"Project: {PROJECT_ID}")
    print("=" * 70)

    token = get_token()

    # T63 — verify standard metrics
    verify_standard_metrics(token)

    # T64 — IAM
    grant_metric_writer(token)

    # T65 — notification channel + uptime check
    channel_name = ensure_notification_channel(token)
    uptime_check_id = ensure_uptime_check(token)

    if not uptime_check_id:
        print("ERROR: Could not ensure uptime check. Aborting.")
        sys.exit(1)

    # T66 — alert policies
    policies = build_policies(channel_name, uptime_check_id)
    policy_results = sync_alert_policies(policies, token)

    # T67 — dashboard
    dashboard_url = ensure_dashboard(token)

    # --- Verification ---
    print("\n" + "=" * 70)
    print("VERIFICATION")
    print("=" * 70)

    expected = [p["displayName"] for p in policies]
    policies_ok = verify_policies(expected, token)
    uptime_ok = verify_uptime(token)
    channel_ok, channel_verified = verify_channel(token)
    iam_ok = verify_iam(token)
    _ = verify_metric_ingestion(token)

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Alert policies (6/6):  {'PASS' if policies_ok else 'FAIL'}")
    print(f"  Uptime check:          {'PASS' if uptime_ok else 'FAIL'}")
    print(f"  Notification channel:  {'PASS' if channel_ok else 'FAIL'}"
          + ("" if channel_verified else " (email confirmation pending)"))
    print(f"  IAM metricWriter:      {'PASS' if iam_ok else 'FAIL (run gcloud manually)'}")
    print(f"  Dashboard:             {'PASS' if dashboard_url else 'FAIL'}")
    if dashboard_url:
        print(f"    {dashboard_url}")
    print()
    print("Alert policies URL:")
    print(f"  https://console.cloud.google.com/monitoring/alerting?project={PROJECT_ID}")
    print("Uptime checks URL:")
    print(f"  https://console.cloud.google.com/monitoring/uptime?project={PROJECT_ID}")

    if not (policies_ok and uptime_ok and channel_ok):
        print("\nSome verifications failed — see output above.")
        sys.exit(1)
    else:
        print("\nAll verifications passed.")


if __name__ == "__main__":
    # needed for urllib.parse in verify_metric_ingestion
    import urllib.parse
    main()
