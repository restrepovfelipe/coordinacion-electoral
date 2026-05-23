'use client'
import { ReactNode, useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

// Placeholder — full implementation added by Wave 1 Agent A
export function Shell({ children, topbarActions }: { children: ReactNode; topbarActions?: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDrawer])

  return (
    <div className="flex w-full h-screen overflow-hidden bg-bg">
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={closeDrawer}
          data-testid="drawer-backdrop"
        />
      )}
      <div
        className={[
          'fixed md:relative z-40 md:z-auto h-full transition-transform md:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        data-testid="sidebar-wrapper"
      >
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Topbar
          actions={
            <>
              <button
                className="btn btn-ghost btn-icon btn-sm md:hidden"
                onClick={() => setDrawerOpen(true)}
                data-testid="hamburger"
                aria-label="Abrir menú"
              >
                <span className="sr-only">Menú</span>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="4" x2="13" y2="4" />
                  <line x1="2" y1="7.5" x2="13" y2="7.5" />
                  <line x1="2" y1="11" x2="13" y2="11" />
                </svg>
              </button>
              {topbarActions}
            </>
          }
        />
        <div className="flex-1 overflow-auto px-7 pt-[22px] pb-8">
          {children}
        </div>
      </div>
    </div>
  )
}
