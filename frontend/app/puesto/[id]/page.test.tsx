import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mock next/navigation ──────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ── Mock react (use hook) ─────────────────────────────────────────────────────

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    use: (_p: Promise<unknown>) => ({ id: '5' }),
  }
})

// ── Mock react-query ──────────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn()
const mockMutate = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

// ── Mock API modules ──────────────────────────────────────────────────────────

vi.mock('@/lib/api/dashboard', () => ({
  usePrioPuestos: vi.fn(() => ({
    data: {
      items: [
        {
          puestoId: 5,
          puestoNombre: 'IE Bello',
          mesas: 10,
          mesasAsignadas: 7,
          coberturaPct: 70,
          testigosAsignados: 7,
          estado: 'ATENCION',
          municipioId: 1,
          municipioNombre: 'Medellín',
          comunaId: null,
          comunaNombre: null,
          votosTotal: 500,
          nivelPrioridad: 'MEDIA',
        },
      ],
    },
  })),
}))

vi.mock('@/lib/api/testigos', () => ({
  getTestigosByPuesto: vi.fn(),
  recalcularAsignacion: vi.fn(),
  getAsignacionPdf: vi.fn(),
  useTestigosByPuesto: vi.fn(() => ({
    data: [
      {
        id: 1,
        name: 'Ana García',
        status: 'confirmado',
        puestoId: 5,
        cedula: '12345',
        phone: null,
        notes: null,
        mesaInicial: 1,
        mesaFinal: 3,
        createdAt: '',
        updatedAt: '',
      },
    ],
  })),
}))

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({ user: { role: 'SUPER_ADMIN' } }),
}))

vi.mock('@/lib/api/ref-data', () => ({
  useMunicipios: vi.fn(() => ({ data: [] })),
  useSubregiones: vi.fn(() => ({ data: [] })),
  slugify: (s: string) => s.toLowerCase(),
}))

vi.mock('@/components/CoordinatorWidget', () => ({
  CoordinatorWidget: () => null,
}))

vi.mock('@/components/Kpi', () => ({
  KpiStrip: () => null,
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useQuery, useMutation } from '@tanstack/react-query'
import { usePrioPuestos } from '@/lib/api/dashboard'
import PuestoPage from './page'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

function setupDefaultMutation(overrides: Partial<ReturnType<typeof useMutation>> = {}) {
  mockedUseMutation.mockReturnValue({
    mutate: mockMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    isIdle: true,
    error: null,
    data: undefined,
    reset: vi.fn(),
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
    ...overrides,
  } as ReturnType<typeof useMutation>)
}

function setupDefaultQuery(data: unknown = []) {
  mockedUseQuery.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useQuery>)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PuestoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMutation()
    setupDefaultQuery([])
  })

  it('renders "Puesto" heading when prioPuesto is not found', () => {
    vi.mocked(usePrioPuestos).mockReturnValueOnce({ data: { items: [] } } as unknown as ReturnType<typeof usePrioPuestos>)

    render(<PuestoPage params={Promise.resolve({ id: '5' })} />)

    expect(screen.getByText(/puesto no encontrado/i)).toBeInTheDocument()
  })

  it('renders testigos table when data loads', () => {
    setupDefaultQuery([
      {
        id: 1,
        name: 'Ana García',
        status: 'confirmado',
        puestoId: 5,
        cedula: '12345',
        phone: null,
        notes: null,
        mesaInicial: 1,
        mesaFinal: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])

    render(<PuestoPage params={Promise.resolve({ id: '5' })} />)

    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.getByText('12345')).toBeInTheDocument()
    expect(screen.getByText('1–3')).toBeInTheDocument()
  })

  it('shows A16 assignment summary when prioPuesto is available', () => {
    setupDefaultQuery([])

    render(<PuestoPage params={Promise.resolve({ id: '5' })} />)

    expect(screen.getByText(/7 testigos asignados/)).toBeInTheDocument()
    expect(screen.getByText(/7 mesas cubiertas de 10 totales/)).toBeInTheDocument()
    expect(screen.getByText(/70% cobertura/)).toBeInTheDocument()
    expect(screen.getByText(/3 mesas sin asignar/)).toBeInTheDocument()
  })

  it('shows Recalcular button for admin role', () => {
    setupDefaultQuery([])

    render(<PuestoPage params={Promise.resolve({ id: '5' })} />)

    expect(screen.getByRole('button', { name: /recalcular asignaciones/i })).toBeInTheDocument()
  })
})
