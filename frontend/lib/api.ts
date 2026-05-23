import { getIdToken } from 'firebase/auth'
import { auth } from './firebase'
import { ZodSchema } from 'zod'

const BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  try {
    return await getIdToken(user, /* forceRefresh */ false)
  } catch {
    return null
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  etag?: string
  signal?: AbortSignal
}

async function request<T>(
  path: string,
  schema: ZodSchema<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, etag, signal } = options
  const token = await getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (etag) headers['If-Match'] = etag

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      const from = encodeURIComponent(window.location.pathname)
      window.location.replace(`/login?from=${from}`)
    }
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    let errorBody: unknown
    try {
      errorBody = await res.json()
    } catch {
      /* empty */
    }
    throw new ApiError(res.status, `HTTP ${res.status}`, errorBody)
  }

  const json: unknown = await res.json()
  return schema.parse(json)
}

async function getBlob(path: string): Promise<Blob> {
  const token = await getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { headers })

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      const from = encodeURIComponent(window.location.pathname)
      window.location.replace(`/login?from=${from}`)
    }
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  return res.blob()
}

export const api = {
  get: <T>(path: string, schema: ZodSchema<T>, signal?: AbortSignal) =>
    request(path, schema, { method: 'GET', signal }),
  post: <T>(path: string, schema: ZodSchema<T>, body: unknown) =>
    request(path, schema, { method: 'POST', body }),
  patch: <T>(path: string, schema: ZodSchema<T>, body: unknown, etag?: string) =>
    request(path, schema, { method: 'PATCH', body, etag }),
  delete: <T>(path: string, schema: ZodSchema<T>) => request(path, schema, { method: 'DELETE' }),
  blob: (path: string) => getBlob(path),
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'Conflicto: otro coordinador ya existe en este ámbito.'
    if (err.status === 412) return 'El registro fue modificado por otro usuario. Recargue.'
    if (err.status === 403) return 'No tiene permisos para esta acción.'
    if (err.status === 404) return 'Registro no encontrado.'
    return `Error del servidor (${err.status}).`
  }
  if (err instanceof Error) return err.message
  return 'Error desconocido.'
}
