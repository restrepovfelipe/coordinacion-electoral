'use client'

import Link from 'next/link'
import { Tag, covTone } from './Tag'
import type { Tone } from './Tag'

export type PuestoRowData = {
  id: number
  nombre: string
  comunaNombre: string
  mesas: number
  mesasAsignadas: number
  coberturaPct: number
  testigosAsignados: number
  estado: 'CUBIERTO' | 'CRITICO' | 'ATENCION' | 'VIGILAR' | 'BAJO_RIESGO'
  nivelPrioridad: 'ALTA' | 'MEDIA' | 'BAJA' | null
}

type PuestoRowProps = {
  p: PuestoRowData
  onClick?: () => void
}

const estadoTone: Record<PuestoRowData['estado'], Tone> = {
  CUBIERTO: 'ok',
  CRITICO: 'danger',
  ATENCION: 'warn',
  VIGILAR: 'default',
  BAJO_RIESGO: 'default',
}

export function PuestoRow({ p, onClick }: PuestoRowProps) {
  const tone = covTone(p.coberturaPct)
  const fillColor = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-danger'

  return (
    <tr
      onClick={onClick}
      className={onClick ? 'cursor-pointer hover:bg-surface-2 transition-colors' : ''}
    >
      {/* Nombre */}
      <td className="px-3 py-2 text-[13px]">
        <Link href={`/puesto/${p.id}`} className="font-medium hover:underline">
          {p.nombre}
        </Link>
      </td>

      {/* Comuna */}
      <td className="px-3 py-2 text-[12px] text-text-3">{p.comunaNombre}</td>

      {/* Mesas */}
      <td className="px-3 py-2 text-[12px]">
        <span className="num">
          {p.mesasAsignadas} / {p.mesas}
        </span>
      </td>

      {/* Cobertura */}
      <td className="px-3 py-2 text-[12px]">
        <div className="flex items-center gap-2 min-w-[80px]">
          <span className="num">{p.coberturaPct}%</span>
          <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${fillColor}`}
              style={{ width: p.coberturaPct + '%' }}
            />
          </div>
        </div>
      </td>

      {/* Estado */}
      <td className="px-3 py-2">
        <Tag tone={estadoTone[p.estado]}>{p.estado}</Tag>
      </td>

      {/* Testigos */}
      <td className="px-3 py-2 text-[12px]">
        <span className="num">{p.testigosAsignados}</span>
      </td>

      {/* Actions (visible on hover via group) */}
      <td className="px-3 py-2">
        <button className="btn btn-sm btn-ghost opacity-0 group-hover:opacity-100 transition-opacity">
          Ver detalle
        </button>
      </td>
    </tr>
  )
}
