import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

vi.mock('@/lib/api/ref-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/ref-data')>()
  return { ...actual }
})

vi.mock('@/lib/api/usuarios', () => ({
  createUser: vi.fn(),
  getCascadeOptions: vi.fn(),
  useUsers: vi.fn(),
  patchUser: vi.fn(),
}))

const mockInvalidateQueries = vi.fn()
const mockMutate = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
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

import { useQuery } from '@tanstack/react-query'
import CreateUserModal from './CreateUserModal'

const mockedUseQuery = vi.mocked(useQuery)

const defaultProps = {
  onSuccess: vi.fn(),
  onClose: vi.fn(),
}

describe('CreateUserModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseQuery.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
  })

  it('renders all required fields', () => {
    render(<CreateUserModal {...defaultProps} />)

    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rol/i)).toBeInTheDocument()
  })

  it('Crear button disabled when form is empty', () => {
    render(<CreateUserModal {...defaultProps} />)

    const crearBtn = screen.getByRole('button', { name: /crear/i })
    expect(crearBtn).toBeDisabled()
  })

  it('shows cascade scope picker for MUNICIPAL_COORDINATOR role', async () => {
    mockedUseQuery.mockReturnValue({
      data: {
        scopeType: 'MUNICIPIO',
        needsMunicipio: false,
        items: [{ id: 1, name: 'Medellín' }],
        preselect: null,
      },
      isLoading: false,
    } as ReturnType<typeof useQuery>)

    render(<CreateUserModal {...defaultProps} />)

    const rolSelect = screen.getByLabelText(/rol/i)
    await userEvent.selectOptions(rolSelect, 'MUNICIPAL_COORDINATOR')

    await waitFor(() => {
      expect(screen.getByText(/ámbito/i)).toBeInTheDocument()
    })
  })

  it('filters scope items when typing in combobox', async () => {
    const baseData = {
      scopeType: 'PUESTO',
      needsMunicipio: true,
      items: [{ id: 1, name: 'Medellín' }],
      preselect: null,
    }
    const childData = {
      scopeType: 'PUESTO',
      needsMunicipio: false,
      items: [
        { id: 1, name: 'IE Andrés Bello' },
        { id: 2, name: 'C.E. La Paz' },
        { id: 3, name: 'IE Marco Fidel Suárez' },
      ],
      preselect: null,
    }

    // Use mockImplementation to distinguish base vs child query by queryKey
    mockedUseQuery.mockImplementation((opts: Parameters<typeof useQuery>[0]) => {
      const key = opts.queryKey as unknown[]
      // child query has 3 elements in key: ['cascade-options', role, municipioId]
      if (key.length === 3 && key[2] !== undefined) {
        return { data: childData, isLoading: false } as ReturnType<typeof useQuery>
      }
      // base query has 2 elements: ['cascade-options', role]
      if (key[0] === 'cascade-options') {
        return { data: baseData, isLoading: false } as ReturnType<typeof useQuery>
      }
      return { data: undefined, isLoading: false } as ReturnType<typeof useQuery>
    })

    render(<CreateUserModal {...defaultProps} />)

    // Select PUESTO_COORDINATOR role
    const rolSelect = screen.getByLabelText(/rol/i)
    await userEvent.selectOptions(rolSelect, 'PUESTO_COORDINATOR')

    // Municipio select should appear (base data has needsMunicipio: true)
    await waitFor(() => {
      expect(screen.getByLabelText(/municipio/i)).toBeInTheDocument()
    })

    // Select municipio
    const municipioSelect = screen.getByLabelText(/municipio/i)
    await userEvent.selectOptions(municipioSelect, '1')

    // Child combobox search input should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar/i)).toBeInTheDocument()
    })

    // Initially all items visible
    expect(screen.getByText('IE Andrés Bello')).toBeInTheDocument()
    expect(screen.getByText('C.E. La Paz')).toBeInTheDocument()

    // Type "Andrés" — only matching item should show
    const searchInput = screen.getByPlaceholderText(/buscar/i)
    await userEvent.type(searchInput, 'Andrés')

    await waitFor(() => {
      expect(screen.getByText('IE Andrés Bello')).toBeInTheDocument()
      expect(screen.queryByText('C.E. La Paz')).not.toBeInTheDocument()
    })

    // Clear and type a term that matches nothing
    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, 'xyzqq')

    await waitFor(() => {
      expect(screen.getByText(/no hay resultados/i)).toBeInTheDocument()
    })
  })
})
