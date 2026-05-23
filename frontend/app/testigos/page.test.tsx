import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: vi.fn(() => ({ user: { role: 'SUPER_ADMIN' } })),
}))

vi.mock('@/lib/api/testigos', () => ({
  useTestigos: vi.fn(() => ({ data: undefined, isLoading: true })),
}))

vi.mock('@/lib/api/ref-data', () => ({
  useMunicipios: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/components/Kpi', () => ({
  KpiStrip: () => null,
}))

vi.mock('@/components/Tag', () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/EditTestigoModal', () => ({
  EditTestigoModal: () => null,
}))

vi.mock('@/components/BulkAssignModal', () => ({
  BulkAssignModal: () => null,
}))

import { useAuth } from '@/lib/auth/use-auth'
import { useTestigos } from '@/lib/api/testigos'
import TestigosPage from './page'

describe('TestigosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'SUPER_ADMIN' } } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useTestigos).mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useTestigos>)
  })

  it('shows access denied for non-admin role', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'PUESTO_COORDINATOR' } } as unknown as ReturnType<typeof useAuth>)

    render(<TestigosPage />)

    expect(screen.getByText('No tienes acceso a esta sección.')).toBeInTheDocument()
  })

  it('renders testigo rows for admin', () => {
    vi.mocked(useTestigos).mockReturnValue({
      data: {
        data: [
          {
            id: 1,
            name: 'Carlos López',
            cedula: '99999',
            status: 'confirmado',
            puestoId: 5,
            phone: null,
            notes: null,
            mesaInicial: 1,
            mesaFinal: 3,
            createdAt: '',
            updatedAt: '',
            puesto: { id: 5, name: 'IE Bello', municipioId: 1 },
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useTestigos>)

    render(<TestigosPage />)

    expect(screen.getByText('Carlos López')).toBeInTheDocument()
  })

  it('shows sin puesto text when puestoId is null', () => {
    vi.mocked(useTestigos).mockReturnValue({
      data: {
        data: [
          {
            id: 2,
            name: 'Sin Puesto User',
            cedula: null,
            status: 'pendiente',
            puestoId: null,
            phone: null,
            notes: null,
            mesaInicial: null,
            mesaFinal: null,
            createdAt: '',
            updatedAt: '',
            puesto: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useTestigos>)

    render(<TestigosPage />)

    expect(screen.getAllByText('Sin puesto').length).toBeGreaterThan(0)
  })

  it('pagination controls are present', () => {
    vi.mocked(useTestigos).mockReturnValue({
      data: {
        data: [],
        total: 100,
        page: 1,
        limit: 50,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useTestigos>)

    render(<TestigosPage />)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
  })
})
