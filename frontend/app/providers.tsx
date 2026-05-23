'use client'

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, ReactNode } from 'react'
import { SseProvider, useSseEvent } from '@/lib/sse'
import { AuthProvider } from '@/lib/auth/auth-context'
import { invalidateForSseEvent } from '@/lib/sse-invalidation'

function SseInvalidator() {
  const queryClient = useQueryClient()
  useSseEvent(
    'testigo:count_changed',
    useCallback((e) => invalidateForSseEvent(queryClient, e), [queryClient]),
  )
  useSseEvent(
    'asignacion:puesto_changed',
    useCallback((e) => invalidateForSseEvent(queryClient, e), [queryClient]),
  )
  useSseEvent(
    'coordinador:adhoc_changed',
    useCallback((e) => invalidateForSseEvent(queryClient, e), [queryClient]),
  )
  useSseEvent(
    'prioridad:config_changed',
    useCallback((e) => invalidateForSseEvent(queryClient, e), [queryClient]),
  )
  useSseEvent(
    'prioridad:puesto_changed',
    useCallback((e) => invalidateForSseEvent(queryClient, e), [queryClient]),
  )
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              if (error instanceof Error && error.message.includes('401')) return false
              return failureCount < 2
            },
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SseProvider>
          <SseInvalidator />
          {children}
        </SseProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
