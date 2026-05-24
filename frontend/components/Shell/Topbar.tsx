'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

export type TopbarProps = {
  title?: string
  crumbs?: Array<{ label: string; href: string }>
  actions?: ReactNode
}

export function Topbar({ title, crumbs, actions }: TopbarProps) {
  const hasCrumbs = crumbs && crumbs.length > 0

  return (
    <div className="topbar" data-testid="topbar">
      {/* Left: title or breadcrumbs */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
        {hasCrumbs ? (
          <nav className="flex items-center gap-1 text-[13px] overflow-hidden">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <span
                  key={crumb.href}
                  className={`flex items-center gap-1 ${i < crumbs.length - 2 ? 'hidden md:flex' : 'flex'}`}
                >
                  {i > 0 && (
                    <span className="text-text-faint select-none">/</span>
                  )}
                  {isLast ? (
                    <span className="text-text font-medium truncate max-w-[200px]">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="text-text-2 hover:text-text transition-colors truncate max-w-[160px]"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </span>
              )
            })}
          </nav>
        ) : (
          <h1 className="text-[14px] font-medium tracking-tightish m-0 truncate">
            {title}
          </h1>
        )}
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="search-input hidden md:flex">
          <Search size={13} strokeWidth={1.5} />
          <input placeholder="Buscar…" aria-label="Buscar" />
          <span className="kbd">⌘K</span>
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </div>
  )
}
