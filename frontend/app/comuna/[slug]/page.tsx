'use client'

import { use, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/use-auth'
import {
  useComunas,
  useMunicipios,
  useSubregiones,
  useZonas,
  resolveComunaBySlug,
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
import { fetchComparendosByComuna, createComparendo, deleteComparendo } from '@/lib/api/comparendos'

function ComparendoSection({ comunaId, canEdit }: { comunaId: number; canEdit: boolean }) {
  const qc = useQueryClient()
  const comparendosKey = ['comparendos', 'comuna', comunaId]

  const { data: comparendos = [], isLoading, isError } = useQuery({
    queryKey: comparendosKey,
    queryFn: ({ signal }) => fetchComparendosByComuna(comunaId, signal),
  })

  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [notes, setNotes] = useState('')

  const createMutation = useMutation({
    mutationFn: () => {
      const body: { scopeType: string; scopeId: number; date: string; description: string; status?: string; notes?: string } = {
        scopeType: 'COMUNA',
        scopeId: comunaId,
        date,
        description: description.trim(),
      }
      if (status.trim()) body.status = status.trim()
      if (notes.trim()) body.notes = notes.trim()
      return createComparendo(body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: comparendosKey })
      setDate(''); setDescription(''); setStatus(''); setNotes('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteComparendo(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: comparendosKey }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim() || !date.trim()) return
    createMutation.mutate()
  }

  return (
    <>
      {canEdit && (
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-text-3">Fecha *</label>
            <input
              type="date"
              className="input text-[13px] w-36"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-text-3">Descripción *</label>
            <input
              type="text"
              className="input text-[13px] w-56"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-text-3">Estado</label>
            <input
              type="text"
              className="input text-[13px] w-28"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="ej. activo"
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
        <p className="text-[12px] text-text-3">Cargando comparendos...</p>
      ) : isError ? (
        <p className="text-[12px] text-danger-text">Error al cargar comparendos.</p>
      ) : comparendos.length > 0 ? (
        <ul className="space-y-2">
          {comparendos.map((c) => (
            <li key={c.id} className="p-2 bg-surface-2 rounded text-[13px] flex flex-wrap gap-3 items-center">
              <span className="text-text-3">#{c.id}</span>
              <span className="text-text-3">{c.date.slice(0, 10)}</span>
              <span className="font-medium">{c.description}</span>
              {c.status && <span className="text-text-3">Estado: {c.status}</span>}
              {c.notes && <span className="text-text-3 italic">{c.notes}</span>}
              {canEdit && (
                <button
                  type="button"
                  className="ml-auto text-[12px] text-danger-text hover:underline"
                  onClick={() => { if (confirm('¿Eliminar?')) deleteMutation.mutate(c.id) }}
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

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

export default function ComunaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role
  const isAdmin = role === 'SUPER_ADMIN' || role === 'REGIONAL_COORDINATOR'

  const [tab, setTab] = useState<'resumen' | 'mapa' | 'priorizacion'>('resumen')

  const canManageComparendos = ['SUPER_ADMIN', 'REGIONAL_COORDINATOR', 'MUNICIPAL_COORDINATOR', 'ZONE_COORDINATOR', 'COMUNA_COORDINATOR'].includes(role ?? '')

  const { data: comunas } = useComunas()
  const { data: municipios } = useMunicipios()
  const { data: subregiones } = useSubregiones()
  const { data: zonas } = useZonas()
  const { data: puestosAll } = usePuestosAll()

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

  // Compute map markers for mapa tab
  const comunaPuestosAll = puestosAll?.filter((p) => p.comunaId === comuna.id) ?? []
  const mapMarkers: MarkerData[] = comunaPuestosAll.flatMap((p) => {
    if (p.lat == null || p.lon == null) return []
    const prio = prioPuestosPage?.items.find((pr) => pr.puestoId === p.id)
    return [{
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      label: `${p.nombre} · ${prio?.coberturaPct ?? 0}%`,
      color: covColor(prio?.coberturaPct ?? 0),
      onClick: () => router.push('/puesto/' + p.id),
    }]
  })

  const puestosWithCoords = comunaPuestosAll.filter((p) => p.lat != null && p.lon != null)
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
      <CoordinatorWidget scopeType="comuna" scopeId={comuna.id} canEdit={isAdmin} />
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
          <Map markers={mapMarkers} center={mapCenter} zoom={13} />
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

      <div className="border-t border-border pt-4">
        <h2 className="text-[14px] font-semibold mb-3">Comparendos</h2>
        <ComparendoSection comunaId={comuna.id} canEdit={canManageComparendos} />
      </div>
    </div>
  )
}
