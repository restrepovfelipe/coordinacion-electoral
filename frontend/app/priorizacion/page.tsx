'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePrioPuestos } from '@/lib/api/dashboard'
import { useSubregiones, useMunicipios, slugify } from '@/lib/api/ref-data'
import { Tag } from '@/components/Tag'
import type { Tone } from '@/components/Tag'

const ESTADO_TONE: Record<string, Tone> = {
  CRITICO: 'danger',
  ATENCION: 'warn',
  VIGILAR: 'default',
  CUBIERTO: 'ok',
  BAJO_RIESGO: 'default',
}

const TOP_OPTIONS = [10, 25, 100] as const

export default function PriorizacionPage() {
  const [topN, setTopN] = useState<10 | 25 | 100>(10)
  const [subregionFilter, setSubregionFilter] = useState<string>('all')

  const { data: subregiones } = useSubregiones()
  const { data: municipios } = useMunicipios()

  const { data: prioPuestosData, isLoading } = usePrioPuestos({ perPage: 500 })

  const filtered = useMemo(() => {
    if (!prioPuestosData?.items) return []
    let items = prioPuestosData.items
    if (subregionFilter !== 'all' && municipios && subregiones) {
      const subr = subregiones.find((s) => slugify(s.name) === subregionFilter)
      if (subr) {
        const muniIds = new Set(municipios.filter((m) => m.subregionId === subr.id).map((m) => m.id))
        items = items.filter((p) => muniIds.has(p.municipioId))
      }
    }
    return items.slice(0, topN)
  }, [prioPuestosData, subregionFilter, municipios, subregiones, topN])

  const totalRisk = useMemo(() => {
    if (!prioPuestosData?.items) return { total: 0, topRisk: 0 }
    const all = prioPuestosData.items
    const total = all.reduce((s, p) => s + (p.mesas - p.mesasAsignadas), 0)
    const top = filtered.reduce((s, p) => s + (p.mesas - p.mesasAsignadas), 0)
    return { total, topRisk: top }
  }, [prioPuestosData, filtered])

  const riskPct = totalRisk.total > 0
    ? Math.round((totalRisk.topRisk / totalRisk.total) * 100)
    : 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-text-3 uppercase mb-1">Estrategia</p>
          <h1 className="h1-display">Puestos prioritarios</h1>
          <p className="text-[13px] text-text-3 mt-1">
            Ordenados por{' '}
            <code className="text-[12px] bg-surface-2 px-1 rounded">cobertura faltante × votantes</code>{' '}
            de la zona. Los primeros {topN} concentran{' '}
            <strong>{riskPct}%</strong> del riesgo.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            className="input text-[13px] py-1 h-8"
            value={subregionFilter}
            onChange={(e) => setSubregionFilter(e.target.value)}
          >
            <option value="all">Antioquia</option>
            {subregiones?.map((s) => (
              <option key={s.id} value={slugify(s.name)}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="input text-[13px] py-1 h-8"
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value) as typeof topN)}
          >
            {TOP_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-text-3 text-[13px]">Cargando...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 w-12">#</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3">Puesto</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 text-right">Mesas</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 text-right">Votantes</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 text-right">Sin testigo</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3">Riesgo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.puestoId} className="border-b border-border/50 hover:bg-surface-2">
                  <td className="px-3 py-3 text-[12px] text-text-3 num">
                    {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-[13px] font-medium">{p.puestoNombre}</div>
                    <div className="text-[11px] text-text-3">
                      {p.comunaNombre ? `${p.comunaNombre} · ` : ''}{p.municipioNombre}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px] num text-right">{p.mesas}</td>
                  <td className="px-3 py-3 text-[12px] num text-right">{p.votosTotal.toLocaleString('es-CO')}</td>
                  <td className="px-3 py-3 text-[12px] num text-right">
                    <span className={p.mesas - p.mesasAsignadas > 0 ? 'text-danger-text font-medium' : ''}>
                      {p.mesas - p.mesasAsignadas}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Tag tone={ESTADO_TONE[p.estado] ?? 'default'}>{p.estado}</Tag>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/puesto/${p.puestoId}`} className="btn btn-sm btn-ghost text-[11px]">›</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
