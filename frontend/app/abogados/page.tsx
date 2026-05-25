'use client'

import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/use-auth'
import { useMunicipios } from '@/lib/api/ref-data'
import { fetchAbogadosByMunicipio, createAbogado, patchAbogado, deleteAbogado, type Abogado } from '@/lib/api/abogados'

const MANAGE_ROLES = ['SUPER_ADMIN', 'REGIONAL_COORDINATOR', 'MUNICIPAL_COORDINATOR']

export default function AbogadosPage() {
  const { role: rawRole } = useAuth()
  const role = rawRole ?? ''
  const canManage = MANAGE_ROLES.includes(role)

  const { data: municipios } = useMunicipios()
  const qc = useQueryClient()

  const [selectedMuniId, setSelectedMuniId] = useState<number | ''>('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const abogadosKey = ['abogados', 'municipio', selectedMuniId]

  const { data: abogados, isLoading: abogadosLoading, isError: abogadosError } = useQuery({
    queryKey: abogadosKey,
    queryFn: ({ signal }) => fetchAbogadosByMunicipio(selectedMuniId as number, signal),
    enabled: typeof selectedMuniId === 'number',
  })

  const createMutation = useMutation({
    mutationFn: () => createAbogado(selectedMuniId as number, { name, phone: phone || undefined, notes: notes || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: abogadosKey })
      setName(''); setPhone(''); setNotes('')
      setErrorMsg(null)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const patchMutation = useMutation({
    mutationFn: () => patchAbogado(editingId!, { name: editName, phone: editPhone || undefined, notes: editNotes || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: abogadosKey })
      setEditingId(null)
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAbogado(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: abogadosKey })
      setConfirmDeleteId(null)
    },
  })

  if (!canManage) {
    return <div className="p-6"><p className="text-text-3">No tienes acceso para gestionar abogados.</p></div>
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedMuniId || !name.trim()) return
    createMutation.mutate()
  }

  function startEdit(a: Abogado) {
    setEditingId(a.id); setEditName(a.name); setEditPhone(a.phone ?? ''); setEditNotes(a.notes ?? '')
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="h1-display">Abogados</h1>

      {/* Add form */}
      <form onSubmit={handleSubmit} className="bg-surface-2 border border-border rounded p-4 space-y-3">
        <p className="text-[13px] font-medium">Agregar abogado</p>
        {errorMsg && <p className="text-[12px] text-danger-text">{errorMsg}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-text-3 block mb-1">Municipio *</label>
            <select className="input" value={selectedMuniId} onChange={(e) => setSelectedMuniId(e.target.value ? Number(e.target.value) : '')} required>
              <option value="">Seleccionar...</option>
              {municipios?.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] text-text-3 block mb-1">Nombre *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nombre completo" />
          </div>
          <div>
            <label className="text-[12px] text-text-3 block mb-1">Teléfono</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300..." />
          </div>
          <div>
            <label className="text-[12px] text-text-3 block mb-1">Notas</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Firma, etc." />
          </div>
        </div>
        <button type="submit" className="btn btn-sm" disabled={!selectedMuniId || !name.trim() || createMutation.isPending}>
          {createMutation.isPending ? 'Guardando...' : 'Agregar'}
        </button>
      </form>

      {/* List */}
      {!selectedMuniId ? (
        <p className="text-text-3 text-[13px]">Selecciona un municipio para ver sus abogados.</p>
      ) : abogadosLoading ? (
        <p className="text-text-3 text-[13px]">Cargando...</p>
      ) : abogadosError ? (
        <p className="text-[13px] text-danger-text">Error al cargar abogados.</p>
      ) : abogados?.length === 0 ? (
        <p className="text-text-3 text-[13px]">No hay abogados registrados para este municipio.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-[12px] text-text-3">Nombre</th>
              <th className="px-3 py-2 text-[12px] text-text-3">Teléfono</th>
              <th className="px-3 py-2 text-[12px] text-text-3">Notas</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody>
            {abogados?.map((a) => (
              <tr key={a.id} className="border-b border-border/50 hover:bg-surface-2">
                {editingId === a.id ? (
                  <>
                    <td className="px-3 py-2"><input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                    <td className="px-3 py-2"><input className="input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></td>
                    <td className="px-3 py-2"><input className="input" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></td>
                    <td className="px-3 py-2 flex gap-1">
                      <button type="button" className="btn btn-sm" onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending}>Guardar</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>Cancelar</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-[13px] font-medium">{a.name}</td>
                    <td className="px-3 py-2 text-[12px] text-text-3">{a.phone ?? '—'}</td>
                    <td className="px-3 py-2 text-[12px] text-text-3">{a.notes ?? '—'}</td>
                    <td className="px-3 py-2">
                      {confirmDeleteId === a.id ? (
                        <div className="flex gap-1 items-center">
                          <span className="text-[12px] text-text-3">¿Eliminar a {a.name}?</span>
                          <button type="button" className="btn btn-sm" onClick={() => deleteMutation.mutate(a.id)} disabled={deleteMutation.isPending}>Sí</button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDeleteId(null)}>No</button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => startEdit(a)}>Editar</button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDeleteId(a.id)}>Eliminar</button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
