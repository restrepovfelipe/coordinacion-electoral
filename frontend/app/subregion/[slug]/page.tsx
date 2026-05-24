'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { useDashboardStats, usePrioPuestos, type MunicipioStat } from '@/lib/api/dashboard'
import {
  useSubregiones,
  useMunicipios,
  slugify,
  resolveSubregionBySlug,
  usePuestosAll,
} from '@/lib/api/ref-data'
import { MuniCard, type MunicipioData } from '@/components/MuniCard'
import { Map } from '@/components/Map/Map'
import { covColor } from '@/lib/map/markers'
import { computeMunicipioCentroids, type MunicipioCentroid } from '@/lib/map/centroid'
import { Tag, type Tone } from '@/components/Tag'
import type { MarkerData } from '@/components/Map/MapInner'

function statToMuniData(stat: MunicipioStat): MunicipioData {
  return {
    id: stat.municipioId,
    name: stat.municipioNombre,
    zonas: 0,
    puestos: 0,
    mesas: stat.mesasCount,
    votantes: 0,
    testigos: stat.testigosCount,
    sinTestigo: 0,
    cov: stat.coberturaPct,
    coord: null,
  }
}

const ESTADO_TONE: Record<string, Tone> = {
  CRITICO: 'danger', ATENCION: 'warn', VIGILAR: 'default', CUBIERTO: 'ok', BAJO_RIESGO: 'default',
}

export default function SubregionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: subregiones, isLoading: subLoading } = useSubregiones()
  const { data: municipios, isLoading: muniLoading } = useMunicipios()
  const { data: puestosAll } = usePuestosAll()
  const { data: prioPuestosData } = usePrioPuestos({ perPage: 500 })

  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set())
  const [expandLoaded, setExpandLoaded] = useState(false)
  const [tab, setTab] = useState<'resumen' | 'mapa' | 'priorizacion'>('resumen')

  const isLoading = statsLoading || subLoading || muniLoading
  const allLoaded = !isLoading && !!stats && !!subregiones && !!municipios

  // Load persisted expand state from localStorage once data is ready
  useEffect(() => {
    if (!allLoaded || expandLoaded) return
    try {
      const stored = localStorage.getItem(`expand.subregion.${slug}`)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setExpandedSlugs(new Set(parsed as string[]))
        }
      }
    } catch {
      // ignore parse errors
    }
    setExpandLoaded(true)
  }, [allLoaded, expandLoaded, slug])

  if (!allLoaded) {
    return (
      <div className="p-6">
        <p className="text-[12px] text-text-3 mb-4">Antioquia / ...</p>
        <p className="text-text-3">Cargando...</p>
      </div>
    )
  }

  const subregion = resolveSubregionBySlug(subregiones, slug)
  if (!subregion) {
    notFound()
  }

  // Filter municipios belonging to this subregion
  const subMuniIds = new Set(
    municipios.filter((m) => m.subregionId === subregion.id).map((m) => m.id),
  )
  const subregionMuniIds = subMuniIds

  const subStats = stats.filter((s) => subMuniIds.has(s.municipioId))

  function toggle(muniSlug: string) {
    setExpandedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(muniSlug)) {
        next.delete(muniSlug)
      } else {
        next.add(muniSlug)
      }
      try {
        localStorage.setItem(`expand.subregion.${slug}`, JSON.stringify(Array.from(next)))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  function expandAll() {
    const all = new Set(subStats.map((s) => slugify(s.municipioNombre)))
    setExpandedSlugs(all)
    try {
      localStorage.setItem(`expand.subregion.${slug}`, JSON.stringify(Array.from(all)))
    } catch {
      // ignore
    }
  }

  function collapseAll() {
    setExpandedSlugs(new Set())
    try {
      localStorage.setItem(`expand.subregion.${slug}`, JSON.stringify([]))
    } catch {
      // ignore
    }
  }

  // Compute map markers for mapa tab
  const emptyCentroids = new globalThis.Map<number, MunicipioCentroid>()
  const centroids: globalThis.Map<number, MunicipioCentroid> = puestosAll
    ? computeMunicipioCentroids(puestosAll)
    : emptyCentroids
  const mapMarkers: MarkerData[] = subStats.flatMap((stat) => {
    const centroid = centroids.get(stat.municipioId)
    if (!centroid) return []
    return [{
      id: stat.municipioId,
      lat: centroid.lat,
      lon: centroid.lon,
      label: `${stat.municipioNombre} · ${stat.coberturaPct}%`,
      color: covColor(stat.coberturaPct),
      onClick: () => router.push('/municipio/' + slugify(stat.municipioNombre)),
    }]
  })

  // Compute map center as average of all centroids in subregion
  const validCentroids = subStats
    .map((s) => centroids.get(s.municipioId))
    .filter((c): c is NonNullable<typeof c> => c != null)
  const mapCenter: [number, number] =
    validCentroids.length > 0
      ? [
          validCentroids.reduce((acc, c) => acc + c.lat, 0) / validCentroids.length,
          validCentroids.reduce((acc, c) => acc + c.lon, 0) / validCentroids.length,
        ]
      : [6.2476, -75.5658]

  // Scoped prio items for priorizacion tab
  const scopedPrioItems =
    prioPuestosData?.items.filter((p) => subregionMuniIds.has(p.municipioId)) ?? []

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[12px] text-text-3 mb-1">
          Antioquia / {subregion.nombre}
        </p>
        <h1 className="h1-display">{subregion.nombre}</h1>

        {/* Tab row */}
        <div className="flex gap-1 border-b border-border mb-4 mt-4">
          {(['resumen', 'mapa', 'priorizacion'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`px-4 py-2 text-[13px] capitalize border-b-2 transition-colors ${
                tab === t ? 'border-accent text-text font-medium' : 'border-transparent text-text-3 hover:text-text'
              }`}
              onClick={() => setTab(t)}
            >
              {t === 'resumen' ? 'Resumen' : t === 'mapa' ? 'Mapa' : 'Priorización'}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={expandAll}>
              Expandir todo
            </button>
            <button className="btn btn-sm btn-ghost" onClick={collapseAll}>
              Contraer todo
            </button>
          </div>
        )}
      </div>

      {tab === 'resumen' && (
        <div className="grid grid-cols-4 gap-3">
          {subStats.map((stat) => {
            const muniSlug = slugify(stat.municipioNombre)
            const isExpanded = expandedSlugs.has(muniSlug)
            return (
              <MuniCard
                key={stat.municipioId}
                m={statToMuniData(stat)}
                collapsed={!isExpanded}
                onClick={() => {
                  if (!isExpanded) {
                    toggle(muniSlug)
                  } else {
                    router.push('/municipio/' + muniSlug)
                  }
                }}
              />
            )
          })}
        </div>
      )}

      {tab === 'mapa' && (
        <div className="h-[560px]">
          <Map markers={mapMarkers} center={mapCenter} zoom={10} />
        </div>
      )}

      {tab === 'priorizacion' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 w-10">#</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3">Puesto</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 text-right">Mesas</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3 text-right">Sin testigo</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-text-3">Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {[...scopedPrioItems]
                .sort((a, b) => (b.mesas - b.mesasAsignadas) - (a.mesas - a.mesasAsignadas))
                .slice(0, 50)
                .map((p, i) => (
                  <tr key={p.puestoId} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-3 py-2 text-[12px] text-text-3 num">{String(i + 1).padStart(2, '0')}</td>
                    <td className="px-3 py-2">
                      <div className="text-[13px] font-medium">{p.puestoNombre}</div>
                      <div className="text-[11px] text-text-3">{p.comunaNombre ?? p.municipioNombre}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] num">{p.mesas}</td>
                    <td className="px-3 py-2 text-right text-[12px] num">
                      <span className={p.mesas - p.mesasAsignadas > 0 ? 'text-danger-text font-medium' : ''}>
                        {p.mesas - p.mesasAsignadas}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Tag tone={ESTADO_TONE[p.estado] ?? 'default'}>{p.estado}</Tag>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
