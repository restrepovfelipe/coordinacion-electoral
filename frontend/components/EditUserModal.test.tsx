import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppUser } from '@/lib/api/usuarios'

vi.mock('@/lib/api/usuarios', () => ({
  patchUser: vi.fn(),
  createUser: vi.fn(),
  getCascadeOptions: vi.fn(),
  useUsers: vi.fn(),
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

import EditUserModal from './EditUserModal'

const testUser: AppUser = {
  id: 1,
  username: 'testuser',
  displayName: 'Test User',
  phone: '555',
  notes: 'nota',
  role: 'MUNICIPAL_COORDINATOR',
  active: true,
  scopes: [],
  createdAt: '',
  lastLoginAt: null,
}

const defaultProps = {
  user: testUser,
  onSuccess: vi.fn(),
  onClose: vi.fn(),
}

describe('EditUserModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user data pre-filled', () => {
    render(<EditUserModal {...defaultProps} />)

    const displayNameInput = screen.getByLabelText(/nombre completo/i) as HTMLInputElement
    expect(displayNameInput.value).toBe('Test User')
  })

  it('username field is read-only', () => {
    render(<EditUserModal {...defaultProps} />)

    expect(screen.getByText('testuser')).toBeInTheDocument()
    const inputs = screen.queryAllByDisplayValue('testuser')
    expect(inputs.length).toBe(0)
  })

  it('password field not shown by default', () => {
    render(<EditUserModal {...defaultProps} />)

    expect(screen.queryByPlaceholderText(/nueva contraseña/i)).not.toBeInTheDocument()
  })

  it('reveals password input when checkbox checked', async () => {
    render(<EditUserModal {...defaultProps} />)

    const checkbox = screen.getByLabelText(/cambiar contraseña/i)
    await userEvent.click(checkbox)

    expect(screen.getByPlaceholderText(/nueva contraseña/i)).toBeInTheDocument()
  })
})
