import { z } from 'zod'
import { api } from '../api'
import { useQuery } from '@tanstack/react-query'

export const RoleSchema = z.enum([
  'SUPER_ADMIN',
  'REGIONAL_COORDINATOR',
  'MUNICIPAL_COORDINATOR',
  'ZONE_COORDINATOR',
  'COMUNA_COORDINATOR',
  'PUESTO_COORDINATOR',
])

export type Role = z.infer<typeof RoleSchema>

export const UserScopeSchema = z.object({
  id: z.number(),
  userId: z.number(),
  scopeType: z.enum(['SUBREGION', 'MUNICIPIO', 'ZONA', 'COMUNA', 'PUESTO']),
  scopeId: z.number(),
})

// cipUid is stripped by backend; other optional fields may be absent
export const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  displayName: z.string(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  role: RoleSchema,
  active: z.boolean(),
  mustChangePassword: z.boolean().optional(),
  scopes: z.array(UserScopeSchema),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable().optional(),
})

export type AppUser = z.infer<typeof UserSchema>

// Matches actual backend response: { data, total, page, limit }
export const UsersListResponseSchema = z.object({
  data: z.array(UserSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type UsersListResponse = z.infer<typeof UsersListResponseSchema>

// Actual backend cascade-options response
export const CascadeOptionsSchema = z.object({
  scopeType: z.enum(['SUBREGION', 'MUNICIPIO', 'ZONA', 'COMUNA', 'PUESTO']).nullable(),
  needsMunicipio: z.boolean(),
  items: z.array(z.object({ id: z.number(), name: z.string() })),
  preselect: z
    .object({
      municipioId: z.number().optional(),
      childId: z.number().optional(),
    })
    .nullable(),
})

export type CascadeOptions = z.infer<typeof CascadeOptionsSchema>

// ── API functions ──────────────────────────────────────────────────────────────

export const getUsers = (
  params: { page?: number; limit?: number; role?: Role; active?: boolean },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit ?? 20))
  if (params.role) q.set('role', params.role)
  if (params.active !== undefined) q.set('active', String(params.active))
  return api.get(`/users?${q}`, UsersListResponseSchema, signal)
}

export const getUserById = (id: number, signal?: AbortSignal) =>
  api.get(`/users/${id}`, UserSchema, signal)

export const createUser = (body: {
  username: string
  password: string
  displayName: string
  phone?: string
  notes?: string
  role: Role
  scopes?: Array<{ scopeType: string; scopeId: number }>
}) => api.post('/users', UserSchema, body)

export const patchUser = (
  id: number,
  body: {
    displayName?: string
    phone?: string
    notes?: string
    role?: Role
    active?: boolean
    newPassword?: string
    scope?: { type: string; id: number } | null
  },
) => api.patch(`/users/${id}`, UserSchema, body)

export const deleteUser = (id: number) => api.delete(`/users/${id}`, z.unknown())

export const patchMe = (body: { displayName?: string; phone?: string; newPassword?: string }) =>
  api.patch('/users/me', UserSchema, body)

// Two-step cascade: role determines scopeType.
// If needsMunicipio=true, first call returns municipios; second call with municipioId returns child items.
export const getCascadeOptions = (
  params: { role: Role; municipioId?: number; scopeId?: number },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams({ role: params.role })
  if (params.municipioId) q.set('municipioId', String(params.municipioId))
  if (params.scopeId) q.set('scopeId', String(params.scopeId))
  return api.get(`/admin/cascade-options?${q}`, CascadeOptionsSchema, signal)
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useUsers(params: { page?: number; limit?: number; role?: Role; active?: boolean }) {
  return useQuery({
    queryKey: ['users', 'list', params],
    queryFn: ({ signal }) => getUsers(params, signal),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
