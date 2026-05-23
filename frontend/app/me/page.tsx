'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/use-auth'

export default function MePage() {
  const { user, signOut } = useAuth()

  const displayName = user?.displayName ?? ''
  const rawUsername = user?.email?.replace('@defensores.local', '') ?? ''

  const [nombre, setNombre] = useState(displayName)
  const [telefono, setTelefono] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    const payload: Record<string, string> = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
    }
    if (newPassword) payload['password'] = newPassword

    try {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSuccess(true)
      setNewPassword('')
    } catch {
      setError('Error al guardar los cambios. Inténtelo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
    } finally {
      router.replace('/login')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[480px] bg-surface border border-border rounded-[10px]" style={{ boxShadow: 'var(--shadow)' }}>
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-border">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-3 mb-1">
            Mi perfil
          </p>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text">
            {rawUsername || 'Cuenta'}
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 py-6 flex flex-col gap-4">
          {success && (
            <div
              role="status"
              className="text-[12.5px] text-ok-text bg-ok-soft border border-ok-text/20 rounded-[6px] px-3 py-2.5"
            >
              Cambios guardados correctamente.
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="text-[12.5px] text-danger-text bg-danger-soft border border-danger-text/20 rounded-[6px] px-3 py-2.5"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="nombre" className="text-[11.5px] font-medium text-text-2">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              className="input"
              placeholder="Nombre y apellido"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="telefono" className="text-[11.5px] font-medium text-text-2">
              Teléfono
            </label>
            <input
              id="telefono"
              type="tel"
              className="input"
              placeholder="+57 300 000 0000"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className="text-[11.5px] font-medium text-text-2">
              Contraseña nueva{' '}
              <span className="text-text-3 font-normal">(opcional)</span>
            </label>
            <input
              id="new-password"
              type="password"
              className="input"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between mt-1 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="btn btn-sm"
            >
              {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
