import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

function makeReq(path: string, cookieValue?: string): NextRequest {
  const url = `http://localhost${path}`
  const req = new NextRequest(url)
  if (cookieValue) {
    req.cookies.set('auth-session', cookieValue)
  }
  return req
}

function makeJwt(expOffsetSeconds: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expOffsetSeconds, uid: 'test' }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.sig`
}

describe('proxy (auth guard)', () => {
  it('passes through requests to /login without a cookie', () => {
    const req = makeReq('/login')
    const result = proxy(req)
    expect(result).toBeUndefined()
  })

  it('passes through requests to /login even with a valid cookie', () => {
    const jwt = makeJwt(3600)
    const req = makeReq('/login', jwt)
    const result = proxy(req)
    expect(result).toBeUndefined()
  })

  it('passes through requests to /api/* regardless of auth', () => {
    const req = makeReq('/api/auth/session')
    const result = proxy(req)
    expect(result).toBeUndefined()
  })

  it('redirects to /login when auth-session cookie is missing', () => {
    const req = makeReq('/dashboard')
    const result = proxy(req)
    expect(result).not.toBeUndefined()
    const location = result!.headers.get('location')!
    expect(location).toContain('/login')
    expect(location).toContain('from=')
    expect(location).toContain(encodeURIComponent('/dashboard'))
  })

  it('redirects to /login when cookie JWT is expired', () => {
    const expiredJwt = makeJwt(-100)
    const req = makeReq('/testigos', expiredJwt)
    const result = proxy(req)
    expect(result).not.toBeUndefined()
    const location = result!.headers.get('location')!
    expect(location).toContain('/login')
  })

  it('passes through when cookie JWT is valid and not expired', () => {
    const validJwt = makeJwt(3600)
    const req = makeReq('/dashboard', validJwt)
    const result = proxy(req)
    expect(result).toBeUndefined()
  })

  it('passes through for /_next/* static files', () => {
    const req = makeReq('/_next/static/chunk.js')
    const result = proxy(req)
    expect(result).toBeUndefined()
  })
})
