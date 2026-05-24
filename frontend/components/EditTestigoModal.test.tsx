import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

vi.mock('@/lib/api/testigos', () => ({
  patchTestigo: vi.fn(),
  deleteTestigo: vi.fn(),
}))

import { EditTestigoModal } from './EditTestigoModal'

const baseTestigo = {
  id: 1,
  name: 'Ana',
  cedula: '123',
  phone: '555',
  status: 'confirmado' as const,
  puestoId: null,
  notes: 'nota',
  mesaInicial: null,
  mesaFinal: null,
  createdAt: '',
  updatedAt: '',
}

describe('EditTestigoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders testigo fields pre-filled', () => {
    render(
      <EditTestigoModal
        testigo={baseTestigo}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()
    expect(screen.getByDisplayValue('123')).toBeInTheDocument()
    expect(screen.getByDisplayValue('555')).toBeInTheDocument()
    expect(screen.getByDisplayValue('confirmado')).toBeInTheDocument()
    expect(screen.getByDisplayValue('nota')).toBeInTheDocument()
  })

  it('shows delete confirmation on button click', () => {
    render(
      <EditTestigoModal
        testigo={baseTestigo}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: 'Eliminar testigo' })
    fireEvent.click(deleteBtn)

    expect(screen.getByText(/¿Eliminar a Ana\?/i)).toBeInTheDocument()
  })
})
