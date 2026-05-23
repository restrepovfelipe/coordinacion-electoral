'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboardStats } from '@/lib/api/dashboard'
import { useMunicipios, usePuestosAll, slugify } from '@/lib/api/ref-data'
import { Map as LeafletMap } from '@/components/Map/Map'
import { covColor } from '@/lib/map/markers'
import { computeMunicipioCentroids } from '@/lib/map/centroid'
import type { MarkerData } from '@/components/Map/MapInner'

type ColorMode = 'cobertura' | 'testigos'

export default function MapaPage() {
  const router = useRouter()
  const [colorMode, setColorMode] = useState<ColorMode>('cobertura')
  const [selectedMuniId, setSelectedMuniId] = useState<number | null>(null)

  const { data: municipios } = useMunicipios()
  const { data: stats } = useDashboardStats()
  const { data: puestos } = usePuestosAll()

  const centroids = useMemo(() => {
    if (!puestos) return computeMunicipioCentroids([])
    return computeMunicipioCentroids(puestos)
  }, [puestos])

  const markers: MarkerData[] = useMemo(() => {
    if (!municipios || !stats || centroids.size === 0) return []
    return municipios.flatMap((m) => {
      const c = centroids.get(m.id)
      if (!c) return []
      const stat = stats.find((s) => s.municipioId === m.id)
      if (!stat) return []
      const pct = stat.coberturaPct
      const color = colorMode === 'cobertura'
        ? covColor(pct)
        : covColor(stat.testigosCount > 0 ? Math.min(100, (stat.testigosCount / Math.max(1, stat.mesasCount)) * 100) : 0)
      return [{
        id: m.id,
        lat: c.lat,
        lon: c.lon,
        label: `${m.nombre} · ${pct}%`,
        color,
        onClick: () => setSelectedMuniId(m.id),
      }]
    })
  }, [municipios, stats, centroids, colorMode])

  const selectedMuni = municipios?.find((m) => m.id === selectedMuniId)
  const selectedStat = stats?.find((s) => s.municipioId === selectedMuniId)

  return (
    <div className="flex h-[calc(100vh-56px)] relative">
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-surface/95 border-b border-border backdrop-blur-sm">
        <h1 className="text-[15px] font-semibold">Mapa · Antioquia</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn btn-sm ${colorMode === 'cobertura' ? '' : 'btn-ghost'}`}
            onClick={() => setColorMode('cobertura')}
          >
            Por cobertura
          </button>
          <button
            type="button"
            className={`btn btn-sm ${colorMode === 'testigos' ? '' : 'btn-ghost'}`}
            onClick={() => setColorMode('testigos')}
          >
            Por testigos
          </button>
        </div>
      </div>

      {/* Map fills content below header */}
      <div className="flex-1 pt-[41px]">
        <LeafletMap markers={markers} center={[6.2476, -75.5658]} zoom={9} className="h-full w-full" />
      </div>

      {/* Legend bottom-left */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 bg-surface/95 border border-border rounded px-3 py-2 text-[12px]">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#22c55e] inline-block" />≥ 60% cobertura</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#f59e0b] inline-block" />30–59%</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#ef4444] inline-block" />&lt; 30%</div>
      </div>

      {/* Side panel */}
      {selectedMuni && (
        <div className="absolute top-[41px] right-0 bottom-0 z-10 w-72 bg-surface border-l border-border p-5 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[16px] font-semibold">{selectedMuni.nombre}</h2>
              <p className="text-[12px] text-text-3">
                {selectedMuni.zonasCount ?? 0} zonas · {selectedMuni.puestosCount ?? 0} puestos
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelectedMuniId(null)}>✕</button>
          </div>
          {selectedStat && (
            <div className="grid grid-cols-2 gap-3">
              <div className="kpi"><div className="kpi-label">Votantes</div><div className="kpi-value">—</div></div>
              <div className="kpi"><div className="kpi-label">Testigos</div><div className="kpi-value">{selectedStat.testigosCount}</div></div>
              <div className="kpi"><div className="kpi-label">Sin testigo</div><div className={`kpi-value${selectedStat.criticosUncovered > 0 ? ' danger' : ''}`}>{selectedStat.criticosUncovered}</div></div>
              <div className="kpi"><div className="kpi-label">Cobertura</div><div className="kpi-value">{selectedStat.coberturaPct}%</div></div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-sm w-full"
            onClick={() => router.push(`/municipio/${slugify(selectedMuni.nombre)}`)}
          >
            Abrir municipio →
          </button>
        </div>
      )}
    </div>
  )
}
