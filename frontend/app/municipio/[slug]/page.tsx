'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useDashboardStats, usePrioPuestos, type PrioPuesto } from '@/lib/api/dashboard'
import {
  useSubregiones,
  useMunicipios,
  resolveMunicipioBySlug,
  buildMunicipioBreadcrumb,
  type BreadcrumbSegment,
} from '@/lib/api/ref-data'
import { KpiStrip } from '@/components/Kpi'
import { CoordinatorWidget } from '@/components/CoordinatorWidget'
import { PuestoRow } from '@/components/PuestoRow'
import type { PuestoRowData } from '@/components/PuestoRow'
import { useAuth } from '@/lib/auth/use-auth'

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

export default function MunicipioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role

  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const { data: municipios, isLoading: muniLoading } = useMunicipios()
  const { data: subregiones, isLoading: subLoading } = useSubregiones()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()

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

  return (
    <div className="p-6 space-y-6">
      {renderBreadcrumbs(fullBreadcrumbs)}

      <div>
        <h1 className="h1-display">{municipio.nombre}</h1>
      </div>

      <CoordinatorWidget scopeType="municipio" scopeId={municipio.id} canEdit={isAdmin} />

      <KpiStrip items={kpiItems} />

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
    </div>
  )
}
