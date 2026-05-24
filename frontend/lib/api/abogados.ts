import { z } from 'zod'
import { api } from '../api'

export const AbogadoSchema = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  municipioId: z.number(),
  createdById: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type Abogado = z.infer<typeof AbogadoSchema>

export const fetchAbogadosByMunicipio = (municipioId: number, signal?: AbortSignal) =>
  api.get(`/municipios/${municipioId}/abogados`, z.array(AbogadoSchema), signal)

export const createAbogado = (municipioId: number, body: { name: string; phone?: string; notes?: string }) =>
  api.post(`/municipios/${municipioId}/abogados`, AbogadoSchema, body)

export const patchAbogado = (id: number, body: { name?: string; phone?: string; notes?: string }) =>
  api.patch(`/abogados/${id}`, AbogadoSchema, body)

export const deleteAbogado = (id: number) =>
  api.delete(`/abogados/${id}`, z.unknown())
