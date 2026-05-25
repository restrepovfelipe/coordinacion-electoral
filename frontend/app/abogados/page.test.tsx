import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

vi.mock('@/lib/api/abogados', () => ({
  createAbogado: vi.fn(),
  patchAbogado: vi.fn(),
  deleteAbogado: vi.fn(),
}))

vi.mock('@/lib/api/ref-data', () => ({
  useMunicipios: vi.fn(() => ({ data: undefined })),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
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
    useQueryClient: () => ({ invalidateQueries: vi.fn(), clear: vi.fn() }),
  }
})

import { useAuth } from '@/lib/auth/use-auth'
import { useMunicipios } from '@/lib/api/ref-data'
import AbogadosPage from './page'

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseMunicipios = vi.mocked(useMunicipios)

describe('AbogadosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseMunicipios.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useMunicipios>)
  })

  it('shows access denied for PUESTO_COORDINATOR', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'PUESTO_COORDINATOR' }, role: 'PUESTO_COORDINATOR', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)

    render(<AbogadosPage />)

    expect(screen.getByText('No tienes acceso para gestionar abogados.')).toBeInTheDocument()
  })

  it('renders add form for MUNICIPAL_COORDINATOR', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'MUNICIPAL_COORDINATOR' }, role: 'MUNICIPAL_COORDINATOR', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)
    mockedUseMunicipios.mockReturnValue({
      data: [{ id: 1, name: 'Medellín', subregionId: 1 }],
    } as unknown as ReturnType<typeof useMunicipios>)

    render(<AbogadosPage />)

    expect(screen.getByText('Agregar abogado')).toBeInTheDocument()
    expect(screen.getByText('Medellín')).toBeInTheDocument()
  })

  it('renders manage form for SUPER_ADMIN', () => {
    mockedUseAuth.mockReturnValue({ user: { role: 'SUPER_ADMIN' }, role: 'SUPER_ADMIN', loading: false, signIn: vi.fn(), signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>)

    render(<AbogadosPage />)

    expect(screen.getByText('Agregar abogado')).toBeInTheDocument()
  })
})
