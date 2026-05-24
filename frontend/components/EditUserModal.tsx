'use client'

import { useState, FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchUser, type AppUser, type Role } from '@/lib/api/usuarios'

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'REGIONAL_COORDINATOR',
  'MUNICIPAL_COORDINATOR',
  'ZONE_COORDINATOR',
  'COMUNA_COORDINATOR',
  'PUESTO_COORDINATOR',
]

type Props = {
  user: AppUser
  onSuccess: () => void
  onClose: () => void
}

export default function EditUserModal({ user, onSuccess, onClose }: Props) {
  const qc = useQueryClient()

  const [displayName, setDisplayName] = useState(user.displayName)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [notes, setNotes] = useState(user.notes ?? '')
  const [role, setRole] = useState<Role>(user.role)
  const [active, setActive] = useState(user.active)
  const [changePassword, setChangePassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      patchUser(user.id, {
        displayName,
        phone: phone || undefined,
        notes: notes || undefined,
        role,
        active,
        newPassword: changePassword ? newPassword : undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['users'] })
      onSuccess()
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Error al guardar los cambios')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    mutation.mutate()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border rounded-lg w-full max-w-md p-6 flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Editar usuario</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {errorMsg && (
            <div role="alert" className="text-sm text-danger-text bg-danger-soft border border-danger-text/20 rounded px-3 py-2">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-2">Usuario</p>
            <span className="input bg-surface-2 text-text-3 select-all">{user.username}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eu-displayName" className="text-xs font-medium text-text-2">
              Nombre completo <span className="text-danger-text">*</span>
            </label>
            <input
              id="eu-displayName"
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eu-phone" className="text-xs font-medium text-text-2">
              Teléfono
            </label>
            <input
              id="eu-phone"
              type="tel"
              className="input"
              placeholder="+57 300 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eu-notes" className="text-xs font-medium text-text-2">
              Notas
            </label>
            <textarea
              id="eu-notes"
              className="input min-h-[80px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eu-role" className="text-xs font-medium text-text-2">
              Rol
            </label>
            <select
              id="eu-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="eu-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="eu-active" className="text-xs font-medium text-text-2">
              Activo
            </label>
          </div>

          {/* Change password section */}
          <div className="flex flex-col gap-2 border border-border rounded p-3">
            <div className="flex items-center gap-2">
              <input
                id="eu-change-password"
                type="checkbox"
                checked={changePassword}
                onChange={(e) => {
                  setChangePassword(e.target.checked)
                  if (!e.target.checked) setNewPassword('')
                }}
              />
              <label htmlFor="eu-change-password" className="text-xs font-medium text-text-2">
                Cambiar contraseña
              </label>
            </div>
            {changePassword && (
              <input
                id="eu-new-password"
                type="password"
                className="input"
                placeholder="Nueva contraseña"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-sm"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
