import { z } from 'zod'
import { api } from '../api'

export const RefrigerioSchema = z.object({
  id: z.number(),
  scopeType: z.string(),
  scopeId: z.number(),
  count: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdById: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type Refrigerio = z.infer<typeof RefrigerioSchema>

export const createRefrigerio = (body: {
  scopeType: string; scopeId: number; count?: number; status?: string; notes?: string
}) => api.post('/refrigerios', RefrigerioSchema, body)

export const patchRefrigerio = (id: number, body: {
  count?: number; status?: string; notes?: string
}) => api.patch(`/refrigerios/${id}`, RefrigerioSchema, body)

export const deleteRefrigerio = (id: number) => api.delete(`/refrigerios/${id}`, z.unknown())
