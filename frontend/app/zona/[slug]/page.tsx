'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { useAuth } from '@/lib/auth/use-auth'
import {
  useZonas,
  useComunas,
  useMunicipios,
  useSubregiones,
  resolveZonaBySlug,
  slugify,
  usePuestosAll,
} from '@/lib/api/ref-data'
import { usePrioPuestos, type PrioPuesto } from '@/lib/api/dashboard'
import { CoordinatorWidget } from '@/components/CoordinatorWidget'
import { PuestoRow, type PuestoRowData } from '@/components/PuestoRow'
import { KpiStrip } from '@/components/Kpi'
import { Map } from '@/components/Map/Map'
import { covColor } from '@/lib/map/markers'
import { Tag, type Tone } from '@/components/Tag'
import type { MarkerData } from '@/components/Map/MapInner'

function toPuestoRowData(p: PrioPuesto): PuestoRowData {
  return {
    id: p.puestoId,
    nombre: p.puestoNombre,
    comunaNombre: p.comunaNombre,
    mesas: p.mesas,
    mesasAsignadas: p.mesasAsignadas,
    coberturaPct: p.coberturaPct,
    testigosAsignados: p.testigosAsignados,
    estado: p.estado,
    nivelPrioridad: p.nivelPrioridad,
  }
}

const ESTADO_TONE: Record<string, Tone> = {
  CRITICO: 'danger', ATENCION: 'warn', VIGILAR: 'default', CUBIERTO: 'ok', BAJO_RIESGO: 'default',
}

export default function ZonaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const { role } = useAuth()
  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const [tab, setTab] = useState<'resumen' | 'mapa' | 'priorizacion'>('resumen')

  const { data: zonas } = useZonas()
  const { data: municipios } = useMunicipios()
  const { data: subregiones } = useSubregiones()
  const { data: puestosAll } = usePuestosAll()

  const zona = zonas ? resolveZonaBySlug(zonas, slug) : undefined
  if (zonas && !zona) notFound()

  const municipioId = zona?.municipioId
  const municipio = municipios?.find((m) => m.id === municipioId)
  const subregion = subregiones?.find((s) => s.id === municipio?.subregionId)

  const { data: comunasAll } = useComunas(municipioId)
  const zonaComunas = comunasAll?.filter((c) => zona && c.zonaId === zona.id) ?? []
  const zonaComunaIds = new Set(zonaComunas.map((c) => c.id))

  const { data: prioPuestosPage } = usePrioPuestos({
    municipioId: municipioId,
    perPage: 200,
  })
  const filteredPuestos =
    prioPuestosPage?.items.filter((p) => p.comunaId != null && zonaComunaIds.has(p.comunaId)) ?? []

  const isLoading = !zonas || !municipios || !subregiones || !comunasAll || !prioPuestosPage

  const header = (
    <div>
      <nav className="text-[12px] text-text-3 mb-2 flex flex-wrap gap-1">
        <a href="/" className="hover:underline">Antioquia</a>
        {subregion && (
          <>
            <span>/</span>
            <a href={`/subregion/${slugify(subregion.name)}`} className="hover:underline">
              {subregion.name}
            </a>
          </>
        )}
        {municipio && (
          <>
            <span>/</span>
            <a href={`/municipio/${slugify(municipio.name)}`} className="hover:underline">
              {municipio.name}
            </a>
          </>
        )}
        {zona && (
          <>
            <span>/</span>
            <span className="text-text">{zona.name}</span>
          </>
        )}
      </nav>
      <h1 className="h1-display">{zona?.name ?? slug}</h1>
    </div>
  )

  if (isLoading || !zona) {
    return (
      <div className="p-6 space-y-4">
        {header}
        <p className="text-text-3">Cargando...</p>
      </div>
    )
  }

  const kpiItems = [
    { label: 'Puestos', value: filteredPuestos.length },
    { label: 'Mesas', value: filteredPuestos.reduce((acc, p) => acc + p.mesas, 0) },
    {
      label: 'Mesas asignadas',
      value: filteredPuestos.reduce((acc, p) => acc + p.mesasAsignadas, 0),
    },
    {
      label: 'Testigos',
      value: filteredPuestos.reduce((acc, p) => acc + p.testigosAsignados, 0),
    },
  ]

  // Compute map markers for mapa tab
  const zonaPuestosAll = puestosAll?.filter(
    (p) => p.comunaId != null && zonaComunaIds.has(p.comunaId),
  ) ?? []
  const mapMarkers: MarkerData[] = zonaPuestosAll.flatMap((p) => {
    if (p.lat == null || p.lon == null) return []
    const prio = prioPuestosPage?.items.find((pr) => pr.puestoId === p.id)
    return [{
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      label: `${p.name} · ${prio?.coberturaPct ?? 0}%`,
      color: covColor(prio?.coberturaPct ?? 0),
      onClick: () => router.push('/puesto/' + p.id),
    }]
  })

  const puestosWithCoords = zonaPuestosAll.filter((p) => p.lat != null && p.lon != null)
  const mapCenter: [number, number] =
    puestosWithCoords.length > 0
      ? [
          puestosWithCoords.reduce((acc, p) => acc + p.lat!, 0) / puestosWithCoords.length,
          puestosWithCoords.reduce((acc, p) => acc + p.lon!, 0) / puestosWithCoords.length,
        ]
      : [6.2476, -75.5658]

  // Scoped prio items for priorizacion tab
  const scopedPrioItems = [...filteredPuestos].sort(
    (a, b) => (b.mesas - b.mesasAsignadas) - (a.mesas - a.mesasAsignadas),
  )

  return (
    <div className="p-6 space-y-6">
      {header}
      <CoordinatorWidget scopeType="zona" scopeId={zona.id} canEdit={isAdmin} />
      <div>
        <KpiStrip items={kpiItems} />
      </div>

      {/* Tab row */}
      <div className="flex gap-1 border-b border-border mb-4">
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
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-[12px]">Puesto</th>
              <th className="px-3 py-2 text-[12px]">Mesas</th>
              <th className="px-3 py-2 text-[12px]">Cobertura</th>
              <th className="px-3 py-2 text-[12px]">Estado</th>
              <th className="px-3 py-2 text-[12px]">Testigos</th>
            </tr>
          </thead>
          <tbody>
            {filteredPuestos.map((p) => (
              <PuestoRow key={p.puestoId} p={toPuestoRowData(p)} />
            ))}
          </tbody>
        </table>
      )}

      {tab === 'mapa' && (
        <div className="h-[560px]">
          <Map markers={mapMarkers} center={mapCenter} zoom={12} />
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
              {scopedPrioItems.slice(0, 50).map((p, i) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
