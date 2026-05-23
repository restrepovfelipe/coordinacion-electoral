import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// ── Schemas ──────────────────────────────────────────────────────────────────

export const MunicipioStatSchema = z.object({
  municipioId: z.number(),
  municipioNombre: z.string(),
  subregionId: z.number(),
  subregionNombre: z.string(),
  puestosCount: z.number(),
  mesasCount: z.number(),
  mesasAsignadas: z.number(),
  coberturaPct: z.number(),
  testigosTotal: z.number(),
  testigosConfirmados: z.number(),
  testigosPendientes: z.number(),
  testigosSinContacto: z.number(),
  sinTestigo: z.number(),
  criticosUncovered: z.number(),
  coordinadorNombre: z.string().nullable(),
})

export type MunicipioStat = z.infer<typeof MunicipioStatSchema>

export const DashboardStatsSchema = z.array(MunicipioStatSchema)

export const PrioPuestoSchema = z.object({
  puestoId: z.number(),
  puestoNombre: z.string(),
  municipioId: z.number(),
  municipioNombre: z.string(),
  comunaNombre: z.string(),
  mesas: z.number(),
  votosTotal: z.number().nullable(),
  testigosAsignados: z.number(),
  mesasAsignadas: z.number(),
  coberturaPct: z.number(),
  estado: z.enum(['CUBIERTO', 'CRITICO', 'ATENCION', 'VIGILAR', 'BAJO_RIESGO']),
  nivelPrioridad: z.enum(['ALTA', 'MEDIA', 'BAJA']).nullable(),
})

export type PrioPuesto = z.infer<typeof PrioPuestoSchema>

export const PrioPuestosResponseSchema = z.object({
  items: z.array(PrioPuestoSchema),
  total: z.number(),
  page: z.number(),
  perPage: z.number(),
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
      const testigos = stats.reduce((acc, s) => acc + s.testigosTotal, 0)
      const coordinadores = stats.filter((s) => s.coordinadorNombre !== null).length
      return { testigos, coordinadores } satisfies SidebarCounts
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
