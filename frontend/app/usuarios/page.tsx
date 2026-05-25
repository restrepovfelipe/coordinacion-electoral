'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/use-auth'
import { useUsers, type AppUser, type Role } from '@/lib/api/usuarios'
import { Tag, type Tone } from '@/components/Tag'
import CreateUserModal from '@/components/CreateUserModal'
import EditUserModal from '@/components/EditUserModal'

const ALLOWED_ROLES: Role[] = ['SUPER_ADMIN', 'REGIONAL_COORDINATOR']

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  REGIONAL_COORDINATOR: 'REGIONAL_COORDINATOR',
  MUNICIPAL_COORDINATOR: 'MUNICIPAL_COORDINATOR',
  ZONE_COORDINATOR: 'ZONE_COORDINATOR',
  COMUNA_COORDINATOR: 'COMUNA_COORDINATOR',
  PUESTO_COORDINATOR: 'PUESTO_COORDINATOR',
}

const ROLE_TONES: Record<Role, Tone> = {
  SUPER_ADMIN: 'danger',
  REGIONAL_COORDINATOR: 'accent',
  MUNICIPAL_COORDINATOR: 'warn',
  ZONE_COORDINATOR: 'default',
  COMUNA_COORDINATOR: 'default',
  PUESTO_COORDINATOR: 'default',
}

const ROLE_FILTER_OPTIONS: Array<{ label: string; value: Role | undefined }> = [
  { label: 'Todos', value: undefined },
  { label: 'SUPER_ADMIN', value: 'SUPER_ADMIN' },
  { label: 'REGIONAL_COORDINATOR', value: 'REGIONAL_COORDINATOR' },
  { label: 'MUNICIPAL_COORDINATOR', value: 'MUNICIPAL_COORDINATOR' },
  { label: 'ZONE_COORDINATOR', value: 'ZONE_COORDINATOR' },
  { label: 'COMUNA_COORDINATOR', value: 'COMUNA_COORDINATOR' },
  { label: 'PUESTO_COORDINATOR', value: 'PUESTO_COORDINATOR' },
]

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export default function UsuariosPage() {
  const { role } = useAuth()

  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState<Role | undefined>(undefined)
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<AppUser | null>(null)

  const { data, isLoading } = useUsers({ page, limit: 20, role: roleFilter, active: activeFilter })

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      setSearch(value)
      setPage(1)
    }, 300)
  }, [])

  if (!role || !ALLOWED_ROLES.includes(role as Role)) {
    return (
      <div className="p-8">
        <p className="text-text-3">No tienes acceso</p>
      </div>
    )
  }

  const allUsers = data?.data ?? []
  const filtered = search
    ? allUsers.filter(
        (u) =>
          u.displayName.toLowerCase().includes(search.toLowerCase()) ||
          u.username.toLowerCase().includes(search.toLowerCase()),
      )
    : allUsers

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="h1-display">Usuarios</h1>
        <button className="btn btn-sm" onClick={() => setShowCreate(true)}>
          Crear usuario
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Role chips */}
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              className={`btn btn-sm btn-ghost${roleFilter === opt.value ? ' ring-1 ring-current' : ''}`}
              onClick={() => { setRoleFilter(opt.value); setPage(1) }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Active chips */}
        <div className="flex gap-2">
          {[
            { label: 'Activos', value: true as boolean | undefined },
            { label: 'Inactivos', value: false as boolean | undefined },
          ].map((opt) => (
            <button
              key={opt.label}
              className={`btn btn-sm btn-ghost${activeFilter === opt.value ? ' ring-1 ring-current' : ''}`}
              onClick={() => {
                setActiveFilter(activeFilter === opt.value ? undefined : opt.value)
                setPage(1)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          className="input max-w-sm"
          placeholder="Buscar por nombre o usuario..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-text-3">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-3 text-left">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-text-3 text-xs">{u.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Tag>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={u.active ? 'ok' : 'danger'}>{u.active ? 'Activo' : 'Inactivo'}</Tag>
                  </td>
                  <td className="px-4 py-3 text-text-3 num">{formatDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditUser(u)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-3">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-4">
        <button
          className="btn btn-sm btn-ghost"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span className="text-sm text-text-3">
          Página {page} de {totalPages}
        </span>
        <button
          className="btn btn-sm btn-ghost"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal
          onSuccess={() => setShowCreate(false)}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onSuccess={() => setEditUser(null)}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  )
}
