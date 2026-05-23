'use client'

import { createContext, useContext, useEffect, useRef, ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getIdToken } from 'firebase/auth'
import { auth } from './firebase'

const BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? ''

// ── Event types ───────────────────────────────────────────────────────────────

export type SseEventType =
  | 'testigo:count_changed'
  | 'prioridad:config_changed'
  | 'prioridad:puesto_changed'
  | 'asignacion:puesto_changed'
  | 'coordinador:adhoc_changed'

export type SseEvent = {
  type: SseEventType
  puestoId?: number
  municipioId?: number
  scopeType?: string
  scopeId?: number
  payload: Record<string, unknown>
}

type Listener = (event: SseEvent) => void

// ── Singleton manager ─────────────────────────────────────────────────────────

class SseManager {
  private es: EventSource | null = null
  private token: string | null = null
  private listeners = new Map<SseEventType, Set<Listener>>()
  private retryDelay = 1_000
  private maxDelay = 30_000
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private shouldConnect = false

  setToken(token: string | null) {
    this.token = token
    if (token) {
      this.shouldConnect = true
      this.connect()
    } else {
      this.shouldConnect = false
      this.disconnect()
    }
  }

  subscribe(eventType: SseEventType, listener: Listener) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)
    return () => this.unsubscribe(eventType, listener)
  }

  private unsubscribe(eventType: SseEventType, listener: Listener) {
    this.listeners.get(eventType)?.delete(listener)
  }

  private connect() {
    if (this.es || !this.token || !this.shouldConnect) return
    const url = `${BASE}/events?token=${encodeURIComponent(this.token)}`
    this.es = new EventSource(url)

    this.es.onopen = () => {
      this.retryDelay = 1_000
    }

    this.es.onmessage = (e: MessageEvent) => {
      if (e.data === 'heartbeat') return
      try {
        const event = JSON.parse(e.data as string) as SseEvent
        this.dispatch(event)
      } catch {
        // ignore malformed
      }
    }

    this.es.onerror = () => {
      this.disconnect()
      if (this.shouldConnect) {
        this.retryTimer = setTimeout(() => {
          this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay)
          this.refreshTokenAndConnect()
        }, this.retryDelay)
      }
    }
  }

  private disconnect() {
    this.es?.close()
    this.es = null
  }

  private async refreshTokenAndConnect() {
    const user = auth.currentUser
    if (!user) return
    try {
      this.token = await getIdToken(user, true)
      this.connect()
    } catch {
      // auth expired — will reconnect when user re-authenticates
    }
  }

  private dispatch(event: SseEvent) {
    this.listeners.get(event.type as SseEventType)?.forEach((fn) => fn(event))
  }

  destroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.shouldConnect = false
    this.disconnect()
  }
}

const sseManager = new SseManager()
export { sseManager }

// ── React provider ────────────────────────────────────────────────────────────

const SseContext = createContext<SseManager>(sseManager)

export function SseProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await getIdToken(user)
          sseManager.setToken(token)
        } catch {
          sseManager.setToken(null)
        }
      } else {
        sseManager.setToken(null)
      }
    })
    return () => {
      unsub()
    }
  }, [])

  return <SseContext.Provider value={sseManager}>{children}</SseContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSseEvent(eventType: SseEventType, handler: Listener) {
  const manager = useContext(SseContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const unsub = manager.subscribe(eventType, (e) => handlerRef.current(e))
    return unsub
  }, [manager, eventType])
}
