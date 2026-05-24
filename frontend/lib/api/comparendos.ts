import { z } from 'zod'
import { api } from '../api'

export const ComparendoSchema = z.object({
  id: z.number(),
  scopeType: z.string(),
  scopeId: z.number(),
  date: z.string(),
  description: z.string(),
  status: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdById: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type Comparendo = z.infer<typeof ComparendoSchema>

export const fetchComparendosByComuna = (comunaId: number, signal?: AbortSignal) =>
  api.get(`/comparendos?comunaId=${comunaId}`, z.array(ComparendoSchema), signal)

export const createComparendo = (body: {
  scopeType: string; scopeId: number; date: string; description: string; status?: string; notes?: string
}) => api.post('/comparendos', ComparendoSchema, body)

export const patchComparendo = (id: number, body: {
  date?: string; description?: string; status?: string; notes?: string
}) => api.patch(`/comparendos/${id}`, ComparendoSchema, body)

export const deleteComparendo = (id: number) => api.delete(`/comparendos/${id}`, z.unknown())
