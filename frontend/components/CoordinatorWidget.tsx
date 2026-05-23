'use client'

import { useState } from 'react'
import { Pencil, X, Check, Phone } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCoordinadorDisplay, patchCoordinadorAdhoc } from '@/lib/api/coordinador'
import type { ScopeType } from '@/lib/api/coordinador'

type CoordinatorWidgetProps = {
  scopeType: ScopeType
  scopeId: number
  canEdit: boolean
}

function initials(nombre: string) {
  return nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
}

export function CoordinatorWidget({ scopeType, scopeId, canEdit }: CoordinatorWidgetProps) {
  const [editing, setEditing] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [conflictError, setConflictError] = useState(false)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['coordinador', scopeType, scopeId],
    queryFn: () => getCoordinadorDisplay(scopeType, scopeId),
  })

  const { mutate } = useMutation({
    mutationFn: (vars: { nombre: string; telefono: string }) =>
      patchCoordinadorAdhoc(scopeType, scopeId, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coordinador', scopeType, scopeId] })
      setEditing(false)
      setConflictError(false)
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 409) {
        setConflictError(true)
      }
    },
  })

  function openEdit() {
    setNombre(data?.nombre ?? '')
    setTelefono(data?.telefono ?? '')
    setConflictError(false)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setConflictError(false)
  }

  function handleSave() {
    mutate({ nombre, telefono })
  }

  if (isLoading) {
    return <div className="text-[12px] text-text-3">Cargando...</div>
  }

  if (!data) return null

  // source='user' → read-only always
  if (data.source === 'user') {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        {data.nombre && (
          <div className="avatar avatar-accent !w-[22px] !h-[22px] !text-[10px]">
            {initials(data.nombre)}
          </div>
        )}
        <div>
          {data.nombre && <span className="font-medium">{data.nombre}</span>}
          {data.telefono && (
            <span className="ml-2 text-text-3 flex items-center gap-0.5 inline-flex">
              <Phone className="w-3 h-3" />
              {data.telefono}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Editing form (for adhoc/none + canEdit)
  if (editing && canEdit) {
    return (
      <div className="flex flex-col gap-2">
        {conflictError && (
          <div role="alert" className="text-[12px] text-danger-text bg-danger-bg px-3 py-2 rounded-md">
            Ya existe un coordinador asignado.
          </div>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor="coord-nombre" className="sr-only">
            Nombre
          </label>
          <input
            id="coord-nombre"
            aria-label="Nombre"
            className="input input-sm flex-1"
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <label htmlFor="coord-telefono" className="sr-only">
            Teléfono
          </label>
          <input
            id="coord-telefono"
            aria-label="Teléfono"
            className="input input-sm flex-1"
            placeholder="Teléfono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
          <button
            aria-label="Guardar"
            onClick={handleSave}
            className="btn btn-sm"
          >
            <Check className="w-3.5 h-3.5" />
            Guardar
          </button>
          <button
            aria-label="Cancelar"
            onClick={cancelEdit}
            className="btn btn-sm btn-ghost"
          >
            <X className="w-3.5 h-3.5" />
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  // source='adhoc' + canEdit=false → read-only display
  if (data.source === 'adhoc' && !canEdit) {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        {data.nombre && (
          <div className="avatar avatar-accent !w-[22px] !h-[22px] !text-[10px]">
            {initials(data.nombre)}
          </div>
        )}
        <div>
          {data.nombre && <span className="font-medium">{data.nombre}</span>}
          {data.telefono && (
            <span className="ml-2 text-text-3">{data.telefono}</span>
          )}
        </div>
      </div>
    )
  }

  // source='adhoc' + canEdit=true (not editing) OR source='none'
  return (
    <div className="flex items-center gap-2">
      {data.source === 'adhoc' && data.nombre ? (
        <>
          <div className="avatar avatar-accent !w-[22px] !h-[22px] !text-[10px]">
            {initials(data.nombre)}
          </div>
          <span className="text-[13px] font-medium">{data.nombre}</span>
          {data.telefono && <span className="text-[12px] text-text-3">{data.telefono}</span>}
        </>
      ) : (
        <span className="text-[12px] text-text-3 italic">Sin coordinador</span>
      )}
      {canEdit && (
        <button
          aria-label="Editar coordinador"
          onClick={openEdit}
          className="btn btn-icon btn-ghost btn-sm"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
