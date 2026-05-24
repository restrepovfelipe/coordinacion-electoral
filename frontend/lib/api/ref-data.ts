import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// ── slugify ────────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Schemas ────────────────────────────────────────────────────────────────────

export const SubregionSchema = z.object({
  id: z.number(),
  nombre: z.string(),
})
export type Subregion = z.infer<typeof SubregionSchema>

export const MunicipioRefSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  subregionId: z.number(),
  zonasCount: z.number().optional(),
  comunasCount: z.number().optional(),
  puestosCount: z.number().optional(),
  mesasCount: z.number().optional(),
})
export type MunicipioRef = z.infer<typeof MunicipioRefSchema>

export const ZonaSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  municipioId: z.number(),
})
export type Zona = z.infer<typeof ZonaSchema>

export const ComunaSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  municipioId: z.number(),
  zonaId: z.number().nullable(),
})
export type Comuna = z.infer<typeof ComunaSchema>

export const PuestoRefSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  comunaId: z.number(),
  municipioId: z.number(),
  mesas: z.number(),
  votosTotal: z.number().nullable(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
})
export type PuestoRef = z.infer<typeof PuestoRefSchema>

// ── API functions ──────────────────────────────────────────────────────────────

export const getSubregiones = (signal?: AbortSignal) =>
  api.get('/subregiones', z.array(SubregionSchema), signal)

export const getMunicipios = (signal?: AbortSignal) =>
  api.get('/municipios', z.array(MunicipioRefSchema), signal)

export const getZonas = (municipioId?: number, signal?: AbortSignal) => {
  const q = municipioId ? `?municipioId=${municipioId}` : ''
  return api.get(`/zonas${q}`, z.array(ZonaSchema), signal)
}

export const getComunas = (municipioId?: number, signal?: AbortSignal) => {
  const q = municipioId ? `?municipioId=${municipioId}` : ''
  return api.get(`/comunas${q}`, z.array(ComunaSchema), signal)
}

export const getPuestos = (comunaId?: number, signal?: AbortSignal) => {
  const q = comunaId ? `?comunaId=${comunaId}` : ''
  return api.get(`/puestos${q}`, z.array(PuestoRefSchema), signal)
}

export const getPuestosAll = (signal?: AbortSignal) =>
  api.get('/puestos', z.array(PuestoRefSchema), signal)

// ── React Query hooks ──────────────────────────────────────────────────────────

const STALE_30M = 1000 * 60 * 30

export function useSubregiones() {
  return useQuery({
    queryKey: ['ref', 'subregiones'],
    queryFn: ({ signal }) => getSubregiones(signal),
    staleTime: STALE_30M,
  })
}

export function useMunicipios() {
  return useQuery({
    queryKey: ['ref', 'municipios'],
    queryFn: ({ signal }) => getMunicipios(signal),
    staleTime: STALE_30M,
  })
}

export function useZonas(municipioId?: number) {
  return useQuery({
    queryKey: ['ref', 'zonas', municipioId ?? 'all'],
    queryFn: ({ signal }) => getZonas(municipioId, signal),
    staleTime: STALE_30M,
  })
}

export function useComunas(municipioId?: number) {
  return useQuery({
    queryKey: ['ref', 'comunas', municipioId ?? 'all'],
    queryFn: ({ signal }) => getComunas(municipioId, signal),
    staleTime: STALE_30M,
  })
}

export function usePuestos(comunaId?: number) {
  return useQuery({
    queryKey: ['ref', 'puestos', comunaId ?? 'all'],
    queryFn: ({ signal }) => getPuestos(comunaId, signal),
    staleTime: STALE_30M,
  })
}

export function usePuestosAll() {
  return useQuery({
    queryKey: ['ref', 'puestos', 'all'],
    queryFn: ({ signal }) => getPuestosAll(signal),
    staleTime: STALE_30M,
  })
}

// ── Slug resolvers ─────────────────────────────────────────────────────────────

export function resolveSubregionBySlug(subregiones: Subregion[], slug: string) {
  return subregiones.find((s) => slugify(s.nombre) === slug) ?? null
}

export function resolveMunicipioBySlug(municipios: MunicipioRef[], slug: string) {
  return municipios.find((m) => slugify(m.nombre) === slug) ?? null
}

export function resolveZonaBySlug(zonas: Zona[], slug: string) {
  return zonas.find((z) => slugify(z.nombre) === slug) ?? null
}

export function resolveComunaBySlug(comunas: Comuna[], slug: string) {
  return comunas.find((c) => slugify(c.nombre) === slug) ?? null
}

// ── Breadcrumb builder ─────────────────────────────────────────────────────────

export type BreadcrumbSegment = { label: string; href: string }

export function buildMunicipioBreadcrumb(
  m: MunicipioRef,
  subregiones: Subregion[],
): BreadcrumbSegment[] {
  const sub = subregiones.find((s) => s.id === m.subregionId)
  const crumbs: BreadcrumbSegment[] = [{ label: 'Antioquia', href: '/' }]
  if (sub) crumbs.push({ label: sub.nombre, href: `/subregion/${slugify(sub.nombre)}` })
  crumbs.push({ label: m.nombre, href: `/municipio/${slugify(m.nombre)}` })
  return crumbs
}

export function buildZonaBreadcrumb(
  z: Zona,
  municipios: MunicipioRef[],
  subregiones: Subregion[],
): BreadcrumbSegment[] {
  const muni = municipios.find((m) => m.id === z.municipioId)
  if (!muni) return [{ label: z.nombre, href: `/zona/${slugify(z.nombre)}` }]
  return [
    ...buildMunicipioBreadcrumb(muni, subregiones),
    { label: z.nombre, href: `/zona/${slugify(z.nombre)}` },
  ]
}

export function buildComunaBreadcrumb(
  c: Comuna,
  municipios: MunicipioRef[],
  subregiones: Subregion[],
  zonas: Zona[],
): BreadcrumbSegment[] {
  const muni = municipios.find((m) => m.id === c.municipioId)
  if (!muni) return [{ label: c.nombre, href: `/comuna/${slugify(c.nombre)}` }]
  const zona = zonas.find((z) => z.id === c.zonaId)
  const base = buildMunicipioBreadcrumb(muni, subregiones)
  if (zona) base.push({ label: zona.nombre, href: `/zona/${slugify(zona.nombre)}` })
  base.push({ label: c.nombre, href: `/comuna/${slugify(c.nombre)}` })
  return base
}
