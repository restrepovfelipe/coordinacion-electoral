import { z } from 'zod'
import { api } from '../api'

export const TestigoSchema = z.object({
  id: z.number(),
  puestoId: z.number().nullable(),
  name: z.string(),
  cedula: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.enum(['confirmado', 'pendiente', 'sin_contacto']),
  notes: z.string().nullable(),
  mesaInicial: z.number().nullable(),
  mesaFinal: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Testigo = z.infer<typeof TestigoSchema>

export const TestigosPageSchema = z.object({
  items: z.array(TestigoSchema),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
})

export type TestigosPage = z.infer<typeof TestigosPageSchema>

export const getTestigos = (
  params: {
    page?: number
    perPage?: number
    puestoId?: number
    sinPuesto?: boolean
    status?: string
    search?: string
  },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.perPage) q.set('perPage', String(params.perPage ?? 50))
  if (params.puestoId) q.set('puestoId', String(params.puestoId))
  if (params.sinPuesto) q.set('sinPuesto', 'true')
  if (params.status) q.set('status', params.status)
  if (params.search) q.set('search', params.search)
  return api.get(`/testigos?${q}`, TestigosPageSchema, signal)
}

export const patchTestigo = (id: number, body: Partial<Testigo>) =>
  api.patch(`/testigos/${id}`, TestigoSchema, body)

export const deleteTestigo = (id: number) => api.delete(`/testigos/${id}`, z.unknown())

export const bulkAssignTestigos = (testigoIds: number[], puestoId: number) =>
  api.patch('/testigos/bulk-assign', z.unknown(), { testigoIds, puestoId })

export const recalcularAsignacion = (puestoId: number) =>
  api.post(`/asignacion/recalcular/${puestoId}`, z.unknown(), {})

export const getAsignacionPdf = (puestoId: number) => api.blob(`/asignacion/puesto/${puestoId}/pdf`)
