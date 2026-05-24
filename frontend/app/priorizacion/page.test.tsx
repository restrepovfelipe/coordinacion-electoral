import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mock next/link ────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// ── Mock API modules ──────────────────────────────────────────────────────────

vi.mock('@/lib/api/dashboard', () => ({
  usePrioPuestos: vi.fn(() => ({
    data: { items: [], total: 0, page: 1 },
    isLoading: false,
  })),
}))

vi.mock('@/lib/api/ref-data', () => ({
  useSubregiones: vi.fn(() => ({ data: [] })),
  useMunicipios: vi.fn(() => ({ data: [] })),
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { usePrioPuestos } from '@/lib/api/dashboard'
import PriorizacionPage from './page'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PriorizacionPage', () => {
  it('renders page heading', () => {
    render(<PriorizacionPage />)
    expect(screen.getByText('Puestos prioritarios')).toBeInTheDocument()
  })

  it('renders ranked rows', () => {
    vi.mocked(usePrioPuestos).mockReturnValueOnce({
      data: {
        items: [
          {
            puestoId: 1,
            puestoNombre: 'IE Andrés Bello',
            municipioNombre: 'Medellín',
            comunaNombre: 'Comuna 1',
            mesas: 18,
            mesasAsignadas: 0,
            coberturaPct: 0,
            testigosAsignados: 0,
            votosTotal: 6420,
            estado: 'CRITICO',
            municipioId: 1,
            comunaId: 1,
            nivelPrioridad: 'ALTA',
          },
          {
            puestoId: 2,
            puestoNombre: 'IE La América',
            municipioNombre: 'Medellín',
            comunaNombre: 'Comuna 2',
            mesas: 12,
            mesasAsignadas: 3,
            coberturaPct: 25,
            testigosAsignados: 3,
            votosTotal: 4200,
            estado: 'ATENCION',
            municipioId: 1,
            comunaId: 2,
            nivelPrioridad: 'MEDIA',
          },
        ],
        total: 2,
        page: 1,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof usePrioPuestos>)

    render(<PriorizacionPage />)

    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('IE Andrés Bello')).toBeInTheDocument()
  })

  it('top N selector renders', () => {
    render(<PriorizacionPage />)
    expect(screen.getByRole('option', { name: 'Top 10' })).toBeInTheDocument()
  })
})
