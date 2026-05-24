'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Tag, covTone } from './Tag'
import type { Tone } from './Tag'
import { slugify } from '@/lib/api/ref-data'

export type ComunaRowData = {
  id: number
  nombre: string
  municipioId: number
  zonaId: number | null
  puestosCount: number
  mesasCount: number
  mesasAsignadas: number
  coberturaPct: number
  testigosTotal: number
  sinTestigo: number
  coordinadorNombre: string | null
  estado: 'CUBIERTO' | 'CRITICO' | 'ATENCION' | 'VIGILAR' | 'BAJO_RIESGO'
}

type ComunaRowProps = {
  c: ComunaRowData
  expanded: boolean
  onToggle: () => void
  href?: string
}

const estadoTone: Record<ComunaRowData['estado'], Tone> = {
  CUBIERTO: 'ok',
  CRITICO: 'danger',
  ATENCION: 'warn',
  VIGILAR: 'default',
  BAJO_RIESGO: 'default',
}

function initials(nombre: string) {
  return nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
}

export function ComunaRow({ c, expanded, onToggle, href }: ComunaRowProps) {
  const tone = covTone(c.coberturaPct)
  const fillColor = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-danger'
  const resolvedHref = href ?? `/comuna/${slugify(c.nombre)}`

  return (
    <div className="border border-border rounded-lg bg-surface">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Comuna name */}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold leading-tight truncate">
            <Link href={resolvedHref} className="hover:underline">
              {c.nombre}
            </Link>
          </div>
          {/* Coordinator pill */}
          <div className="mt-1">
            {c.coordinadorNombre ? (
              <div className="flex items-center gap-1.5 text-[11.5px] text-text-2">
                <div className="avatar avatar-accent !w-[18px] !h-[18px] !text-[9px]">
                  {initials(c.coordinadorNombre)}
                </div>
                <span>{c.coordinadorNombre}</span>
              </div>
            ) : (
              <span className="text-[11.5px] text-text-3 italic">Sin coordinador</span>
            )}
          </div>
        </div>

        {/* Estado tag */}
        <Tag tone={estadoTone[c.estado]}>{c.estado}</Tag>

        {/* Chevron toggle */}
        <button
          aria-label="toggle"
          onClick={onToggle}
          className="btn btn-icon btn-ghost flex-shrink-0"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Expanded stats */}
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid grid-cols-5 gap-4 mb-3">
            <Stat label="Puestos" value={c.puestosCount} />
            <Stat label="Mesas" value={c.mesasCount} />
            <Stat label="Sin testigo" value={c.sinTestigo} danger={c.sinTestigo > 0} />
            <Stat label="Testigos" value={c.testigosTotal} />
            <div>
              <div className="text-[10px] text-text-3 tracking-wide mb-1">Cobertura</div>
              <div className="num text-[14px] font-medium">{c.coberturaPct}%</div>
            </div>
          </div>
          {/* Coverage bar */}
          <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
            <div
              data-testid="cov-fill"
              className={`h-full rounded-full transition-all ${fillColor}`}
              style={{ width: c.coberturaPct + '%' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <div
        className={`num text-[14px] font-medium leading-tight ${danger ? 'text-danger-text' : 'text-text'}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-text-3 tracking-wide mt-0.5">{label}</div>
    </div>
  )
}
