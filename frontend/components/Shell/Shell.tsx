'use client'

import { ReactNode, useState, useEffect, useCallback } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Shell({
  children,
  topbarActions,
  crumbs,
  title,
}: {
  children: ReactNode
  topbarActions?: ReactNode
  crumbs?: Array<{ label: string; href: string }>
  title?: string
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDrawer])

  return (
    <div className="flex w-full h-screen overflow-hidden bg-bg">
      {/* Mobile overlay backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={closeDrawer}
          data-testid="drawer-backdrop"
        />
      )}

      {/* Sidebar wrapper: fixed on mobile, static on md+ */}
      <div
        className={[
          'fixed md:static z-40 md:z-auto h-full transition-transform md:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        data-testid="sidebar-wrapper"
      >
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Topbar
          title={title}
          crumbs={crumbs}
          actions={
            <>
              <button
                className="btn btn-ghost btn-icon btn-sm md:hidden"
                onClick={() => setDrawerOpen(true)}
                data-testid="hamburger"
                aria-label="Abrir menú"
                type="button"
              >
                <Menu size={15} strokeWidth={1.5} />
              </button>
              {topbarActions}
            </>
          }
        />
        <div className="flex-1 overflow-auto px-7 pt-[22px] pb-8">{children}</div>
      </div>
    </div>
  )
}
