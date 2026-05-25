import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock firebase modules before importing api
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
}))
vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}))

import { api, ApiError } from './api'

describe('api 401 handler', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // Reset location mock before each test
    Object.defineProperty(window, 'location', {
      value: { replace: vi.fn(), pathname: '/dashboard' },
      writable: true,
    })

    global.fetch = vi.fn()
  })

  it('redirects to /login?reason=session on 401', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 401,
      ok: false,
    } as Response)

    await expect(
      api.get('/api/test', { parse: (v: unknown) => v } as any),
    ).rejects.toThrow(ApiError)

    expect(window.location.replace).toHaveBeenCalledWith(
      expect.stringContaining('reason=session'),
    )
  })

  it('redirect URL includes reason=session — MUST FAIL if reason param is removed', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 401,
      ok: false,
    } as Response)

    await expect(
      api.get('/api/test', { parse: (v: unknown) => v } as any),
    ).rejects.toThrow(ApiError)

    const redirectArg = (window.location.replace as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
    expect(redirectArg).toMatch(/reason=session/)
    expect(redirectArg).toMatch(/\/login/)
    // Crucially: must NOT trigger firebaseSignOut directly — that is the login page's job
    // (verified by the absence of any signOut call here — no firebase/auth signOut mock needed)
  })
})
