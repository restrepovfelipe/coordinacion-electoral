import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactNode } from 'react'
import { ZonaRow, ZonaRowData } from './ZonaRow'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/lib/api/ref-data', () => ({
  slugify: (text: string) => text.toLowerCase().replace(/\s+/g, '-'),
}))

const base: ZonaRowData = {
  id: 1,
  nombre: 'Zona Norte',
  municipioId: 10,
  puestosCount: 5,
  mesasCount: 50,
  mesasAsignadas: 30,
  coberturaPct: 60,
  testigosTotal: 120,
  sinTestigo: 10,
  coordinadorNombre: 'Ana García',
  coordinadorTelefono: '3001234567',
  estado: 'CUBIERTO',
}

describe('ZonaRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders zona name', () => {
    render(<ZonaRow z={base} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Zona Norte')).toBeInTheDocument()
  })

  it('shows coord name when present', () => {
    render(<ZonaRow z={base} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Ana García')).toBeInTheDocument()
  })

  it('shows "Sin coordinador" when coordinadorNombre is null', () => {
    render(<ZonaRow z={{ ...base, coordinadorNombre: null }} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText(/Sin coordinador/)).toBeInTheDocument()
  })

  it('stats grid hidden when collapsed', () => {
    render(<ZonaRow z={base} expanded={false} onToggle={vi.fn()} />)
    expect(screen.queryByText('Puestos')).not.toBeInTheDocument()
  })

  it('stats grid visible when expanded', () => {
    render(<ZonaRow z={base} expanded={true} onToggle={vi.fn()} />)
    expect(screen.getByText('Puestos')).toBeInTheDocument()
    expect(screen.getByText('Mesas')).toBeInTheDocument()
    expect(screen.getByText('Sin testigo')).toBeInTheDocument()
    expect(screen.getByText('Testigos')).toBeInTheDocument()
    expect(screen.getByText('Cobertura')).toBeInTheDocument()
  })

  it('onToggle called on chevron click', () => {
    const onToggle = vi.fn()
    render(<ZonaRow z={base} expanded={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('coverage bar width matches coberturaPct%', () => {
    render(<ZonaRow z={base} expanded={true} onToggle={vi.fn()} />)
    const fill = document.querySelector('[data-testid="cov-fill"]')
    expect(fill).toHaveStyle({ width: '60%' })
  })
})
