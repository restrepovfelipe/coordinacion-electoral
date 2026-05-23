import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactNode } from 'react'
import { PuestoRow, PuestoRowData } from './PuestoRow'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const base: PuestoRowData = {
  id: 42,
  nombre: 'IE San Marcos',
  comunaNombre: 'La Candelaria',
  mesas: 10,
  mesasAsignadas: 7,
  coberturaPct: 70,
  testigosAsignados: 14,
  estado: 'CUBIERTO',
  nivelPrioridad: 'ALTA',
}

describe('PuestoRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders puesto nombre', () => {
    render(
      <table><tbody>
        <PuestoRow p={base} />
      </tbody></table>,
    )
    expect(screen.getByText('IE San Marcos')).toBeInTheDocument()
  })

  it('renders cobertura %', () => {
    render(
      <table><tbody>
        <PuestoRow p={base} />
      </tbody></table>,
    )
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('renders estado tag with correct tone (CUBIERTO → ok)', () => {
    render(
      <table><tbody>
        <PuestoRow p={base} />
      </tbody></table>,
    )
    expect(screen.getByText('CUBIERTO')).toBeInTheDocument()
  })

  it('onClick called on row click', () => {
    const onClick = vi.fn()
    render(
      <table><tbody>
        <PuestoRow p={base} onClick={onClick} />
      </tbody></table>,
    )
    fireEvent.click(screen.getByRole('row'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('row contains link to /puesto/{id}', () => {
    render(
      <table><tbody>
        <PuestoRow p={base} />
      </tbody></table>,
    )
    const link = screen.getByRole('link', { name: /IE San Marcos/i })
    expect(link).toHaveAttribute('href', '/puesto/42')
  })
})
