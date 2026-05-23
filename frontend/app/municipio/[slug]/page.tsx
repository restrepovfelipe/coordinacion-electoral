'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { useDashboardStats, usePrioPuestos, type PrioPuesto } from '@/lib/api/dashboard'
import {
  useSubregiones,
  useMunicipios,
  resolveMunicipioBySlug,
  buildMunicipioBreadcrumb,
  usePuestosAll,
  type BreadcrumbSegment,
} from '@/lib/api/ref-data'
import { KpiStrip } from '@/components/Kpi'
import { CoordinatorWidget } from '@/components/CoordinatorWidget'
import { PuestoRow } from '@/components/PuestoRow'
import type { PuestoRowData } from '@/components/PuestoRow'
import { useAuth } from '@/lib/auth/use-auth'
import { Map } from '@/components/Map/Map'
import { covColor } from '@/lib/map/markers'
import { Tag, type Tone } from '@/components/Tag'
import type { MarkerData } from '@/components/Map/MapInner'

function mapToPuestoRowData(p: PrioPuesto): PuestoRowData {
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

export default function MunicipioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role

  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const { data: municipios, isLoading: muniLoading } = useMunicipios()
  const { data: subregiones, isLoading: subLoading } = useSubregiones()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: puestosAll } = usePuestosAll()

  const [tab, setTab] = useState<'resumen' | 'mapa' | 'priorizacion'>('resumen')

  const allLoaded = !muniLoading && !subLoading && !!municipios && !!subregiones

  const municipio = allLoaded ? resolveMunicipioBySlug(municipios, slug) : null

  const { data: prioPuestosData, isLoading: puestosLoading } = usePrioPuestos({
    municipioId: municipio?.id,
    perPage: 200,
  })

  const breadcrumbs: BreadcrumbSegment[] =
    municipio && subregiones ? buildMunicipioBreadcrumb(municipio, subregiones) : []

  const renderBreadcrumbs = (crumbs: BreadcrumbSegment[]) => (
    <nav className="text-[12px] text-text-3 mb-4 flex items-center gap-1">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <span>/</span>}
          <a href={crumb.href} className="hover:text-text transition-colors">
            {crumb.label}
          </a>
        </span>
      ))}
    </nav>
  )

  if (!allLoaded || statsLoading) {
    return (
      <div className="p-6">
        {renderBreadcrumbs(breadcrumbs)}
        <h1 className="h1-display">...</h1>
        <p className="mt-4 text-text-3">Cargando...</p>
      </div>
    )
  }

  if (!municipio) {
    notFound()
  }

  const stat = stats?.find((s) => s.municipioId === municipio.id)

  const kpiItems = [
    { label: 'Testigos', value: stat?.testigosCount ?? 0 },
    { label: 'Mesas', value: stat?.mesasCount ?? 0 },
    { label: 'Cobertura', value: stat ? `${stat.coberturaPct}%` : '—' },
    {
      label: 'Críticos',
      value: stat?.criticosUncovered ?? 0,
      danger: (stat?.criticosUncovered ?? 0) > 0,
    },
  ]

  const fullBreadcrumbs = buildMunicipioBreadcrumb(municipio, subregiones)

  // Compute map markers for mapa tab
  const municipioPuestos = puestosAll?.filter((p) => p.municipioId === municipio.id) ?? []
  const mapMarkers: MarkerData[] = municipioPuestos.flatMap((p) => {
    if (p.lat == null || p.lon == null) return []
    const prio = prioPuestosData?.items.find((pr) => pr.puestoId === p.id)
    return [{
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      label: `${p.nombre} · ${prio?.coberturaPct ?? 0}%`,
      color: covColor(prio?.coberturaPct ?? 0),
      onClick: () => router.push('/puesto/' + p.id),
    }]
  })

  // Compute map center as average of puestos with lat/lon
  const puestosWithCoords = municipioPuestos.filter((p) => p.lat != null && p.lon != null)
  const mapCenter: [number, number] =
    puestosWithCoords.length > 0
      ? [
          puestosWithCoords.reduce((acc, p) => acc + p.lat!, 0) / puestosWithCoords.length,
          puestosWithCoords.reduce((acc, p) => acc + p.lon!, 0) / puestosWithCoords.length,
        ]
      : [6.2476, -75.5658]

  // Scoped prio items sorted for priorizacion tab
  const sortedPrioItems = prioPuestosData?.items
    ? [...prioPuestosData.items].sort(
        (a, b) => (b.mesas - b.mesasAsignadas) - (a.mesas - a.mesasAsignadas),
      )
    : []

  return (
    <div className="p-6 space-y-6">
      {renderBreadcrumbs(fullBreadcrumbs)}

      <div>
        <h1 className="h1-display">{municipio.nombre}</h1>
      </div>

      <CoordinatorWidget scopeType="municipio" scopeId={municipio.id} canEdit={isAdmin} />

      <KpiStrip items={kpiItems} />

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
        <>
          {puestosLoading && <p className="text-text-3">Cargando puestos...</p>}

          {!puestosLoading && prioPuestosData && prioPuestosData.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-[12px] font-semibold text-text-3">Puesto</th>
                    <th className="px-3 py-2 text-[12px] font-semibold text-text-3">Comuna</th>
                    <th className="px-3 py-2 text-[12px] font-semibold text-text-3">Mesas</th>
                    <th className="px-3 py-2 text-[12px] font-semibold text-text-3">Cobertura</th>
                    <th className="px-3 py-2 text-[12px] font-semibold text-text-3">Estado</th>
                    <th className="px-3 py-2 text-[12px] font-semibold text-text-3">Testigos</th>
                  </tr>
                </thead>
                <tbody>
                  {prioPuestosData.items.map((p) => (
                    <PuestoRow key={p.puestoId} p={mapToPuestoRowData(p)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!puestosLoading && prioPuestosData && prioPuestosData.items.length === 0 && (
            <p className="text-text-3 text-[13px]">No hay puestos registrados para este municipio.</p>
          )}
        </>
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
              {sortedPrioItems.slice(0, 50).map((p, i) => (
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
