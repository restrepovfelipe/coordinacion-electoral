import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

vi.mock('@/lib/api/usuarios', () => ({
  useUsers: vi.fn(() => ({ data: undefined, isLoading: true })),
  createUser: vi.fn(),
  patchUser: vi.fn(),
  getCascadeOptions: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      isIdle: true,
      error: null,
      data: undefined,
      reset: vi.fn(),
      status: 'idle',
    })),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

vi.mock('@/components/CreateUserModal', () => ({
  default: () => null,
}))

vi.mock('@/components/EditUserModal', () => ({
  default: () => null,
}))

import { useAuth } from '@/lib/auth/use-auth'
import { useUsers } from '@/lib/api/usuarios'
import UsuariosPage from './page'

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseUsers = vi.mocked(useUsers)

describe('UsuariosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows access denied for PUESTO_COORDINATOR role', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'PUESTO_COORDINATOR' }, role: 'PUESTO_COORDINATOR', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)
    mockedUseUsers.mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<typeof useUsers>)

    render(<UsuariosPage />)

    expect(screen.getByText('No tienes acceso')).toBeInTheDocument()
  })

  it('renders user rows for SUPER_ADMIN', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'SUPER_ADMIN' }, role: 'SUPER_ADMIN', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)
    mockedUseUsers.mockReturnValue({
      data: {
        data: [
          {
            id: 1,
            username: 'admin1',
            displayName: 'Admin One',
            role: 'SUPER_ADMIN',
            active: true,
            scopes: [],
            createdAt: '2024-01-01',
            lastLoginAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useUsers>)

    render(<UsuariosPage />)

    expect(screen.getByText('Admin One')).toBeInTheDocument()
    expect(screen.getByText('admin1')).toBeInTheDocument()
  })

  it('Crear usuario button is visible for admin', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'SUPER_ADMIN' }, role: 'SUPER_ADMIN', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)
    mockedUseUsers.mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 20 },
      isLoading: false,
    } as unknown as ReturnType<typeof useUsers>)

    render(<UsuariosPage />)

    expect(screen.getByRole('button', { name: /crear usuario/i })).toBeInTheDocument()
  })

  it('shows Inactivo tag for inactive user', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'SUPER_ADMIN' }, role: 'SUPER_ADMIN', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)
    mockedUseUsers.mockReturnValue({
      data: {
        data: [
          {
            id: 2,
            username: 'inactivo1',
            displayName: 'Usuario Inactivo',
            role: 'MUNICIPAL_COORDINATOR',
            active: false,
            scopes: [],
            createdAt: '2024-01-01',
            lastLoginAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useUsers>)

    render(<UsuariosPage />)

    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })
})
