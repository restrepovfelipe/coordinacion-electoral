import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mock the API module ───────────────────────────────────────────────────────

const mockGetCoordinadorDisplay = vi.fn()
const mockPatchCoordinadorAdhoc = vi.fn()

vi.mock('@/lib/api/coordinador', () => ({
  getCoordinadorDisplay: (...args: unknown[]) => mockGetCoordinadorDisplay(...args),
  patchCoordinadorAdhoc: (...args: unknown[]) => mockPatchCoordinadorAdhoc(...args),
}))

// ── Mock react-query ──────────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

import { useQuery, useMutation } from '@tanstack/react-query'
import { CoordinatorWidget } from './CoordinatorWidget'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupMutation(overrides: Partial<ReturnType<typeof useMutation>> = {}) {
  mockedUseMutation.mockReturnValue({
    mutate: vi.fn(),
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

describe('CoordinatorWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMutation()
  })

  it('source=user: renders nombre and telefono, no edit button', () => {
    mockedUseQuery.mockReturnValue({
      data: { source: 'user', nombre: 'María López', telefono: '3009876543', userId: 5 },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    render(<CoordinatorWidget scopeType="zona" scopeId={1} canEdit={true} />)

    expect(screen.getByText('María López')).toBeInTheDocument()
    expect(screen.getByText('3009876543')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })

  it('source=none, canEdit=false: renders "Sin coordinador", no edit button', () => {
    mockedUseQuery.mockReturnValue({
      data: { source: 'none', nombre: null, telefono: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    render(<CoordinatorWidget scopeType="zona" scopeId={1} canEdit={false} />)

    expect(screen.getByText(/Sin coordinador/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('source=none, canEdit=true: renders pencil button', () => {
    mockedUseQuery.mockReturnValue({
      data: { source: 'none', nombre: null, telefono: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    render(<CoordinatorWidget scopeType="zona" scopeId={1} canEdit={true} />)

    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument()
  })

  it('source=adhoc, canEdit=true: opens inline form on pencil click', () => {
    mockedUseQuery.mockReturnValue({
      data: { source: 'adhoc', nombre: 'Carlos Ruiz', telefono: '3112223334' },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    render(<CoordinatorWidget scopeType="municipio" scopeId={2} canEdit={true} />)

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    expect(screen.getByRole('textbox', { name: /nombre/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /teléfono/i })).toBeInTheDocument()
  })

  it('Save calls patchCoordinadorAdhoc with correct args', async () => {
    let capturedMutationFn: (vars: { nombre: string; telefono: string }) => Promise<unknown>

    mockedUseMutation.mockImplementation((opts) => {
      capturedMutationFn = (opts.mutationFn as unknown) as typeof capturedMutationFn
      return {
        mutate: (vars: unknown) => (opts.mutationFn as unknown as (v: unknown) => unknown)?.(vars),
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
      } as ReturnType<typeof useMutation>
    })

    mockedUseQuery.mockReturnValue({
      data: { source: 'none', nombre: null, telefono: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    mockPatchCoordinadorAdhoc.mockResolvedValue({ source: 'adhoc', nombre: 'Nuevo', telefono: '300' })

    render(<CoordinatorWidget scopeType="zona" scopeId={5} canEdit={true} />)

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    const nombreInput = screen.getByRole('textbox', { name: /nombre/i })
    const telefonoInput = screen.getByRole('textbox', { name: /teléfono/i })

    fireEvent.change(nombreInput, { target: { value: 'Nuevo' } })
    fireEvent.change(telefonoInput, { target: { value: '300' } })

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    // The mutation fn should delegate to patchCoordinadorAdhoc
    await capturedMutationFn!({ nombre: 'Nuevo', telefono: '300' })
    expect(mockPatchCoordinadorAdhoc).toHaveBeenCalledWith('zona', 5, { nombre: 'Nuevo', telefono: '300' })
  })

  it('409 response shows error alert with Spanish message', async () => {
    const mutateFn = vi.fn()
    let onErrorCallback: ((err: Error) => void) | undefined

    mockedUseMutation.mockImplementation((opts) => {
      onErrorCallback = opts.onError as ((err: Error) => void) | undefined
      return {
        mutate: mutateFn,
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
      } as ReturnType<typeof useMutation>
    })

    mockedUseQuery.mockReturnValue({
      data: { source: 'none', nombre: null, telefono: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    render(<CoordinatorWidget scopeType="zona" scopeId={1} canEdit={true} />)

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    // Simulate 409 error via onError callback
    const err = Object.assign(new Error('Conflict'), { status: 409 })
    onErrorCallback?.(err)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(/Ya existe un coordinador asignado/)
    })
  })

  it('Cancel closes the form', () => {
    mockedUseQuery.mockReturnValue({
      data: { source: 'none', nombre: null, telefono: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>)

    render(<CoordinatorWidget scopeType="zona" scopeId={1} canEdit={true} />)

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(screen.getByRole('textbox', { name: /nombre/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByRole('textbox', { name: /nombre/i })).not.toBeInTheDocument()
  })
})
