import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockMutate = vi.fn()
const mockInvalidateQueries = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useMutation: vi.fn(() => ({
      mutate: mockMutate,
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
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

vi.mock('@/lib/api/ref-data', () => ({
  usePuestos: vi.fn(() => ({
    data: [
      { id: 1, nombre: 'IE Bello', mesas: 5, comunaId: 1, municipioId: 1, votosTotal: null },
      { id: 2, nombre: 'Colegio Sur', mesas: 3, comunaId: 1, municipioId: 1, votosTotal: null },
    ],
  })),
}))

vi.mock('@/lib/api/testigos', () => ({
  bulkAssignTestigos: vi.fn(),
}))

import { BulkAssignModal } from './BulkAssignModal'

describe('BulkAssignModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders modal with testigo count', () => {
    render(
      <BulkAssignModal
        testigoIds={[1, 2, 3]}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/3 testigos/)).toBeInTheDocument()
  })

  it('Asignar button disabled when no puesto selected', () => {
    render(
      <BulkAssignModal
        testigoIds={[1]}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const btn = screen.getByRole('button', { name: 'Asignar' })
    expect(btn).toBeDisabled()
  })
})
