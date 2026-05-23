'use client'

import { ReactNode } from 'react'

export function Shell({
  sidebar,
  topbar,
  children,
}: {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex w-full h-screen overflow-hidden bg-bg">
      {sidebar}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {topbar}
        <div className="flex-1 overflow-auto px-7 pt-[22px] pb-8">{children}</div>
      </div>
    </div>
  )
}
