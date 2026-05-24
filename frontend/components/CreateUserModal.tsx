'use client'

import { useState, FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, getCascadeOptions, type AppUser, type Role } from '@/lib/api/usuarios'
import { slugify } from '@/lib/api/ref-data'

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'REGIONAL_COORDINATOR',
  'MUNICIPAL_COORDINATOR',
  'ZONE_COORDINATOR',
  'COMUNA_COORDINATOR',
  'PUESTO_COORDINATOR',
]

const SCOPE_ROLES: Role[] = [
  'MUNICIPAL_COORDINATOR',
  'ZONE_COORDINATOR',
  'COMUNA_COORDINATOR',
  'PUESTO_COORDINATOR',
]

type Props = {
  onSuccess: (user: AppUser) => void
  onClose: () => void
}

export default function CreateUserModal({ onSuccess, onClose }: Props) {
  const qc = useQueryClient()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('MUNICIPAL_COORDINATOR')
  const [notes, setNotes] = useState('')
  const [municipioId, setMunicipioId] = useState<number | undefined>(undefined)
  const [scopeId, setScopeId] = useState<number | undefined>(undefined)
  const [scopeSearch, setScopeSearch] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const needsCascade = SCOPE_ROLES.includes(role)

  const { data: cascadeBase } = useQuery({
    queryKey: ['cascade-options', role],
    queryFn: ({ signal }) => getCascadeOptions({ role }, signal),
    enabled: needsCascade,
  })

  const { data: cascadeChild } = useQuery({
    queryKey: ['cascade-options', role, municipioId],
    queryFn: ({ signal }) => getCascadeOptions({ role, municipioId }, signal),
    enabled: needsCascade && !!cascadeBase?.needsMunicipio && !!municipioId,
  })

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof createUser>[0]) => createUser(body),
    onSuccess: async (user) => {
      await qc.invalidateQueries({ queryKey: ['users'] })
      onSuccess(user)
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Error al crear el usuario')
    },
  })

  function getScope(): { type: string; id: number } | null {
    if (!needsCascade || !cascadeBase) return null
    if (cascadeBase.needsMunicipio) {
      if (!municipioId || !scopeId) return null
      return { type: cascadeBase.scopeType ?? '', id: scopeId }
    }
    if (cascadeBase.scopeType && scopeId) {
      return { type: cascadeBase.scopeType, id: scopeId }
    }
    return null
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const scope = getScope()
    mutation.mutate({
      username,
      password,
      displayName,
      phone: phone || undefined,
      notes: notes || undefined,
      role,
      scopes: scope ? [{ scopeType: scope.type, scopeId: scope.id }] : [],
    })
  }

  const isEmpty = !username || !password || !displayName || !role

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border rounded-lg w-full max-w-md p-6 flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Crear usuario</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {errorMsg && (
            <div role="alert" className="text-sm text-danger-text bg-danger-soft border border-danger-text/20 rounded px-3 py-2">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="cu-username" className="text-xs font-medium text-text-2">
              Usuario <span className="text-danger-text">*</span>
            </label>
            <input
              id="cu-username"
              type="text"
              className="input"
              placeholder="usuario.apellido"
              value={username}
              autoComplete="off"
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cu-password" className="text-xs font-medium text-text-2">
              Contraseña <span className="text-danger-text">*</span>
            </label>
            <input
              id="cu-password"
              type="password"
              className="input"
              placeholder="Mínimo 8 caracteres"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cu-displayName" className="text-xs font-medium text-text-2">
              Nombre completo <span className="text-danger-text">*</span>
            </label>
            <input
              id="cu-displayName"
              type="text"
              className="input"
              placeholder="Nombre y apellido"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cu-phone" className="text-xs font-medium text-text-2">
              Teléfono
            </label>
            <input
              id="cu-phone"
              type="tel"
              className="input"
              placeholder="+57 300 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cu-role" className="text-xs font-medium text-text-2">
              Rol <span className="text-danger-text">*</span>
            </label>
            <select
              id="cu-role"
              className="input"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role)
                setMunicipioId(undefined)
                setScopeId(undefined)
                setScopeSearch('')
              }}
              required
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Cascade scope picker */}
          {needsCascade && cascadeBase && (
            <div className="flex flex-col gap-3 border border-border rounded p-3 bg-surface-2">
              <p className="text-xs font-medium text-text-2">Ámbito</p>

              {cascadeBase.needsMunicipio && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="cu-municipio" className="text-xs text-text-3">
                    Municipio
                  </label>
                  <select
                    id="cu-municipio"
                    className="input"
                    value={municipioId ?? ''}
                    onChange={(e) => {
                      setMunicipioId(e.target.value ? Number(e.target.value) : undefined)
                      setScopeId(undefined)
                    }}
                  >
                    <option value="">Seleccionar municipio</option>
                    {cascadeBase.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cascadeBase.needsMunicipio && municipioId && cascadeChild && (() => {
                const filteredChildItems = cascadeChild.items.filter(item =>
                  slugify(item.name).includes(slugify(scopeSearch))
                )
                const selectedChildItem = cascadeChild.items.find(item => item.id === scopeId)
                return (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="cu-scope-child" className="text-xs text-text-3">
                      {cascadeBase.scopeType}
                    </label>
                    {selectedChildItem && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs bg-brand/10 text-brand border border-brand/20 rounded px-2 py-0.5">
                          {selectedChildItem.name}
                        </span>
                        <button
                          type="button"
                          className="text-text-3 hover:text-text-1 text-xs"
                          onClick={() => { setScopeId(undefined); setScopeSearch('') }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <input
                        id="cu-scope-child"
                        type="text"
                        className="input"
                        placeholder="Buscar..."
                        value={scopeSearch}
                        onChange={(e) => setScopeSearch(e.target.value)}
                        autoComplete="off"
                      />
                      <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded shadow-md max-h-48 overflow-y-auto">
                        <p className="text-[11px] text-text-3 px-2 pt-1 pb-0.5">
                          {filteredChildItems.length} resultados
                        </p>
                        {filteredChildItems.length === 0 ? (
                          <p className="text-[11px] text-text-3 px-2 py-2">No hay resultados</p>
                        ) : (
                          filteredChildItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 ${item.id === scopeId ? 'bg-brand/10 text-brand font-medium' : ''}`}
                              onClick={() => { setScopeId(item.id); setScopeSearch('') }}
                            >
                              {item.name}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {!cascadeBase.needsMunicipio && cascadeBase.scopeType && (() => {
                const filteredScopeItems = cascadeBase.items.filter(item =>
                  slugify(item.name).includes(slugify(scopeSearch))
                )
                const selectedScopeItem = cascadeBase.items.find(item => item.id === scopeId)
                return (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="cu-scope" className="text-xs text-text-3">
                      {cascadeBase.scopeType}
                    </label>
                    {selectedScopeItem && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs bg-brand/10 text-brand border border-brand/20 rounded px-2 py-0.5">
                          {selectedScopeItem.name}
                        </span>
                        <button
                          type="button"
                          className="text-text-3 hover:text-text-1 text-xs"
                          onClick={() => { setScopeId(undefined); setScopeSearch('') }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <input
                        id="cu-scope"
                        type="text"
                        className="input"
                        placeholder="Buscar..."
                        value={scopeSearch}
                        onChange={(e) => setScopeSearch(e.target.value)}
                        autoComplete="off"
                      />
                      <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded shadow-md max-h-48 overflow-y-auto">
                        <p className="text-[11px] text-text-3 px-2 pt-1 pb-0.5">
                          {filteredScopeItems.length} resultados
                        </p>
                        {filteredScopeItems.length === 0 ? (
                          <p className="text-[11px] text-text-3 px-2 py-2">No hay resultados</p>
                        ) : (
                          filteredScopeItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 ${item.id === scopeId ? 'bg-brand/10 text-brand font-medium' : ''}`}
                              onClick={() => { setScopeId(item.id); setScopeSearch('') }}
                            >
                              {item.name}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="cu-notes" className="text-xs font-medium text-text-2">
              Notas
            </label>
            <textarea
              id="cu-notes"
              className="input min-h-[80px] resize-y"
              placeholder="Notas opcionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-sm"
              disabled={isEmpty || mutation.isPending}
            >
              {mutation.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
