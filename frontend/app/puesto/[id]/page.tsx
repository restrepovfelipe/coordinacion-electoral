'use client'

import { use, useState, type FormEvent } from 'react'
import { notFound } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/use-auth'
import { useMunicipios, useSubregiones, slugify } from '@/lib/api/ref-data'
import { usePrioPuestos } from '@/lib/api/dashboard'
import { getTestigosByPuesto, getAsignacionPdf, recalcularAsignacion, type Testigo } from '@/lib/api/testigos'
import { CoordinatorWidget } from '@/components/CoordinatorWidget'
import { KpiStrip } from '@/components/Kpi'
import { fetchRefrigeriosByPuesto, createRefrigerio, patchRefrigerio, deleteRefrigerio } from '@/lib/api/refrigerios'

function RefrigerioSection({ puestoId, canEdit }: { puestoId: number; canEdit: boolean }) {
  const qc = useQueryClient()
  const refrigeriosKey = ['refrigerios', 'puesto', puestoId]

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: refrigeriosKey,
    queryFn: ({ signal }) => fetchRefrigeriosByPuesto(puestoId, signal),
  })

  const [count, setCount] = useState('')
  const [status, setStatus] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCount, setEditCount] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const createMutation = useMutation({
    mutationFn: () => {
      const body: { scopeType: string; scopeId: number; count?: number; status?: string; notes?: string } = {
        scopeType: 'PUESTO',
        scopeId: puestoId,
      }
      if (count.trim() !== '') body.count = parseInt(count, 10)
      if (status.trim() !== '') body.status = status.trim()
      if (notes.trim() !== '') body.notes = notes.trim()
      return createRefrigerio(body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: refrigeriosKey })
      setCount(''); setStatus(''); setNotes('')
    },
  })

  const patchMutation = useMutation({
    mutationFn: (id: number) => {
      const body: { count?: number; status?: string; notes?: string } = {}
      if (editCount.trim() !== '') body.count = parseInt(editCount, 10)
      if (editStatus.trim() !== '') body.status = editStatus.trim()
      if (editNotes.trim() !== '') body.notes = editNotes.trim()
      return patchRefrigerio(id, body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: refrigeriosKey })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRefrigerio(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: refrigeriosKey }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  return (
    <div className="border-t border-border pt-4">
      <h2 className="text-[14px] font-semibold mb-3">Refrigerios</h2>
      {canEdit && (
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-text-3">Cantidad</label>
            <input
              type="number"
              className="input text-[13px] w-24"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              min={0}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-text-3">Estado</label>
            <input
              type="text"
              className="input text-[13px] w-32"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="ej. entregado"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-text-3">Notas</label>
            <textarea
              className="input text-[13px] w-48 h-8 resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-sm" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Guardando...' : 'Registrar'}
          </button>
        </form>
      )}
      {isLoading ? (
        <p className="text-[12px] text-text-3">Cargando refrigerios...</p>
      ) : isError ? (
        <p className="text-[12px] text-danger-text">Error al cargar refrigerios.</p>
      ) : items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="p-2 bg-surface-2 rounded text-[13px] flex flex-wrap gap-3 items-start">
              {editingId === r.id ? (
                <div className="flex flex-wrap gap-2 items-end w-full">
                  <input
                    type="number"
                    className="input text-[13px] w-24"
                    value={editCount}
                    onChange={(e) => setEditCount(e.target.value)}
                    placeholder="Cantidad"
                  />
                  <input
                    type="text"
                    className="input text-[13px] w-32"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    placeholder="Estado"
                  />
                  <textarea
                    className="input text-[13px] w-48 h-8 resize-none"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notas"
                  />
                  <button type="button" className="btn btn-sm" onClick={() => patchMutation.mutate(r.id)} disabled={patchMutation.isPending}>Guardar</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>Cancelar</button>
                </div>
              ) : (
                <>
                  <span className="text-text-3">#{r.id}</span>
                  {r.count != null && <span>Cantidad: <strong>{r.count}</strong></span>}
                  {r.status && <span>Estado: <strong>{r.status}</strong></span>}
                  {r.notes && <span className="text-text-3">{r.notes}</span>}
                  {canEdit && (
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        className="text-[12px] text-accent hover:underline"
                        onClick={() => {
                          setEditingId(r.id)
                          setEditCount(r.count != null ? String(r.count) : '')
                          setEditStatus(r.status ?? '')
                          setEditNotes(r.notes ?? '')
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-[12px] text-danger-text hover:underline"
                        onClick={() => { if (confirm('¿Eliminar?')) deleteMutation.mutate(r.id) }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function PuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const puestoId = parseInt(idStr, 10)

  if (isNaN(puestoId)) notFound()

  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role
  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'
  const canRecalculate = ['SUPER_ADMIN', 'REGIONAL_COORDINATOR', 'MUNICIPAL_COORDINATOR', 'ZONE_COORDINATOR', 'COMUNA_COORDINATOR'].includes(role ?? '')

  const { data: prioPuestosPage } = usePrioPuestos({ perPage: 500 })
  const { data: municipios } = useMunicipios()
  const { data: subregiones } = useSubregiones()

  const { data: testigosArr } = useQuery({
    queryKey: ['testigos', 'puesto', puestoId],
    queryFn: ({ signal }) => getTestigosByPuesto(puestoId, signal),
    enabled: !isNaN(puestoId),
  })

  const queryClient = useQueryClient()
  const recalcularMutation = useMutation({
    mutationFn: () => recalcularAsignacion(puestoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testigos', 'puesto', puestoId] })
      queryClient.invalidateQueries({ queryKey: ['prio', 'list'] })
    },
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
        <div className="flex items-center gap-2">
          {canRecalculate && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => recalcularMutation.mutate()}
              disabled={recalcularMutation.isPending}
              type="button"
            >
              {recalcularMutation.isPending ? 'Recalculando...' : 'Recalcular asignaciones'}
            </button>
          )}
          <button className="btn btn-sm" onClick={downloadPdf} type="button">
            Descargar PDF
          </button>
        </div>
      </div>
      <div>
        <KpiStrip items={kpiItems} />
      </div>
      {!testigosArr ? (
        <p className="text-text-3">Cargando testigos...</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-[12px]">Nombre</th>
              <th className="px-3 py-2 text-[12px]">Cédula</th>
              <th className="px-3 py-2 text-[12px]">Teléfono</th>
              <th className="px-3 py-2 text-[12px]">Estado</th>
              <th className="px-3 py-2 text-[12px]">Mesas asig.</th>
            </tr>
          </thead>
          <tbody>
            {(testigosArr ?? []).map((t: Testigo) => (
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
      {prioPuesto && (
        <div className="mt-3 p-3 bg-surface-2 rounded-md text-[13px] text-text-3">
          {prioPuesto.testigosAsignados} testigos asignados · {prioPuesto.mesasAsignadas} mesas cubiertas de {prioPuesto.mesas} totales
          {prioPuesto.mesas - prioPuesto.mesasAsignadas > 0 && (
            <span className="text-danger-text ml-2">· {prioPuesto.mesas - prioPuesto.mesasAsignadas} mesas sin asignar</span>
          )}
          <span className="ml-2">· {prioPuesto.coberturaPct}% cobertura</span>
        </div>
      )}
      <RefrigerioSection puestoId={puestoId} canEdit={canRecalculate} />
    </div>
  )
}
