'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Map,
  Star,
  ShieldCheck,
  Scale,
  UserCog,
  Upload,
  Database,
  LogOut,
} from 'lucide-react'

const NAV = {
  general: [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/mapa', label: 'Mapa', icon: Map },
    { href: '/priorizacion', label: 'Priorización', icon: Star, count: null as number | null },
  ],
  gente: [
    {
      href: '/testigos',
      label: 'Testigos',
      icon: ShieldCheck,
      count: null as number | string | null,
    },
    { href: '/abogados', label: 'Abogados', icon: Scale, count: null as number | null },
    { href: '/usuarios', label: 'Usuarios', icon: UserCog, count: null as number | null },
  ],
  datos: [
    { href: '/exportar', label: 'Exportar', icon: Upload },
    { href: '/cache', label: 'Limpiar caché', icon: Database },
  ],
}

type NavEntry = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  count?: number | string | null
}

function NavItem({ item }: { item: NavEntry }) {
  const path = usePathname()
  const Icon = item.icon
  const active = path === item.href || (item.href !== '/' && path?.startsWith(item.href))
  return (
    <Link href={item.href} className={'nav-item' + (active ? ' active' : '')}>
      <Icon className="nav-icon" strokeWidth={1.5} />
      <span>{item.label}</span>
      {item.count != null && (
        <span className="ml-auto font-mono text-[11px] text-text-3">{item.count}</span>
      )}
    </Link>
  )
}

export function Sidebar({
  testigosCount,
  userDisplay,
}: {
  testigosCount?: number
  userDisplay?: { initials: string; name: string; roleLabel: string }
}) {
  const nav = {
    ...NAV,
    gente: NAV.gente.map((i) =>
      i.href === '/testigos' ? { ...i, count: testigosCount ?? null } : i,
    ),
  }

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-3.5">
        <div className="w-[26px] h-[26px] rounded-md bg-accent text-white grid place-items-center font-mono font-semibold text-[11px]">
          CE
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Coordinación</div>
          <div className="text-[10.5px] text-text-3">Defensores de la Patria</div>
        </div>
      </div>

      {/* General */}
      <div className="py-1">
        {nav.general.map((i) => (
          <NavItem key={i.href} item={i} />
        ))}
      </div>

      {/* Gente */}
      <div className="pt-2.5 pb-1">
        <div className="nav-section-title">Gente</div>
        {nav.gente.map((i) => (
          <NavItem key={i.href} item={i} />
        ))}
      </div>

      {/* Datos */}
      <div className="pt-2.5 pb-1">
        <div className="nav-section-title">Datos</div>
        {nav.datos.map((i) => (
          <NavItem key={i.href} item={i as NavEntry} />
        ))}
      </div>

      <div className="flex-1" />

      {/* User footer */}
      <div className="border-t border-border pt-2.5 px-1 flex items-center gap-2.5">
        <div className="avatar">{userDisplay?.initials ?? '?'}</div>
        <div className="text-[12px] leading-tight min-w-0">
          <div className="font-medium truncate">{userDisplay?.name ?? '…'}</div>
          <div className="text-text-3 text-[11px] truncate">{userDisplay?.roleLabel ?? ''}</div>
        </div>
        <Link href="/login" className="btn btn-ghost btn-icon btn-sm ml-auto" title="Salir">
          <LogOut />
        </Link>
      </div>
    </aside>
  )
}
