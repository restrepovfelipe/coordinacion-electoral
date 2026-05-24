import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PREFIXES = ['/login', '/api/', '/_next/', '/favicon.ico']

function isExpiredOrMissing(token: string | undefined): boolean {
  if (!token) return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      exp?: number
    }
    if (typeof payload.exp !== 'number') return true
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function proxy(req: NextRequest): NextResponse | undefined {
  const { pathname } = req.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return undefined
  }

  const token = req.cookies.get('auth-session')?.value

  if (isExpiredOrMissing(token)) {
    const from = encodeURIComponent(pathname)
    const loginUrl = new URL(`/login?from=${from}`, req.url)
    return NextResponse.redirect(loginUrl)
  }

  return undefined
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
