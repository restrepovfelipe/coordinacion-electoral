'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/auth/use-auth'

const FIREBASE_ERROR_MAP: Record<string, string> = {
  'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
  'auth/user-not-found': 'Usuario no encontrado.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/too-many-requests': 'Demasiados intentos. Intente más tarde.',
  'auth/user-disabled': 'Esta cuenta ha sido desactivada.',
  'auth/network-request-failed': 'Error de red. Verifique su conexión.',
}

function friendlyMessage(err: unknown): string {
  if (err instanceof Error) {
    for (const [code, msg] of Object.entries(FIREBASE_ERROR_MAP)) {
      if (err.message.includes(code)) return msg
    }
  }
  return 'Ocurrió un error al iniciar sesión. Inténtelo de nuevo.'
}

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { signIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setLoading(true)

    try {
      await signIn(username.trim(), password)

      const user = auth.currentUser
      const idToken = user ? await getIdToken(user) : null

      if (idToken) {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        })
      }

      const from = searchParams.get('from') ?? '/'
      router.push(from)
    } catch (err) {
      setError(friendlyMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div
        className="w-full max-w-[400px] bg-surface border border-border rounded-[10px] shadow"
        style={{ boxShadow: 'var(--shadow)' }}
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-6 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-[26px] h-[26px] rounded-md bg-accent text-white grid place-items-center font-mono font-semibold text-[11px]">
              CE
            </div>
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-3">
              Defensores de la Patria
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text">
            Iniciar sesión
          </h1>
          <p className="text-[12px] text-text-3 mt-0.5">Coordinación Electoral · Antioquia 2026</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 py-6 flex flex-col gap-4" noValidate>
          {error && (
            <div
              role="alert"
              className="text-[12.5px] text-danger-text bg-danger-soft border border-danger-text/20 rounded-[6px] px-3 py-2.5"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-[11.5px] font-medium text-text-2">
              Usuario
            </label>
            <input
              id="username"
              type="text"
              className="input"
              placeholder="nombre.apellido"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-[11.5px] font-medium text-text-2">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn btn-primary w-full mt-1"
            style={{ height: '36px', fontSize: '13px' }}
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
