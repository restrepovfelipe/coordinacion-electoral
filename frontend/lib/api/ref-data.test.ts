import { describe, it, expect, vi } from 'vitest'

vi.mock('../api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }))

import {
  SubregionSchema,
  MunicipioRefSchema,
  ZonaSchema,
  ComunaSchema,
  PuestoRefSchema,
} from './ref-data'

// Backend returns `name` (not `nombre`) for all ref-data entities.
// These tests document the contract and guard against future schema drift.
describe('ref-data schemas — backend field is `name`', () => {
  it('SubregionSchema parses { id, name }', () => {
    const r = SubregionSchema.safeParse({ id: 1, name: 'AMVA' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('AMVA')
  })

  it('SubregionSchema rejects { id, nombre } (old field)', () => {
    const r = SubregionSchema.safeParse({ id: 1, nombre: 'AMVA' })
    expect(r.success).toBe(false)
  })

  it('MunicipioRefSchema parses { id, name, subregionId }', () => {
    const r = MunicipioRefSchema.safeParse({ id: 2, name: 'MEDELLIN', subregionId: 1 })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('MEDELLIN')
  })

  it('ZonaSchema parses { id, name, municipioId }', () => {
    const r = ZonaSchema.safeParse({ id: 3, name: 'Norte', municipioId: 2 })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('Norte')
  })

  it('ComunaSchema parses { id, name, municipioId, zonaId: null }', () => {
    const r = ComunaSchema.safeParse({ id: 4, name: 'La Candelaria', municipioId: 2, zonaId: null })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('La Candelaria')
  })

  it('PuestoRefSchema parses { id, name, comunaId, municipioId, mesas, votosTotal }', () => {
    const r = PuestoRefSchema.safeParse({
      id: 5, name: 'IE San Marcos', comunaId: 4, municipioId: 2, mesas: 10, votosTotal: null,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('IE San Marcos')
  })
})
