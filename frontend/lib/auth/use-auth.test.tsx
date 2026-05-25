import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Default: onAuthStateChanged returns null (logged out)
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({}),
  signOut: vi.fn().mockResolvedValue(undefined),
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => {
    cb(null)
    return () => {}
  }),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { AuthProvider, useAuth } from './auth-context'

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
  }
}

describe('useAuth — signIn', () => {
  it('passes synthetic email (username@defensores.local) to Firebase', async () => {
    const qc = new QueryClient()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })
    await act(() => result.current.signIn('juan.perez', 'secret'))
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'juan.perez@defensores.local',
      'secret',
    )
  })

  it('preserves the password as-is', async () => {
    const qc = new QueryClient()
    vi.mocked(signInWithEmailAndPassword).mockClear()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })
    await act(() => result.current.signIn('any', 'P@ss#2026!'))
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'any@defensores.local',
      'P@ss#2026!',
    )
  })
})

describe('useAuth — signOut', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
  })

  it('calls DELETE /api/auth/session', async () => {
    const qc = new QueryClient()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })
    await act(() => result.current.signOut())
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/session', { method: 'DELETE' })
  })

  it('calls Firebase signOut', async () => {
    const qc = new QueryClient()
    vi.mocked(firebaseSignOut).mockClear()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })
    await act(() => result.current.signOut())
    expect(firebaseSignOut).toHaveBeenCalled()
  })

  it('clears the TanStack Query cache', async () => {
    const qc = new QueryClient()
    const clearSpy = vi.spyOn(qc, 'clear')
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })
    await act(() => result.current.signOut())
    expect(clearSpy).toHaveBeenCalled()
  })
})

describe('useAuth — role from /auth/me', () => {
  it('sets role to SUPER_ADMIN when /auth/me returns it', async () => {
    // Mock onAuthStateChanged to return a non-null user
    vi.mocked(onAuthStateChanged).mockImplementationOnce(
      (_auth: unknown, cb: (u: { uid: string } | null) => void) => {
        cb({ uid: 'user-1' })
        return () => {}
      },
    )

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ role: 'SUPER_ADMIN' }),
    } as unknown as Response)

    const qc = new QueryClient()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })

    // Wait until loading is done and role is populated
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.role).toBe('SUPER_ADMIN')
    // Verify it actually fetched /auth/me with Bearer token
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }) }),
    )
  })

  it('sets role to null when /auth/me returns non-ok status', async () => {
    vi.mocked(onAuthStateChanged).mockImplementationOnce(
      (_auth: unknown, cb: (u: { uid: string } | null) => void) => {
        cb({ uid: 'user-1' })
        return () => {}
      },
    )

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response)

    const qc = new QueryClient()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.role).toBeNull()
  })

  it('sets role to null when user is logged out', async () => {
    // Default mock returns null user
    const qc = new QueryClient()
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.role).toBeNull()
  })
})
