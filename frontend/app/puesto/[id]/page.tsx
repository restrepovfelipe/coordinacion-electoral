'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/use-auth'
import { useMunicipios, useSubregiones, slugify } from '@/lib/api/ref-data'
import { usePrioPuestos } from '@/lib/api/dashboard'
import { getTestigos, getAsignacionPdf, type Testigo } from '@/lib/api/testigos'
import { CoordinatorWidget } from '@/components/CoordinatorWidget'
import { KpiStrip } from '@/components/Kpi'

export default function PuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const puestoId = parseInt(idStr, 10)

  if (isNaN(puestoId)) notFound()

  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role
  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const { data: prioPuestosPage } = usePrioPuestos({ perPage: 500 })
  const { data: municipios } = useMunicipios()
  const { data: subregiones } = useSubregiones()

  const { data: testigosPage } = useQuery({
    queryKey: ['testigos', 'puesto', puestoId],
    queryFn: ({ signal }) => getTestigos({ puestoId, perPage: 200 }, signal),
    enabled: !isNaN(puestoId),
  })

  const prioPuesto = prioPuestosPage?.items.find((p) => p.puestoId === puestoId)
  const municipioNombre = prioPuesto?.municipioNombre
  const municipioId = prioPuesto?.municipioId
  const municipio = municipios?.find((m) => m.id === municipioId)
  const subregion = subregiones?.find((s) => s.id === municipio?.subregionId)

  const dataLoaded = !!prioPuestosPage && !!municipios && !!subregiones

  async function downloadPdf() {
    const blob = await getAsignacionPdf(puestoId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asignacion-puesto-${puestoId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

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
        {municipioNombre && (
          <>
            <span>/</span>
            <a
              href={`/municipio/${slugify(municipioNombre)}`}
              className="hover:underline"
            >
              {municipioNombre}
            </a>
          </>
        )}
        {prioPuesto && (
          <>
            <span>/</span>
            <span className="text-text">{prioPuesto.puestoNombre}</span>
          </>
        )}
      </nav>
      <h1 className="h1-display">{prioPuesto?.puestoNombre ?? 'Puesto'}</h1>
    </div>
  )

  if (!dataLoaded) {
    return (
      <div className="p-6 space-y-4">
        {header}
        <div className="kpi-strip">
          <div className="kpi"><span className="kpi-label">Mesas</span><span className="kpi-value">—</span></div>
          <div className="kpi"><span className="kpi-label">Testigos</span><span className="kpi-value">—</span></div>
          <div className="kpi"><span className="kpi-label">Cobertura</span><span className="kpi-value">—</span></div>
          <div className="kpi"><span className="kpi-label">Estado</span><span className="kpi-value">—</span></div>
        </div>
        <p className="text-text-3">Cargando testigos...</p>
      </div>
    )
  }

  if (!prioPuesto) {
    return <div className="p-6">Puesto no encontrado.</div>
  }

  const kpiItems = [
    { label: 'Mesas', value: prioPuesto.mesas },
    { label: 'Testigos', value: prioPuesto.testigosAsignados },
    { label: 'Cobertura', value: `${prioPuesto.coberturaPct}%` },
    { label: 'Estado', value: prioPuesto.estado },
  ]

  return (
    <div className="p-6 space-y-6">
      {header}
      <div className="flex items-center justify-between gap-4">
        <CoordinatorWidget scopeType="puesto" scopeId={puestoId} canEdit={isAdmin} />
        <button className="btn btn-sm" onClick={downloadPdf} type="button">
          Descargar PDF
        </button>
      </div>
      <div>
        <KpiStrip items={kpiItems} />
      </div>
      {!testigosPage ? (
        <p className="text-text-3">Cargando testigos...</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-[12px]">Nombre</th>
              <th className="px-3 py-2 text-[12px]">Cédula</th>
              <th className="px-3 py-2 text-[12px]">Teléfono</th>
              <th className="px-3 py-2 text-[12px]">Estado</th>
              <th className="px-3 py-2 text-[12px]">Mesas</th>
            </tr>
          </thead>
          <tbody>
            {(testigosPage?.items ?? []).map((t: Testigo) => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-surface-2">
                <td className="px-3 py-2 text-[13px] font-medium">{t.name}</td>
                <td className="px-3 py-2 text-[12px] text-text-3">{t.cedula ?? '—'}</td>
                <td className="px-3 py-2 text-[12px] text-text-3">{t.phone ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className={`tag ${
                      t.status === 'confirmado'
                        ? 'tag-ok'
                        : t.status === 'pendiente'
                        ? 'tag-warn'
                        : ''
                    }`}
                  >
                    <span className="dot" />
                    {t.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {t.mesaInicial != null && t.mesaFinal != null
                    ? `${t.mesaInicial}–${t.mesaFinal}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
