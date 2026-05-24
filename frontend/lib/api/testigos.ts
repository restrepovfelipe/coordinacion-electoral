import { z } from 'zod'
import { api } from '../api'
import { useQuery } from '@tanstack/react-query'

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

// Extended schema for list endpoint that includes puesto relation
export const ListTestigoItemSchema = TestigoSchema.extend({
  puesto: z
    .object({ id: z.number(), name: z.string(), municipioId: z.number() })
    .nullable()
    .optional(),
})

export type ListTestigoItem = z.infer<typeof ListTestigoItemSchema>

// Matches actual backend: { data, total, page, limit }
export const ListTestigosResponseSchema = z.object({
  data: z.array(ListTestigoItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type ListTestigosResponse = z.infer<typeof ListTestigosResponseSchema>

// Legacy export kept for backward compat (puesto page)
export const TestigosPageSchema = z.object({
  items: z.array(TestigoSchema),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
})
export type TestigosPage = z.infer<typeof TestigosPageSchema>

// ── API functions ─────────────────────────────────────────────────────────────

// GET /testigos — global list (SUPER_ADMIN / REGIONAL_COORDINATOR only)
export const getTestigos = (
  params: {
    page?: number
    limit?: number
    puestoId?: number
    sinPuesto?: boolean
    search?: string
    municipioId?: number
  },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.puestoId) q.set('puestoId', String(params.puestoId))
  if (params.sinPuesto) q.set('sinPuesto', 'true')
  if (params.search) q.set('search', params.search)
  if (params.municipioId) q.set('municipioId', String(params.municipioId))
  return api.get(`/testigos?${q}`, ListTestigosResponseSchema, signal)
}

// GET /puestos/:id/testigos — scoped list (any authenticated user with puesto access)
export const getTestigosByPuesto = (puestoId: number, signal?: AbortSignal) =>
  api.get(`/puestos/${puestoId}/testigos`, z.array(TestigoSchema), signal)

export const patchTestigo = (id: number, body: Partial<Omit<Testigo, 'id' | 'createdAt' | 'updatedAt'>>) =>
  api.patch(`/testigos/${id}`, TestigoSchema, body)

export const deleteTestigo = (id: number) => api.delete(`/testigos/${id}`, z.unknown())

export const bulkAssignTestigos = (testigoIds: number[], puestoId: number) =>
  api.patch('/testigos/bulk-assign', z.object({ assigned: z.number() }), { testigoIds, puestoId })

export const recalcularAsignacion = (puestoId: number) =>
  api.post(`/asignacion/recalcular/${puestoId}`, z.unknown(), {})

export const getAsignacionPdf = (puestoId: number) => api.blob(`/asignacion/puesto/${puestoId}/pdf`)

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useTestigos(params: {
  page?: number
  limit?: number
  search?: string
  sinPuesto?: boolean
  municipioId?: number
}) {
  return useQuery({
    queryKey: ['testigos', 'list', params],
    queryFn: ({ signal }) => getTestigos(params, signal),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useTestigosByPuesto(puestoId: number | undefined) {
  return useQuery({
    queryKey: ['testigos', 'puesto', puestoId],
    queryFn: ({ signal }) => getTestigosByPuesto(puestoId!, signal),
    enabled: puestoId !== undefined,
    staleTime: 30_000,
  })
}
