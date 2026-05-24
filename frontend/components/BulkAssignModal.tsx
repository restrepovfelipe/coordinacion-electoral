'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePuestos } from '@/lib/api/ref-data'
import { bulkAssignTestigos } from '@/lib/api/testigos'

interface BulkAssignModalProps {
  testigoIds: number[]
  onSuccess: () => void
  onClose: () => void
}

export function BulkAssignModal({ testigoIds, onSuccess, onClose }: BulkAssignModalProps) {
  const [puestoSearch, setPuestoSearch] = useState('')
  const [selectedPuestoId, setSelectedPuestoId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data: puestos } = usePuestos()

  const filteredPuestos = (puestos ?? []).filter((p) =>
    p.nombre.toLowerCase().includes(puestoSearch.toLowerCase()),
  )

  const mutation = useMutation({
    mutationFn: () => bulkAssignTestigos(testigoIds, selectedPuestoId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testigos'] })
      onSuccess()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md">
        <h2 className="text-[16px] font-semibold mb-4">
          Asignar {testigoIds.length} testigos a un puesto
        </h2>

        <input
          type="search"
          className="btn btn-sm btn-ghost w-full mb-2"
          placeholder="Buscar puesto..."
          value={puestoSearch}
          onChange={(e) => setPuestoSearch(e.target.value)}
        />

        <div className="max-h-48 overflow-y-auto border border-border rounded-md mb-4">
          {filteredPuestos.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-text-3">Sin resultados</p>
          ) : (
            filteredPuestos.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-[13px] hover:bg-surface-2 ${
                  selectedPuestoId === p.id ? 'bg-surface-2 font-medium' : ''
                }`}
                onClick={() => setSelectedPuestoId(p.id)}
              >
                {p.nombre} <span className="text-text-3">({p.mesas} mesas)</span>
              </button>
            ))
          )}
        </div>

        {mutation.isError && (
          <p className="text-[12px] text-danger-text mb-3">
            Error al asignar. Intenta de nuevo.
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={selectedPuestoId === null || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Asignando...' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}
