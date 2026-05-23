'use client'

import { Search } from 'lucide-react'
import { ReactNode } from 'react'

export function Topbar({
  title,
  crumbs,
  actions,
  search = true,
}: {
  title?: string
  crumbs?: Array<{ label: string; href?: string }>
  actions?: ReactNode
  search?: boolean
}) {
  return (
    <div className="topbar">
      {crumbs && crumbs.length > 0 ? (
        <div className="flex items-center gap-1.5 text-[13px] text-text-3">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-text-faint">/</span>}
              <span
                className={i === crumbs.length - 1 ? 'text-text' : 'hover:text-text cursor-pointer'}
              >
                {c.label}
              </span>
            </span>
          ))}
        </div>
      ) : (
        title && <h1 className="text-[14px] font-medium tracking-tightish m-0">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {search && (
          <div className="search-input w-[220px]">
            <Search />
            <input placeholder="Buscar municipio, puesto, testigo…" />
            <span className="kbd">⌘K</span>
          </div>
        )}
        {actions}
      </div>
    </div>
  )
}
