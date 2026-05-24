'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth/use-auth'
import { useTestigos, type ListTestigoItem } from '@/lib/api/testigos'
import { useMunicipios } from '@/lib/api/ref-data'
import { KpiStrip } from '@/components/Kpi'
import { Tag } from '@/components/Tag'
import { EditTestigoModal } from '@/components/EditTestigoModal'
import { BulkAssignModal } from '@/components/BulkAssignModal'

type StatusFilter = 'confirmado' | 'pendiente' | 'sin_contacto' | undefined
type AsignacionFilter = 'con_puesto' | 'sin_puesto' | undefined

export default function TestigosPage() {
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(undefined)
  const [asignacionFilter, setAsignacionFilter] = useState<AsignacionFilter>(undefined)
  const [selectedMunicipio, setSelectedMunicipio] = useState<number | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingTestigo, setEditingTestigo] = useState<ListTestigoItem | null>(null)
  const [showBulkAssign, setShowBulkAssign] = useState(false)

  const { data: municipios } = useMunicipios()

  const sinPuesto = asignacionFilter === 'sin_puesto' ? true : asignacionFilter === 'con_puesto' ? false : undefined

  const { data, isLoading } = useTestigos({
    page,
    limit: 50,
    sinPuesto: sinPuesto === false ? undefined : sinPuesto,
    search: debouncedSearch || undefined,
    municipioId: selectedMunicipio,
  })

  const allRows = data?.data ?? []

  const filteredRows = useMemo(() => {
    let rows = allRows
    if (statusFilter) rows = rows.filter((t) => t.status === statusFilter)
    if (asignacionFilter === 'con_puesto') rows = rows.filter((t) => t.puestoId !== null)
    return rows
  }, [allRows, statusFilter, asignacionFilter])

  const confirmadosCount = isLoading ? null : allRows.filter((t) => t.status === 'confirmado').length
  const pendientesCount = isLoading ? null : allRows.filter((t) => t.status === 'pendiente').length
  const sinContactoCount = isLoading ? null : allRows.filter((t) => t.status === 'sin_contacto').length
  const sinPuestoCount = isLoading ? null : allRows.filter((t) => t.puestoId === null).length

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1

  function handleSearchChange(val: string) {
    setSearch(val)
    if (searchTimer) clearTimeout(searchTimer)
    const t = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(1)
    }, 300)
    setSearchTimer(t)
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRows.map((t) => t.id)))
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function statusTone(status: string) {
    if (status === 'confirmado') return 'ok' as const
    if (status === 'pendiente') return 'warn' as const
    return 'danger' as const
  }

  if (role !== 'SUPER_ADMIN' && role !== 'REGIONAL_COORDINATOR') {
    return (
      <div className="p-6">
        <h1 className="h1-display">Testigos</h1>
        <p className="text-text-3 mt-4">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="h1-display">Testigos</h1>

      <KpiStrip
        items={[
          { label: 'Confirmados', value: confirmadosCount ?? '—' },
          { label: 'Pendientes', value: pendientesCount ?? '—' },
          { label: 'Sin contacto', value: sinContactoCount ?? '—' },
          { label: 'Sin puesto', value: sinPuestoCount ?? '—' },
        ]}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[12px] text-text-3">Estado:</span>
          {([undefined, 'confirmado', 'pendiente', 'sin_contacto'] as StatusFilter[]).map((s) => (
            <button
              key={s ?? 'todos'}
              type="button"
              className={`btn btn-sm ${statusFilter === s ? '' : 'btn-ghost'}`}
              onClick={() => { setStatusFilter(s); setPage(1) }}
            >
              {s === undefined ? 'Todos' : s === 'confirmado' ? 'Confirmados' : s === 'pendiente' ? 'Pendientes' : 'Sin contacto'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[12px] text-text-3">Asignación:</span>
          {([undefined, 'con_puesto', 'sin_puesto'] as AsignacionFilter[]).map((a) => (
            <button
              key={a ?? 'todos'}
              type="button"
              className={`btn btn-sm ${asignacionFilter === a ? '' : 'btn-ghost'}`}
              onClick={() => { setAsignacionFilter(a); setPage(1) }}
            >
              {a === undefined ? 'Todos' : a === 'con_puesto' ? 'Con puesto' : 'Sin puesto'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="btn btn-sm btn-ghost"
            value={selectedMunicipio ?? ''}
            onChange={(e) => {
              setSelectedMunicipio(e.target.value ? Number(e.target.value) : undefined)
              setPage(1)
            }}
          >
            <option value="">Todos los municipios</option>
            {(municipios ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>

          <input
            type="search"
            className="btn btn-sm btn-ghost"
            placeholder="Buscar por nombre o cédula..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-md border border-border">
          <span className="text-[13px]">{selectedIds.size} seleccionados ·</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowBulkAssign(true)}
          >
            Asignar puesto
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar
          </button>
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredRows.length && filteredRows.length > 0}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="px-3 py-2 text-[12px]">Nombre</th>
            <th className="px-3 py-2 text-[12px]">Puesto / Mesas</th>
            <th className="px-3 py-2 text-[12px]">Estado</th>
            <th className="px-3 py-2 text-[12px]">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-text-3">Cargando...</td>
            </tr>
          ) : filteredRows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-text-3">Sin resultados</td>
            </tr>
          ) : (
            filteredRows.map((t) => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-surface-2">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="text-[13px] font-medium">{t.name}</div>
                  {t.cedula && <div className="text-[11px] text-text-3">{t.cedula}</div>}
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {t.puesto ? (
                    <span>
                      {t.puesto.name}
                      {t.mesaInicial != null && t.mesaFinal != null && (
                        <span className="text-text-3"> · mesas {t.mesaInicial}–{t.mesaFinal}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-text-3">Sin puesto</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Tag tone={statusTone(t.status)}>{t.status}</Tag>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setEditingTestigo(t)}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span className="text-[13px] text-text-3">Página {page} de {totalPages}</span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>

      {editingTestigo && (
        <EditTestigoModal
          testigo={editingTestigo}
          onSuccess={() => setEditingTestigo(null)}
          onClose={() => setEditingTestigo(null)}
        />
      )}

      {showBulkAssign && (
        <BulkAssignModal
          testigoIds={Array.from(selectedIds)}
          onSuccess={() => {
            setShowBulkAssign(false)
            setSelectedIds(new Set())
          }}
          onClose={() => setShowBulkAssign(false)}
        />
      )}
    </div>
  )
}
