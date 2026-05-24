import { Page, request } from '@playwright/test'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://backend-210392280319.us-central1.run.app/api'
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ''

// A15 guard: assert that username follows qa.test.* pattern
export function assertQaUsername(username: string) {
  if (!/^qa\.test\./.test(username)) {
    throw new Error(`A15 VIOLATION: username "${username}" is not a qa.test.* username. ABORTING.`)
  }
}

// Get a Firebase ID token for a user (email = username@defensores.local)
export async function getFirebaseToken(username: string, password: string): Promise<string> {
  assertQaUsername(username)
  const email = `${username}@${process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? 'defensores.local'}`
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  if (!res.ok) throw new Error(`Firebase auth failed for ${username}: ${res.status}`)
  const data: { idToken: string } = await res.json()
  return data.idToken
}

// Get a backend auth session (set cookie on the Next.js app)
export async function loginViaApi(page: Page, username: string, password: string) {
  assertQaUsername(username)
  const email = `${username}@${process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? 'defensores.local'}`
  // Navigate to login page and fill the form
  await page.goto('/login')
  await page.getByLabel(/usuario/i).fill(username)
  await page.getByLabel(/contraseña/i).fill(password)
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL('/', { timeout: 15_000 })
}

// Get a backend API token for a BOOTSTRAP admin to create test users
// Requires QA_ADMIN_USERNAME and QA_ADMIN_PASSWORD env vars (never hardcoded)
export async function getBootstrapToken(): Promise<string> {
  const adminUser = process.env.QA_ADMIN_USERNAME
  const adminPass = process.env.QA_ADMIN_PASSWORD
  if (!adminUser || !adminPass) {
    throw new Error('QA_ADMIN_USERNAME and QA_ADMIN_PASSWORD env vars are required for E2E tests. See CUTOVER_RUNBOOK.md.')
  }
  // NOTE: admin creds are NOT qa.test — they're the real admin. We ONLY use them to CREATE qa.test users.
  // The admin never becomes a test subject.
  const email = `${adminUser}@${process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? 'defensores.local'}`
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: adminPass, returnSecureToken: true }),
    }
  )
  if (!res.ok) throw new Error(`Bootstrap admin auth failed: ${res.status}`)
  const data: { idToken: string } = await res.json()
  return data.idToken
}

type CreatedTestUser = { id: number; username: string; password: string }

export async function createQaUser(token: string, opts: {
  role: string
  scopeType?: string
  scopeId?: number
}): Promise<CreatedTestUser> {
  const ts = Date.now()
  const suffix = opts.role.toLowerCase().replace(/_/g, '.')
  const username = `qa.test.${suffix}.${ts}`
  assertQaUsername(username)
  const password = `Qa!${Math.random().toString(36).slice(2, 10)}Zx9!`
  const body: Record<string, unknown> = {
    username, password, displayName: `QA ${opts.role} ${ts}`, role: opts.role,
    scopes: opts.scopeType && opts.scopeId ? [{ scopeType: opts.scopeType, scopeId: opts.scopeId }] : [],
  }
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to create qa user ${username}: ${res.status} ${await res.text()}`)
  const user: { id: number } = await res.json()
  return { id: user.id, username, password }
}

export async function deleteQaUser(token: string, userId: number, username: string): Promise<void> {
  assertQaUsername(username)
  const res = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 204 || res.status === 200) return

  // Fallback: patch to inactive + log to QA_CLEANUP.md
  await fetch(`${API_BASE}/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ active: false }),
  })
  // Append to QA_CLEANUP.md
  const { appendFile } = await import('fs/promises')
  const entry = JSON.stringify({ id: userId, username, reason: `DELETE failed with status ${res.status}`, ts: new Date().toISOString() })
  await appendFile('QA_CLEANUP.md', `\n- ${entry}`)
  console.error(`[A15] QA user ${username} (${userId}) could not be deleted. Patched inactive. Logged to QA_CLEANUP.md.`)
}
