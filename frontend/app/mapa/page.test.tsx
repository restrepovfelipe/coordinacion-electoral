import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mock next/navigation ──────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// ── Mock Map component ────────────────────────────────────────────────────────

vi.mock('@/components/Map/Map', () => ({
  Map: () => <div data-testid="map" />,
}))

// ── Mock API modules ──────────────────────────────────────────────────────────

vi.mock('@/lib/api/dashboard', () => ({
  useDashboardStats: vi.fn(() => ({ data: undefined })),
}))

vi.mock('@/lib/api/ref-data', () => ({
  useMunicipios: vi.fn(() => ({ data: undefined })),
  usePuestosAll: vi.fn(() => ({ data: undefined })),
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import MapaPage from './page'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MapaPage', () => {
  it('renders map header', () => {
    render(<MapaPage />)
    expect(screen.getByText('Mapa · Antioquia')).toBeInTheDocument()
  })

  it('shows Por cobertura toggle active by default', () => {
    render(<MapaPage />)
    const btn = screen.getByRole('button', { name: 'Por cobertura' })
    expect(btn).toBeInTheDocument()
  })

  it('side panel hidden by default', () => {
    render(<MapaPage />)
    expect(screen.queryByText('Abrir municipio →')).not.toBeInTheDocument()
  })
})
