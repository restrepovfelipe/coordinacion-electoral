import { z } from 'zod'
import { api } from '../api'

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

export const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  role: RoleSchema,
  active: z.boolean(),
  cipUid: z.string(),
  scopes: z.array(UserScopeSchema),
  createdAt: z.string(),
})

export type AppUser = z.infer<typeof UserSchema>

export const UsersPageSchema = z.object({
  items: z.array(UserSchema),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
})

export const CascadeOptionsSchema = z.object({
  municipios: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  zonas: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  comunas: z
    .array(z.object({ id: z.number(), name: z.string(), municipioId: z.number() }))
    .optional(),
  puestos: z.array(z.object({ id: z.number(), name: z.string(), comunaId: z.number() })).optional(),
})

export const getUsers = (
  params: { page?: number; perPage?: number; role?: Role },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.perPage) q.set('perPage', String(params.perPage ?? 20))
  if (params.role) q.set('role', params.role)
  return api.get(`/users?${q}`, UsersPageSchema, signal)
}

export const createUser = (body: {
  username: string
  password: string
  displayName?: string
  phone?: string
  role: Role
  scopeType?: string
  scopeId?: number
}) => api.post('/users', UserSchema, body)

export const patchUser = (
  id: number,
  body: {
    displayName?: string
    phone?: string
    role?: Role
    active?: boolean
  },
) => api.patch(`/users/${id}`, UserSchema, body)

export const deleteUser = (id: number) => api.delete(`/users/${id}`, z.unknown())

export const patchMe = (body: { displayName?: string; phone?: string; newPassword?: string }) =>
  api.patch('/users/me', UserSchema, body)

export const getCascadeOptions = (
  params: {
    role: Role
    municipioId?: number
  },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams({ role: params.role })
  if (params.municipioId) q.set('municipioId', String(params.municipioId))
  return api.get(`/admin/cascade-options?${q}`, CascadeOptionsSchema, signal)
}
