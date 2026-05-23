import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactNode } from 'react'

// Mock next/navigation
const mockPush = vi.fn()
const mockGet = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => ({ get: mockGet }),
}))

// Mock firebase auth + lib
vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('fake-id-token'),
  onAuthStateChanged: vi.fn((_a: unknown, cb: (u: null) => void) => { cb(null); return () => {} }),
}))
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
}))

// Mock auth context
const mockSignIn = vi.fn()
vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({ signIn: mockSignIn, signOut: vi.fn(), user: null, loading: false }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({ signIn: mockSignIn, signOut: vi.fn(), user: null, loading: false }),
}))

// Mock fetch for session cookie endpoint
global.fetch = vi.fn()

import LoginPage from './page'

function setup() {
  mockGet.mockReturnValue(null)
  return render(<LoginPage />)
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
  })

  it('renders Usuario and Contraseña fields', () => {
    setup()
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('submit button is disabled when fields are empty', () => {
    setup()
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeDisabled()
  })

  it('submit button enables when both fields are filled', async () => {
    setup()
    await userEvent.type(screen.getByLabelText(/usuario/i), 'juan.perez')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'secret')
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeEnabled()
  })

  it('calls signIn with username and password on submit', async () => {
    mockSignIn.mockResolvedValue(undefined)
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    setup()
    await userEvent.type(screen.getByLabelText(/usuario/i), 'juan.perez')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'secret')
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('juan.perez', 'secret')
    })
  })

  it('redirects to / after successful login', async () => {
    mockSignIn.mockResolvedValue(undefined)
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'fake-id-token' }),
    } as Response)

    setup()
    await userEvent.type(screen.getByLabelText(/usuario/i), 'juan.perez')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'secret')
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  it('redirects to ?from= path after successful login', async () => {
    mockGet.mockReturnValue('/testigos')
    mockSignIn.mockResolvedValue(undefined)
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)

    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText(/usuario/i), 'ana')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'pass')
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/testigos')
    })
  })

  it('shows Spanish error message on invalid credentials', async () => {
    mockSignIn.mockRejectedValue(new Error('auth/invalid-credential'))

    setup()
    await userEvent.type(screen.getByLabelText(/usuario/i), 'juan')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'wrong')
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      // Should NOT show raw Firebase error code
      expect(screen.queryByText(/auth\/invalid-credential/)).not.toBeInTheDocument()
    })
  })
})
