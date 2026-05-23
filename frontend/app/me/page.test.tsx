import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactNode } from 'react'

const mockPush = vi.fn()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_a: unknown, cb: (u: null) => void) => { cb(null); return () => {} }),
}))
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
}))

const mockSignOut = vi.fn()
vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({
    user: { displayName: 'Juan Pérez', email: 'juan.perez@defensores.local' },
    signOut: mockSignOut,
    signIn: vi.fn(),
    loading: false,
  }),
}))
vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({
    user: { displayName: 'Juan Pérez', email: 'juan.perez@defensores.local' },
    signOut: mockSignOut,
    signIn: vi.fn(),
    loading: false,
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

global.fetch = vi.fn()

import MePage from './page'

describe('MePage — field whitelist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)
  })

  it('renders nombre field', () => {
    render(<MePage />)
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument()
  })

  it('renders teléfono field', () => {
    render(<MePage />)
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument()
  })

  it('renders contraseña nueva field (optional)', () => {
    render(<MePage />)
    expect(screen.getByLabelText(/contraseña nueva/i)).toBeInTheDocument()
  })

  it('does NOT render a role field', () => {
    render(<MePage />)
    expect(screen.queryByLabelText(/rol/i)).not.toBeInTheDocument()
  })

  it('does NOT render a scope field', () => {
    render(<MePage />)
    expect(screen.queryByLabelText(/ámbito|alcance|scope/i)).not.toBeInTheDocument()
  })
})

describe('MePage — PATCH /api/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)
  })

  it('sends nombre and telefono without password when password is empty', async () => {
    render(<MePage />)

    const nombreInput = screen.getByLabelText(/nombre/i)
    const telInput = screen.getByLabelText(/teléfono/i)

    await userEvent.clear(nombreInput)
    await userEvent.type(nombreInput, 'Ana López')
    await userEvent.clear(telInput)
    await userEvent.type(telInput, '3001234567')

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls
      const patchCall = calls.find(([url]) => String(url).includes('/api/users/me'))
      expect(patchCall).toBeDefined()
      const body = JSON.parse(patchCall![1]!.body as string)
      expect(body).toHaveProperty('nombre')
      expect(body).toHaveProperty('telefono')
      expect(body).not.toHaveProperty('password')
    })
  })

  it('includes password in payload when a new password is typed', async () => {
    render(<MePage />)

    const pwInput = screen.getByLabelText(/contraseña nueva/i)
    await userEvent.type(pwInput, 'NewPass2026!')

    const nombreInput = screen.getByLabelText(/nombre/i)
    if (!nombreInput.getAttribute('value')) {
      await userEvent.type(nombreInput, 'Test')
    }

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls
      const patchCall = calls.find(([url]) => String(url).includes('/api/users/me'))
      expect(patchCall).toBeDefined()
      const body = JSON.parse(patchCall![1]!.body as string)
      expect(body).toHaveProperty('password', 'NewPass2026!')
    })
  })

  it('does NOT include role or scope in payload', async () => {
    render(<MePage />)
    const nombreInput = screen.getByLabelText(/nombre/i)
    await userEvent.type(nombreInput, 'Test')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls
      const patchCall = calls.find(([url]) => String(url).includes('/api/users/me'))
      if (patchCall) {
        const body = JSON.parse(patchCall[1]!.body as string)
        expect(body).not.toHaveProperty('role')
        expect(body).not.toHaveProperty('scope')
      }
    })
  })
})

describe('MePage — logout flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls signOut on logout button click', async () => {
    mockSignOut.mockResolvedValue(undefined)
    render(<MePage />)

    const logoutBtn = screen.getByRole('button', { name: /cerrar sesión|salir|logout/i })
    fireEvent.click(logoutBtn)

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  it('redirects to /login after logout', async () => {
    mockSignOut.mockResolvedValue(undefined)
    render(<MePage />)

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión|salir|logout/i }))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })
})
