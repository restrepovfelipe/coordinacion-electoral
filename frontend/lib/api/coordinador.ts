import { z } from 'zod'
import { api } from '../api'

export type ScopeType = 'municipio' | 'zona' | 'comuna' | 'puesto'

export const CoordinadorDisplaySchema = z.object({
  source: z.enum(['user', 'adhoc', 'none']),
  nombre: z.string().nullable(),
  telefono: z.string().nullable(),
  userId: z.number().optional(),
})

export type CoordinadorDisplay = z.infer<typeof CoordinadorDisplaySchema>

export const getCoordinadorDisplay = (scopeType: ScopeType, id: number, signal?: AbortSignal) =>
  api.get(`/coordinador/${scopeType}/${id}/display`, CoordinadorDisplaySchema, signal)

export const patchCoordinadorAdhoc = (
  scopeType: ScopeType,
  id: number,
  body: { nombre: string; telefono: string },
) => api.patch(`/coordinador/${scopeType}/${id}/adhoc`, CoordinadorDisplaySchema, body)
