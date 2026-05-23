import { ReactNode } from 'react'

export type Tone = 'default' | 'ok' | 'warn' | 'danger' | 'accent'

export function Tag({
  tone = 'default',
  dot = true,
  children,
}: {
  tone?: Tone
  dot?: boolean
  children: ReactNode
}) {
  const cls: Record<Tone, string> = {
    default: 'tag',
    ok: 'tag tag-ok',
    warn: 'tag tag-warn',
    danger: 'tag tag-danger',
    accent: 'tag tag-accent',
  }
  return (
    <span className={cls[tone]}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export const covTone = (cov: number): Tone => (cov >= 60 ? 'ok' : cov >= 30 ? 'warn' : 'danger')
