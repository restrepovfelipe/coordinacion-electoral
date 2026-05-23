'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useAuth } from '@/lib/auth/use-auth'
import {
  useComunas,
  useMunicipios,
  useSubregiones,
  useZonas,
  resolveComunaBySlug,
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

export default function ComunaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role
  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const { data: comunas } = useComunas()
  const { data: municipios } = useMunicipios()
  const { data: subregiones } = useSubregiones()
  const { data: zonas } = useZonas()

  const comuna = comunas ? resolveComunaBySlug(comunas, slug) : undefined
  if (comunas && !comuna) notFound()

  const municipio = municipios?.find((m) => m.id === comuna?.municipioId)
  const subregion = subregiones?.find((s) => s.id === municipio?.subregionId)
  const zona = zonas?.find((z) => z.id === comuna?.zonaId)

  const { data: prioPuestosPage } = usePrioPuestos({
    municipioId: comuna?.municipioId,
    perPage: 200,
  })
  const filteredPuestos =
    prioPuestosPage?.items.filter((p) => p.comunaId === comuna?.id) ?? []

  const isLoading =
    !comunas || !municipios || !subregiones || !zonas || !prioPuestosPage

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
            <a href={`/zona/${slugify(zona.nombre)}`} className="hover:underline">
              {zona.nombre}
            </a>
          </>
        )}
        {comuna && (
          <>
            <span>/</span>
            <span className="text-text">{comuna.nombre}</span>
          </>
        )}
      </nav>
      <h1 className="h1-display">{comuna?.nombre ?? slug}</h1>
    </div>
  )

  if (isLoading || !comuna) {
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
      <CoordinatorWidget scopeType="comuna" scopeId={comuna.id} canEdit={isAdmin} />
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
