'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { Shell } from './Shell'

const NO_SHELL_PREFIXES = ['/login', '/api/']

export function ConditionalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const skip = NO_SHELL_PREFIXES.some((p) => pathname.startsWith(p))
  if (skip) return <>{children}</>
  return <Shell>{children}</Shell>
}
