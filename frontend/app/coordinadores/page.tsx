'use client'
import { useAuth } from '@/lib/auth/use-auth'

export default function CoordinadoresPage() {
  const { user } = useAuth()
  const role = (user as { role?: string } | null)?.role
  return (
    <div className="p-6">
      <h1 className="h1-display">Coordinadores</h1>
      <p className="text-text-3 text-[13px] mt-2">
        Los coordinadores se gestionan desde cada municipio, zona o puesto.
        Navega a un municipio para ver o asignar su coordinador.
      </p>
    </div>
  )
}
