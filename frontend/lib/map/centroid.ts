import type { PuestoRef } from '@/lib/api/ref-data'

export type MunicipioCentroid = {
  municipioId: number
  lat: number
  lon: number
}

export function computeMunicipioCentroids(puestos: PuestoRef[]): Map<number, MunicipioCentroid> {
  const acc = new Map<number, { sumLat: number; sumLon: number; count: number }>()
  for (const p of puestos) {
    if (p.lat == null || p.lon == null) continue
    const cur = acc.get(p.municipioId) ?? { sumLat: 0, sumLon: 0, count: 0 }
    cur.sumLat += p.lat
    cur.sumLon += p.lon
    cur.count++
    acc.set(p.municipioId, cur)
  }
  const result = new Map<number, MunicipioCentroid>()
  for (const [municipioId, { sumLat, sumLon, count }] of acc) {
    if (count > 0) result.set(municipioId, { municipioId, lat: sumLat / count, lon: sumLon / count })
  }
  return result
}
