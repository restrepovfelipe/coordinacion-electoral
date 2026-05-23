import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
}))
vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('fake-token'),
}))

import { ComparendoSchema } from './comparendos'

describe('ComparendoSchema', () => {
  it('parses a valid comparendo', () => {
    const input = {
      id: 1, scopeType: 'COMUNA', scopeId: 5,
      date: '2024-03-15T00:00:00.000Z',
      description: 'Comparendo de prueba',
      status: 'activo', notes: null,
      createdById: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }
    const result = ComparendoSchema.parse(input)
    expect(result.id).toBe(1)
    expect(result.description).toBe('Comparendo de prueba')
  })

  it('rejects missing required fields', () => {
    expect(() => ComparendoSchema.parse({ id: 1 })).toThrow()
  })
})
