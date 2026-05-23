'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchTestigo, deleteTestigo, type ListTestigoItem } from '@/lib/api/testigos'

interface EditTestigoModalProps {
  testigo: ListTestigoItem
  onSuccess: () => void
  onClose: () => void
}

export function EditTestigoModal({ testigo, onSuccess, onClose }: EditTestigoModalProps) {
  const [name, setName] = useState(testigo.name)
  const [cedula, setCedula] = useState(testigo.cedula ?? '')
  const [phone, setPhone] = useState(testigo.phone ?? '')
  const [status, setStatus] = useState(testigo.status)
  const [notes, setNotes] = useState(testigo.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const queryClient = useQueryClient()

  const patchMutation = useMutation({
    mutationFn: () =>
      patchTestigo(testigo.id, {
        name,
        cedula: cedula || null,
        phone: phone || null,
        status,
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testigos'] })
      onSuccess()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTestigo(testigo.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testigos'] })
      onSuccess()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md">
        <h2 className="text-[16px] font-semibold mb-4">Editar testigo</h2>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-[12px] text-text-3 mb-1">Nombre *</label>
            <input
              type="text"
              className="btn btn-sm btn-ghost w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-[12px] text-text-3 mb-1">Cédula</label>
            <input
              type="text"
              className="btn btn-sm btn-ghost w-full"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] text-text-3 mb-1">Teléfono</label>
            <input
              type="text"
              className="btn btn-sm btn-ghost w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] text-text-3 mb-1">Estado</label>
            <select
              className="btn btn-sm btn-ghost w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="confirmado">confirmado</option>
              <option value="pendiente">pendiente</option>
              <option value="sin_contacto">sin_contacto</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-text-3 mb-1">Notas</label>
            <textarea
              className="btn btn-sm btn-ghost w-full resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {(patchMutation.isError || deleteMutation.isError) && (
          <p className="text-[12px] text-danger-text mb-3">
            Error al guardar. Intenta de nuevo.
          </p>
        )}

        <div className="flex gap-2 justify-end mb-6">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!name.trim() || patchMutation.isPending}
            onClick={() => patchMutation.mutate()}
          >
            {patchMutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        <div className="border-t border-border pt-4">
          {!confirmDelete ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setConfirmDelete(true)}
            >
              Eliminar testigo
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[13px]">¿Eliminar a {testigo.name}?</span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
