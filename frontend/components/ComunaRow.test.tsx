import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactNode } from 'react'
import { ComunaRow, ComunaRowData } from './ComunaRow'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/lib/api/ref-data', () => ({
  slugify: (text: string) => text.toLowerCase().replace(/\s+/g, '-'),
}))

const base: ComunaRowData = {
  id: 2,
  nombre: 'La Candelaria',
  municipioId: 10,
  zonaId: 1,
  puestosCount: 4,
  mesasCount: 40,
  mesasAsignadas: 20,
  coberturaPct: 50,
  testigosTotal: 80,
  sinTestigo: 15,
  coordinadorNombre: 'Luis Pérez',
  estado: 'ATENCION',
}

describe('ComunaRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders comuna name', () => {
    render(<ComunaRow c={base} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText('La Candelaria')).toBeInTheDocument()
  })

  it('shows coord name when present', () => {
    render(<ComunaRow c={base} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument()
  })

  it('shows "Sin coordinador" when coordinadorNombre is null', () => {
    render(<ComunaRow c={{ ...base, coordinadorNombre: null }} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText(/Sin coordinador/)).toBeInTheDocument()
  })

  it('stats grid hidden when collapsed', () => {
    render(<ComunaRow c={base} expanded={false} onToggle={vi.fn()} />)
    expect(screen.queryByText('Puestos')).not.toBeInTheDocument()
  })

  it('stats grid visible when expanded', () => {
    render(<ComunaRow c={base} expanded={true} onToggle={vi.fn()} />)
    expect(screen.getByText('Puestos')).toBeInTheDocument()
    expect(screen.getByText('Mesas')).toBeInTheDocument()
    expect(screen.getByText('Sin testigo')).toBeInTheDocument()
    expect(screen.getByText('Testigos')).toBeInTheDocument()
    expect(screen.getByText('Cobertura')).toBeInTheDocument()
  })

  it('onToggle called on chevron click', () => {
    const onToggle = vi.fn()
    render(<ComunaRow c={base} expanded={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('coverage bar width matches coberturaPct%', () => {
    render(<ComunaRow c={base} expanded={true} onToggle={vi.fn()} />)
    const fill = document.querySelector('[data-testid="cov-fill"]')
    expect(fill).toHaveStyle({ width: '50%' })
  })
})
