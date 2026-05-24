'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  Map,
  Star,
  Users,
  ShieldCheck,
  Scale,
  UserCog,
  Upload,
  Database,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/use-auth'
import { useSidebarCounts } from '@/lib/api/dashboard'
import { useQueryClient } from '@tanstack/react-query'

// ── Role labels ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  REGIONAL_COORDINATOR: 'Coordinador Regional',
  MUNICIPAL_COORDINATOR: 'Coord. Municipal',
  ZONE_COORDINATOR: 'Coord. Zonal',
  COMUNA_COORDINATOR: 'Coord. Comunal',
  PUESTO_COORDINATOR: 'Coord. Puesto',
}

// ── Count formatter ────────────────────────────────────────────────────────────

function formatCount(n: number | undefined): string | null {
  if (n == null) return null
  return n >= 1000 ? n.toLocaleString('es-CO') : String(n)
}

// ── NavItem ────────────────────────────────────────────────────────────────────

type NavItemProps = {
  href: string
  icon: React.ReactNode
  label: string
  count?: number
  disabled?: boolean
  exact?: boolean
}

function NavItem({ href, icon, label, count, disabled = false, exact = false }: NavItemProps) {
  const path = usePathname()
  const isActive = exact ? path === href : href === '/' ? path === href : path.startsWith(href)
  const formattedCount = formatCount(count)

  if (disabled) {
    return (
      <span className="nav-item opacity-40 cursor-not-allowed select-none" aria-disabled="true">
        <span className="nav-icon">{icon}</span>
        <span>{label}</span>
      </span>
    )
  }

  return (
    <Link href={href} className={`nav-item ${isActive ? 'active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {formattedCount != null && (
        <span className="ml-auto font-mono text-[11px] text-text-3">{formattedCount}</span>
      )}
    </Link>
  )
}

// ── Initials helper ────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { user, signOut } = useAuth()
  const { data: counts } = useSidebarCounts()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const role = (user as { role?: string } | null)?.role ?? ''
  const roleLabel = ROLE_LABELS[role] ?? role
  const displayName = user?.displayName ?? user?.email ?? ''
  const initials = getInitials(displayName)

  const canSeeUsuarios =
    role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const exportEnabled =
    process.env.NEXT_PUBLIC_FEATURE_EXPORT !== 'false'

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  async function handleClearCache() {
    localStorage.clear()
    sessionStorage.clear()
    queryClient.clear()
    // Sign out via auth session endpoint
    try { await fetch('/api/auth/session', { method: 'DELETE' }) } catch {}
    window.location.replace('/login')
  }

  return (
    <aside className="sidebar" data-testid="sidebar">
      {/* Brand */}
      <div className="px-2 mb-3">
        <span className="text-[13px] font-semibold tracking-tightish text-text">CE</span>
        <span className="text-[13px] text-text-3 ml-1">Coordinación</span>
      </div>

      {/* First group (no section title) */}
      <nav className="flex flex-col gap-0.5">
        <NavItem href="/" icon={<Home size={15} strokeWidth={1.5} />} label="Dashboard" exact />
        <NavItem href="/mapa" icon={<Map size={15} strokeWidth={1.5} />} label="Mapa" />
        <NavItem
          href="/priorizacion"
          icon={<Star size={15} strokeWidth={1.5} />}
          label="Priorización"
        />
      </nav>

      {/* Section: GENTE */}
      <p className="nav-section-title mt-4">GENTE</p>
      <nav className="flex flex-col gap-0.5">
        <NavItem
          href="/coordinadores"
          icon={<Users size={15} strokeWidth={1.5} />}
          label="Coordinadores"
          count={counts?.coordinadores}
        />
        <NavItem
          href="/testigos"
          icon={<ShieldCheck size={15} strokeWidth={1.5} />}
          label="Testigos"
          count={counts?.testigos}
        />
        <NavItem
          href="/abogados"
          icon={<Scale size={15} strokeWidth={1.5} />}
          label="Abogados"
        />
        {canSeeUsuarios && (
          <NavItem
            href="/usuarios"
            icon={<UserCog size={15} strokeWidth={1.5} />}
            label="Usuarios"
          />
        )}
      </nav>

      {/* Section: DATOS */}
      <p className="nav-section-title mt-4">DATOS</p>
      <nav className="flex flex-col gap-0.5">
        <NavItem
          href="/exportar"
          icon={<Upload size={15} strokeWidth={1.5} />}
          label="Exportar"
          disabled={!exportEnabled}
        />
        {!showClearConfirm ? (
          <button className="nav-item w-full text-left" onClick={() => setShowClearConfirm(true)} type="button">
            <span className="nav-icon"><Database size={15} strokeWidth={1.5} /></span>
            <span>Limpiar caché</span>
          </button>
        ) : (
          <div className="px-2 py-2 text-[12px] bg-surface-2 rounded border border-border">
            <p className="text-text-3 mb-2">¿Borrar caché y cerrar sesión?</p>
            <div className="flex gap-1">
              <button type="button" className="btn btn-sm" onClick={handleClearCache}>Confirmar</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowClearConfirm(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex items-center gap-2 px-1 py-1 border-t border-border mt-2 pt-2.5">
        <span className="avatar avatar-accent shrink-0">{initials}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-text truncate leading-tight">
            {displayName}
          </p>
          {roleLabel && (
            <p className="text-[11px] text-text-3 truncate leading-tight">{roleLabel}</p>
          )}
        </div>
        <button
          className="btn btn-ghost btn-icon btn-sm shrink-0"
          onClick={handleSignOut}
          aria-label="Cerrar sesión"
          type="button"
        >
          <LogOut size={13} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  )
}
