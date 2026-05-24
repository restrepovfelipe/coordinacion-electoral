import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({
    user: { displayName: 'Test User', email: 'test@defensores.local' },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('@/lib/api/dashboard', () => ({
  useSidebarCounts: () => ({
    data: { testigos: 3421, coordinadores: 64 },
    isLoading: false,
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// ── Test wrapper ───────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

import { Shell } from './Shell'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children', () => {
    render(
      <Shell>
        <p>hello</p>
      </Shell>,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('renders sidebar and topbar', () => {
    render(<Shell><span>content</span></Shell>, { wrapper: makeWrapper() })
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('topbar')).toBeInTheDocument()
  })

  it('Mobile drawer opens on hamburger click', () => {
    render(<Shell><span>content</span></Shell>, { wrapper: makeWrapper() })
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('hamburger'))
    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()
  })

  it('Mobile drawer closes on backdrop click', () => {
    render(<Shell><span>content</span></Shell>, { wrapper: makeWrapper() })
    fireEvent.click(screen.getByTestId('hamburger'))
    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
  })

  it('Escape key closes drawer', () => {
    render(<Shell><span>content</span></Shell>, { wrapper: makeWrapper() })
    fireEvent.click(screen.getByTestId('hamburger'))
    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
  })
})
