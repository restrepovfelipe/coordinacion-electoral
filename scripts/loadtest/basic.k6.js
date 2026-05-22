/**
 * k6 load test — Coordinación Electoral backend
 * Usage:
 *   TOKEN=<bearer-token> k6 run scripts/loadtest/basic.k6.js
 *
 * Baseline (before PgBouncer):  k6 run --out json=baseline.json  basic.k6.js
 * Post-pooler (after PgBouncer): k6 run --out json=post.json      basic.k6.js
 *
 * Prerequisites:
 *   brew install k6  (macOS) | https://k6.io/docs/get-started/installation/
 *
 * Scenario models Día D peak load: 20 concurrent users, 3 minutes.
 * Reference endpoints are expected to hit the ETag/304 cache after the first pass.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://backend-210392280319.us-central1.run.app/api';
const TOKEN    = __ENV.TOKEN;   // required — pass as env var

if (!TOKEN) {
  throw new Error('TOKEN env var is required: TOKEN=<bearer> k6 run basic.k6.js');
}

export const options = {
  scenarios: {
    // Ramp to 20 VUs over 30s, hold for 2 min, ramp down 30s
    day_d_peak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m',  target: 20 },
        { duration: '30s', target: 0  },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // p95 latency < 2s (matches the SLA alert policy)
    http_req_duration: ['p(95)<2000'],
    // Error rate < 1%
    http_req_failed: ['rate<0.01'],
    // Reference-endpoint cache hit rate (304s) should be high after warmup
    ref_304_rate: ['rate>0.5'],
  },
};

// ─── Custom metrics ───────────────────────────────────────────────────────────

const ref304Rate = new Rate('ref_304_rate');
const testigoListDuration = new Trend('testigo_list_duration', true);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
});

// Per-VU ETag cache (simulates browser If-None-Match behaviour)
const etagCache = {};

function refGet(path) {
  const reqHeaders = headers();
  if (etagCache[path]) {
    reqHeaders['If-None-Match'] = etagCache[path];
  }

  const res = http.get(`${BASE_URL}${path}`, { headers: reqHeaders });

  check(res, {
    [`ref ${path} ok`]: (r) => r.status === 200 || r.status === 304,
  });

  if (res.status === 200) {
    const etag = res.headers['Etag'] || res.headers['ETag'];
    if (etag) etagCache[path] = etag;
  }

  // Track 304 cache-hit rate
  ref304Rate.add(res.status === 304);

  return res;
}

// ─── Main scenario ────────────────────────────────────────────────────────────

export default function () {
  // 1. Reference data (should 304 after first VU pass)
  refGet('/municipios');
  sleep(0.2);

  refGet('/puestos?municipioId=1');
  sleep(0.2);

  refGet('/zonas');
  sleep(0.2);

  // 2. Testigos list (paginated, generates DB load)
  const t0 = Date.now();
  const listRes = http.get(`${BASE_URL}/testigos?page=1&limit=50`, {
    headers: headers(),
  });
  testigoListDuration.add(Date.now() - t0);

  check(listRes, {
    'testigos list 200': (r) => r.status === 200,
    'testigos list has data': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });

  sleep(0.3);

  // 3. Healthz probe (low-cost, verifies service is up)
  const hz = http.get(`${BASE_URL}/healthz`);
  check(hz, { 'healthz 200': (r) => r.status === 200 });

  sleep(1);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const p50  = data.metrics.http_req_duration?.values?.['p(50)']?.toFixed(0) ?? '?';
  const p95  = data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(0) ?? '?';
  const p99  = data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(0) ?? '?';
  const errs = ((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2);
  const hits = ((data.metrics.ref_304_rate?.values?.rate    ?? 0) * 100).toFixed(1);
  const tl   = data.metrics.testigo_list_duration?.values?.['p(95)']?.toFixed(0) ?? '?';

  const summary = [
    '=== k6 Load Test — Coordinación Electoral ===',
    `p50 / p95 / p99 latency : ${p50} / ${p95} / ${p99} ms`,
    `Error rate              : ${errs}%  (threshold < 1%)`,
    `Ref 304 cache-hit rate  : ${hits}%  (threshold > 50%)`,
    `Testigo list p95        : ${tl} ms`,
    '=============================================',
  ].join('\n');

  console.log(summary);

  return {
    stdout: summary + '\n',
  };
}
