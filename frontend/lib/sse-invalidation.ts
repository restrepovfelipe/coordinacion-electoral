import type { QueryClient } from '@tanstack/react-query'
import type { SseEvent } from './sse'

/**
 * Maps each SSE event type to the TanStack Query keys that must be invalidated.
 * Called by useSseInvalidation hook inside Providers.
 */
export function invalidateForSseEvent(queryClient: QueryClient, event: SseEvent): void {
  switch (event.type) {
    case 'testigo:count_changed': {
      // Invalidate the specific municipio + the global stats
      if (event.municipioId) {
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'municipio', event.municipioId] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'zona'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'comuna'] })
      }
      // Always refresh global stats and sidebar counts
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      void queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })
      break
    }

    case 'asignacion:puesto_changed': {
      if (event.puestoId) {
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'puesto', event.puestoId] })
      }
      // Bubble up: puesto → comuna → zona → municipio → stats
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      void queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] })
      break
    }

    case 'coordinador:adhoc_changed': {
      if (event.scopeType && event.scopeId != null) {
        void queryClient.invalidateQueries({
          queryKey: ['coordinador', event.scopeType, event.scopeId],
        })
      }
      break
    }

    case 'prioridad:config_changed': {
      void queryClient.invalidateQueries({ queryKey: ['prio-config'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      break
    }

    case 'prioridad:puesto_changed': {
      if (event.puestoId) {
        void queryClient.invalidateQueries({ queryKey: ['prio', event.puestoId] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'puesto', event.puestoId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['prio', 'list'] })
      break
    }
  }
}
