import { z } from 'zod'
import { api } from '../api'
import { useQuery } from '@tanstack/react-query'

export const VoluntarioSchema = z.object({
  id: z.number(),
  comunaId: z.number(),
  name: z.string(),
  cedula: z.string().nullable(),
  phone: z.string().nullable(),
  correo: z.string().nullable(),
  rol: z.string().nullable(),
  status: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Voluntario = z.infer<typeof VoluntarioSchema>

export const getVoluntariosByComuna = (comunaId: number, signal?: AbortSignal) =>
  api.get(`/comunas/${comunaId}/voluntarios`, z.array(VoluntarioSchema), signal)

export const createVoluntario = (
  comunaId: number,
  body: { name: string; cedula?: string; phone?: string; correo?: string; rol?: string; notes?: string },
) => api.post(`/comunas/${comunaId}/voluntarios`, VoluntarioSchema, body)

export const patchVoluntario = (
  comunaId: number,
  id: number,
  body: Partial<Omit<Voluntario, 'id' | 'comunaId' | 'createdAt' | 'updatedAt'>>,
) => api.patch(`/comunas/${comunaId}/voluntarios/${id}`, VoluntarioSchema, body)

export const deleteVoluntario = (comunaId: number, id: number) =>
  api.delete(`/comunas/${comunaId}/voluntarios/${id}`, z.unknown())

export function useVoluntariosByComuna(comunaId: number | undefined) {
  return useQuery({
    queryKey: ['voluntarios', 'comuna', comunaId],
    queryFn: ({ signal }) => getVoluntariosByComuna(comunaId!, signal),
    enabled: comunaId !== undefined,
    staleTime: 30_000,
  })
}
