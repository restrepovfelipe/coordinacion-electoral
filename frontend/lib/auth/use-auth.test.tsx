import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({}),
  signOut: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => {
    cb(null)
    return () => {}
  }),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

import { signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'
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
