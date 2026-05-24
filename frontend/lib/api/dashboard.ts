import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// ── Schemas ──────────────────────────────────────────────────────────────────

// Matches actual /dashboard/stats backend response
export const MunicipioStatSchema = z.object({
  municipioId: z.number(),
  municipioNombre: z.string(),
  testigosCount: z.number(),
  mesasCount: z.number(),
  mesasCubiertas: z.number(),
  coberturaPct: z.number(),
  prioridadAltaCount: z.number(),
  prioridadMediaCount: z.number(),
  prioridadBajaCount: z.number(),
  criticosUncovered: z.number(),
})

export type MunicipioStat = z.infer<typeof MunicipioStatSchema>

export const DashboardStatsSchema = z.array(MunicipioStatSchema)

// Matches actual /dashboard/prioridad/puestos backend response
export const PrioPuestoSchema = z.object({
  puestoId: z.number(),
  puestoNombre: z.string(),
  municipioId: z.number(),
  municipioNombre: z.string(),
  comunaId: z.number().nullable(),
  comunaNombre: z.string().nullable(),
  votosTotal: z.number(),
  mesas: z.number(),
  testigosAsignados: z.number(),
  mesasAsignadas: z.number(),
  coberturaPct: z.number(),
  estado: z.enum(['CUBIERTO', 'CRITICO', 'ATENCION', 'VIGILAR', 'BAJO_RIESGO']),
  nivelPrioridad: z.enum(['ALTA', 'MEDIA', 'BAJA']).nullable(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
})

export type PrioPuesto = z.infer<typeof PrioPuestoSchema>

export const PrioPuestosResponseSchema = z.object({
  items: z.array(PrioPuestoSchema),
  total: z.number(),
  page: z.number(),
})

// ── API calls ─────────────────────────────────────────────────────────────────

export const getDashboardStats = (signal?: AbortSignal) =>
  api.get('/dashboard/stats', DashboardStatsSchema, signal)

export const getPrioridadPuestos = (
  params: {
    page?: number
    perPage?: number
    municipioId?: number
  },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.perPage) q.set('perPage', String(params.perPage))
  if (params.municipioId) q.set('municipioId', String(params.municipioId))
  return api.get(`/dashboard/prioridad/puestos?${q}`, PrioPuestosResponseSchema, signal)
}

// ── React Query hooks ─────────────────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: ({ signal }) => getDashboardStats(signal),
    staleTime: 30_000,
  })
}

export type SidebarCounts = {
  testigos: number
  coordinadores: number
}

export function useSidebarCounts() {
  return useQuery({
    queryKey: ['sidebar-counts'],
    queryFn: async ({ signal }) => {
      const stats = await getDashboardStats(signal)
      const testigos = stats.reduce((acc, s) => acc + s.testigosCount, 0)
      // coordinadores count not available from stats endpoint
      return { testigos, coordinadores: 0 } satisfies SidebarCounts
    },
    staleTime: 60_000,
  })
}

export function usePrioPuestos(params: { page?: number; perPage?: number; municipioId?: number }) {
  return useQuery({
    queryKey: ['prio', 'list', params],
    queryFn: ({ signal }) => getPrioridadPuestos(params, signal),
    staleTime: 30_000,
  })
}
