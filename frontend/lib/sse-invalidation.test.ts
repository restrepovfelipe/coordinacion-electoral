import { describe, it, expect, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { invalidateForSseEvent } from './sse-invalidation'
import type { SseEvent } from './sse'

function makeQc() {
  const invalidate = vi.fn()
  const qc = { invalidateQueries: invalidate } as unknown as QueryClient
  return { qc, invalidate }
}

describe('invalidateForSseEvent', () => {
  describe('testigo:count_changed', () => {
    it('invalidates dashboard stats', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'testigo:count_changed', payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['dashboard', 'stats'] }),
      )
    })

    it('invalidates sidebar-counts', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'testigo:count_changed', payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['sidebar-counts'] }),
      )
    })

    it('invalidates municipio when id present', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'testigo:count_changed', municipioId: 42, payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['dashboard', 'municipio', 42] }),
      )
    })
  })

  describe('asignacion:puesto_changed', () => {
    it('invalidates specific puesto', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'asignacion:puesto_changed', puestoId: 99, payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['dashboard', 'puesto', 99] }),
      )
    })

    it('invalidates dashboard stats', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'asignacion:puesto_changed', payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['dashboard', 'stats'] }),
      )
    })

    it('invalidates sidebar-counts', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'asignacion:puesto_changed', payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['sidebar-counts'] }),
      )
    })
  })

  describe('coordinador:adhoc_changed', () => {
    it('invalidates coordinador key', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = {
        type: 'coordinador:adhoc_changed',
        scopeType: 'municipio',
        scopeId: 7,
        payload: {},
      }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['coordinador', 'municipio', 7] }),
      )
    })

    it('does NOT invalidate dashboard stats', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = {
        type: 'coordinador:adhoc_changed',
        scopeType: 'municipio',
        scopeId: 7,
        payload: {},
      }
      invalidateForSseEvent(qc, event)
      const calls = invalidate.mock.calls.map((c) => JSON.stringify(c[0]))
      const statsCall = calls.find((c) => c.includes('"stats"'))
      expect(statsCall).toBeUndefined()
    })
  })

  describe('prioridad:config_changed', () => {
    it('invalidates prio-config', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'prioridad:config_changed', payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['prio-config'] }),
      )
    })

    it('invalidates dashboard stats', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'prioridad:config_changed', payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['dashboard', 'stats'] }),
      )
    })
  })

  describe('prioridad:puesto_changed', () => {
    it('invalidates specific prio puesto', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'prioridad:puesto_changed', puestoId: 55, payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['prio', 55] }),
      )
    })

    it('invalidates prio list', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'prioridad:puesto_changed', puestoId: 55, payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['prio', 'list'] }),
      )
    })

    it('invalidates dashboard puesto', () => {
      const { qc, invalidate } = makeQc()
      const event: SseEvent = { type: 'prioridad:puesto_changed', puestoId: 55, payload: {} }
      invalidateForSseEvent(qc, event)
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['dashboard', 'puesto', 55] }),
      )
    })
  })
})
