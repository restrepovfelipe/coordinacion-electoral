'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useAuth } from '@/lib/auth/use-auth'
import {
  useZonas,
  useComunas,
  useMunicipios,
  useSubregiones,
  resolveZonaBySlug,
  slugify,
} from '@/lib/api/ref-data'
import { usePrioPuestos, type PrioPuesto } from '@/lib/api/dashboard'
import { CoordinatorWidget } from '@/components/CoordinatorWidget'
import { PuestoRow, type PuestoRowData } from '@/components/PuestoRow'
import { KpiStrip } from '@/components/Kpi'

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

export default function ZonaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role
  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const { data: zonas } = useZonas()
  const { data: municipios } = useMunicipios()
  const { data: subregiones } = useSubregiones()

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
            <a href={`/subregion/${slugify(subregion.nombre)}`} className="hover:underline">
              {subregion.nombre}
            </a>
          </>
        )}
        {municipio && (
          <>
            <span>/</span>
            <a href={`/municipio/${slugify(municipio.nombre)}`} className="hover:underline">
              {municipio.nombre}
            </a>
          </>
        )}
        {zona && (
          <>
            <span>/</span>
            <span className="text-text">{zona.nombre}</span>
          </>
        )}
      </nav>
      <h1 className="h1-display">{zona?.nombre ?? slug}</h1>
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

  return (
    <div className="p-6 space-y-6">
      {header}
      <CoordinatorWidget scopeType="zona" scopeId={zona.id} canEdit={isAdmin} />
      <div>
        <KpiStrip items={kpiItems} />
      </div>
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
    </div>
  )
}
