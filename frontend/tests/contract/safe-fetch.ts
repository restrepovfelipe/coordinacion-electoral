// @vitest-environment node

/**
 * A15 Layer 1 — safeFetch wrapper.
 * Every HTTP call in contract tests MUST use this function, never raw fetch.
 * Validates that any username-like field in query params or request body
 * follows the qa.test.<role>.<timestamp> pattern before the request is sent.
 */

export const QA_USERNAME_RX = /^qa\.test\.[a-z]+\.[0-9]+$/

const USERNAME_KEYS = ['username', 'usuario', 'user', 'email'] as const

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000/api'
  const u = new URL(url.startsWith('http') ? url : `${base}/${url.replace(/^\//, '')}`)

  for (const key of USERNAME_KEYS) {
    const v = u.searchParams.get(key)
    if (v && !QA_USERNAME_RX.test(v)) {
      throw new Error(
        `A15 GUARD: query param ${key}="${v}" does not match qa.test.<role>.<ts> pattern`,
      )
    }
  }

  if (init?.body && typeof init.body === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(init.body)
    } catch {
      // not JSON — skip body scan
    }
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if ((USERNAME_KEYS as readonly string[]).includes(key.toLowerCase())) {
          if (typeof value === 'string' && !QA_USERNAME_RX.test(value)) {
            throw new Error(
              `A15 GUARD: body.${key}="${value}" does not match qa.test pattern`,
            )
          }
        }
      }
    }
  }

  return fetch(u.toString(), init)
}
