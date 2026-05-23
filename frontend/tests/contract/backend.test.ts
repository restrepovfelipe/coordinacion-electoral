// @vitest-environment node
// Load .env.local before anything else — Vitest 4 node-pool workers don't
// inherit the Vite loadEnv result the way jsdom pools do.
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFile, appendFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { safeFetch, QA_USERNAME_RX } from './safe-fetch'
// QA_USERNAME_RX = /^qa\.(admin|test\.[a-z]+\.[0-9]+)$/
// qa.admin → static authenticator only; NEVER modified, deleted, or has password changed by tests
// qa.test.* → disposable per-scenario users, always deleted in afterAll

// Normalise: accept NEXT_PUBLIC_API_BASE with or without trailing /api
const _rawBase =
  process.env.NEXT_PUBLIC_API_BASE ??
  'https://backend-210392280319.us-central1.run.app/api'
const API_BASE = _rawBase.endsWith('/api') ? _rawBase : `${_rawBase.replace(/\/$/, '')}/api`
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ''
const AUTH_DOMAIN =
  process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? 'defensores.local'
const FIREBASE_SIGN_IN =
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`

const hasCredentials =
  !!process.env.QA_ADMIN_USERNAME && !!process.env.QA_ADMIN_PASSWORD

// ── Layer 3: safeLogin ────────────────────────────────────────────────────────

async function safeLogin(username: string, password: string): Promise<string> {
  if (!QA_USERNAME_RX.test(username)) {
    throw new Error(
      `A15 GUARD: safeLogin called with non-qa username "${username}" — must be qa.admin or qa.test.*`,
    )
  }
  const email = `${username}@${AUTH_DOMAIN}`
  const res = await fetch(FIREBASE_SIGN_IN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (!res.ok) {
    throw new Error(`safeLogin failed for ${username}: ${res.status}`)
  }
  const data = (await res.json()) as { idToken: string }
  return data.idToken
}

// ── Bootstrap (admin credentials only for creating qa users) ─────────────────

async function getBootstrapToken(): Promise<string> {
  const email = `${process.env.QA_ADMIN_USERNAME}@${AUTH_DOMAIN}`
  const res = await fetch(FIREBASE_SIGN_IN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: process.env.QA_ADMIN_PASSWORD,
      returnSecureToken: true,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Bootstrap admin auth failed: ${res.status} — ${body}`)
  }
  const data = (await res.json()) as { idToken: string }
  return data.idToken
}

async function createQaUser(
  token: string,
  opts: { role: string; scopeType?: string; scopeId?: number },
): Promise<{ id: number; username: string; password: string }> {
  const ts = Date.now()
  // Replace underscores but keep single segment (superadmin, puestocoordinator)
  // to stay compatible with QA_USERNAME_RX = /^qa\.test\.[a-z]+\.[0-9]+$/
  const suffix = opts.role.toLowerCase().replace(/_/g, '')
  const username = `qa.test.${suffix}.${ts}`
  if (!QA_USERNAME_RX.test(username)) {
    throw new Error(`A15: generated username "${username}" doesn't match qa.test pattern`)
  }
  const password = `Qa!${Math.random().toString(36).slice(2, 10)}Zx9!`
  const body: Record<string, unknown> = {
    username,
    password,
    displayName: `QA ${opts.role} ${ts}`,
    role: opts.role,
    scopes:
      opts.scopeType && opts.scopeId
        ? [{ scopeType: opts.scopeType, scopeId: opts.scopeId }]
        : [],
  }
  const res = await safeFetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      `Failed to create qa user ${username}: ${res.status} ${await res.text()}`,
    )
  }
  const user = (await res.json()) as { id: number }
  return { id: user.id, username, password }
}

// ── Layer 4: cleanup with QA_CLEANUP.md fallback ─────────────────────────────

async function cleanupQaUser(
  token: string,
  userId: number,
  username: string,
): Promise<void> {
  if (!QA_USERNAME_RX.test(username)) {
    throw new Error(`A15: cleanupQaUser called with non-qa username "${username}"`)
  }
  const res = await safeFetch(`${API_BASE}/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 204 || res.status === 200) return

  // DELETE failed — patch inactive and log to QA_CLEANUP.md
  await safeFetch(`${API_BASE}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ active: false }),
  })
  const entry = JSON.stringify({
    id: userId,
    username,
    reason: `DELETE returned ${res.status}`,
    ts: new Date().toISOString(),
  })
  await appendFile('QA_CLEANUP.md', `\n- ${entry}`)
  console.error(
    `[A15] ${username} (${userId}) could not be deleted. Patched inactive. Logged to QA_CLEANUP.md.`,
  )
}

// ── Layer 2: static fixture scan ─────────────────────────────────────────────

describe('Layer 2 — static fixture scan', () => {
  it('own source contains no hardcoded non-qa.test usernames', async () => {
    const src = await readFile(fileURLToPath(import.meta.url), 'utf-8')
    // Match any 4-segment dot-separated token ending in digits (potential username literal)
    const candidates = [...src.matchAll(/\b([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2}\.[0-9]+)\b/g)]
      .map((m) => m[1])
      .filter((c): c is string => c !== undefined)
    for (const c of candidates) {
      expect(
        QA_USERNAME_RX.test(c),
        `Found suspicious username literal "${c}" — must match qa.test.<role>.<timestamp>`,
      ).toBe(true)
    }
  })
})

// ── Scenario A — SUPER_ADMIN ──────────────────────────────────────────────────

describe.skipIf(!hasCredentials)('Scenario A — SUPER_ADMIN', () => {
  let adminToken: string
  let testUser: { id: number; username: string; password: string }

  beforeAll(async () => {
    adminToken = await getBootstrapToken()
    testUser = await createQaUser(adminToken, { role: 'SUPER_ADMIN' })
  })

  afterAll(async () => {
    if (testUser) await cleanupQaUser(adminToken, testUser.id, testUser.username)
  })

  it('A-1: GET /dashboard/stats returns 200', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('A-2: GET /users returns 200', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('A-3: GET /testigos returns 200 with data array', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/testigos?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown
    // Backend shape: { data: [...], total, page, limit }
    expect(body).toHaveProperty('data')
  })

  it('A-4: GET /dashboard/prioridad/puestos returns 200', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/dashboard/prioridad/puestos?page=1&perPage=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })
})

// ── Scenario B — REGIONAL_COORDINATOR ────────────────────────────────────────

describe.skipIf(!hasCredentials)('Scenario B — REGIONAL_COORDINATOR', () => {
  let adminToken: string
  let testUser: { id: number; username: string; password: string }

  beforeAll(async () => {
    adminToken = await getBootstrapToken()
    testUser = await createQaUser(adminToken, { role: 'REGIONAL_COORDINATOR' })
  })

  afterAll(async () => {
    if (testUser) await cleanupQaUser(adminToken, testUser.id, testUser.username)
  })

  it('B-1: GET /dashboard/stats returns 200', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('B-2: GET /testigos returns 200', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/testigos?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('B-3: GET /users returns 200 (regional can read users in scope)', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })
})

// ── Scenario C — PUESTO_COORDINATOR ──────────────────────────────────────────

describe.skipIf(!hasCredentials)('Scenario C — PUESTO_COORDINATOR', () => {
  let adminToken: string
  let testUser: { id: number; username: string; password: string }

  beforeAll(async () => {
    adminToken = await getBootstrapToken()
    testUser = await createQaUser(adminToken, {
      role: 'PUESTO_COORDINATOR',
      scopeType: 'PUESTO',
      scopeId: 1,
    })
  })

  afterAll(async () => {
    if (testUser) await cleanupQaUser(adminToken, testUser.id, testUser.username)
  })

  it('C-1: GET /dashboard/stats returns 200', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('C-2: GET /users returns 403 (puesto coordinator cannot list users)', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    const res = await safeFetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  })

  it('C-3: POST /users returns 403 (puesto coordinator cannot create users)', async () => {
    const token = await safeLogin(testUser.username, testUser.password)
    // No username in body — authorization check fires before validation
    const res = await safeFetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        displayName: 'Blocked',
        role: 'PUESTO_COORDINATOR',
        scopes: [],
      }),
    })
    expect(res.status).toBe(403)
  })
})
