// @vitest-environment node
// Guard: NEXT_PUBLIC_API_BASE must end in /api.
// Tests that the five most-called endpoints return non-404 responses.
// A15 compliant: uses qa.admin for read-only GETs only; creates/deletes no users.

import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

import { describe, it, expect, beforeAll } from 'vitest'

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ''
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? 'defensores.local'
const FIREBASE_SIGN_IN = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`

const hasCredentials = !!process.env.QA_ADMIN_USERNAME && !!process.env.QA_ADMIN_PASSWORD

// ── helpers ───────────────────────────────────────────────────────────────────

async function getAdminToken(): Promise<string> {
  const email = `${process.env.QA_ADMIN_USERNAME}@${AUTH_DOMAIN}`
  const res = await fetch(FIREBASE_SIGN_IN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.QA_ADMIN_PASSWORD, returnSecureToken: true }),
  })
  if (!res.ok) throw new Error(`Admin auth failed: ${res.status}`)
  const data = (await res.json()) as { idToken: string }
  return data.idToken
}

async function get(path: string, token: string): Promise<Response> {
  const base = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/$/, '')}/api`
  return fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('B-0: NEXT_PUBLIC_API_BASE format guard', () => {
  it('B-0a: NEXT_PUBLIC_API_BASE is set (not empty)', () => {
    expect(RAW_BASE, 'NEXT_PUBLIC_API_BASE must not be empty — set it in Vercel to https://backend-210392280319.us-central1.run.app/api').not.toBe('')
  })

  it('B-0b: NEXT_PUBLIC_API_BASE ends in /api (no missing prefix)', () => {
    expect(
      RAW_BASE.endsWith('/api'),
      `NEXT_PUBLIC_API_BASE="${RAW_BASE}" must end in /api — endpoints will 404 without it`,
    ).toBe(true)
  })

  it('B-0c: NEXT_PUBLIC_API_BASE does not have a trailing slash after /api', () => {
    expect(
      RAW_BASE.endsWith('/api/'),
      `NEXT_PUBLIC_API_BASE="${RAW_BASE}" must not have trailing slash — use .../run.app/api not .../run.app/api/`,
    ).toBe(false)
  })
})

describe.skipIf(!hasCredentials)('B-1: Critical endpoints return non-404 with valid token', () => {
  let token: string

  beforeAll(async () => {
    token = await getAdminToken()
  })

  it('B-1a: GET /dashboard/stats returns 200 (not 404)', async () => {
    const res = await get('/dashboard/stats', token)
    expect(res.status).not.toBe(404)
    expect(res.status).toBe(200)
  })

  it('B-1b: GET /municipios returns 200 (not 404)', async () => {
    const res = await get('/municipios', token)
    expect(res.status).not.toBe(404)
    expect(res.status).toBe(200)
  })

  it('B-1c: GET /subregiones returns 200 (not 404)', async () => {
    const res = await get('/subregiones', token)
    expect(res.status).not.toBe(404)
    expect(res.status).toBe(200)
  })

  it('B-1d: GET /events returns 200 (SSE — not 404)', async () => {
    const base = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/$/, '')}/api`
    const controller = new AbortController()
    const res = await fetch(`${base}/events?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
    // close immediately — we only care that the endpoint exists and responds with SSE headers
    controller.abort()
    expect(res.status).not.toBe(404)
    // SSE endpoint returns 200 with text/event-stream
    expect(res.status).toBe(200)
  })

  it('B-1e: GET /testigos returns 200 (not 404)', async () => {
    const res = await get('/testigos?limit=1', token)
    expect(res.status).not.toBe(404)
    expect(res.status).toBe(200)
  })
})
