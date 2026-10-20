export const AUTH_POLICY = {
  cookie: '__Host-scholaris_session',
  absoluteLifetimeMs: 7 * 24 * 60 * 60 * 1000,
  inactivityMs: 30 * 60 * 1000,
  recentAuthenticationMs: 5 * 60 * 1000,
  recoveryLifetimeMs: 15 * 60 * 1000,
} as const

export class AuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 403) {
    super(message)
  }
}

export function validateRequestOrigin(request: Request, allowedOrigins: readonly string[]) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AuthError('ORIGIN_INVALID', 'Cross-site requests are not allowed.')
  }
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  function parseOrigin(value: string): string {
    try {
      const parsed = new URL(value)
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error()
      return parsed.origin
    } catch {
      throw new AuthError('ORIGIN_INVALID', 'Invalid request origin.')
    }
  }
  const originValue = origin ? parseOrigin(origin) : null
  const refererValue = referer ? parseOrigin(referer) : null
  if (origin && origin !== originValue) throw new AuthError('ORIGIN_INVALID', 'Invalid Origin header.')
  if (!originValue && !refererValue) throw new AuthError('ORIGIN_MISSING', 'Request origin evidence is required.')
  if (originValue && refererValue && originValue !== refererValue) throw new AuthError('ORIGIN_INVALID', 'Origin and Referer do not match.')
  if ((originValue && !allowedOrigins.includes(originValue)) || (refererValue && !allowedOrigins.includes(refererValue))) {
    throw new AuthError('ORIGIN_INVALID', 'Request origin is not allowed.')
  }
}

export function sessionIsValid(session: { created_at: string; expires_at: string; last_activity_at: string; revoked_at?: string | null }, now = Date.now()) {
  const created = Date.parse(session.created_at)
  const expiry = Date.parse(session.expires_at)
  const activity = Date.parse(session.last_activity_at)
  return !session.revoked_at && [created, expiry, activity].every(Number.isFinite)
    && created <= now && activity <= now && now < Math.min(expiry, created + AUTH_POLICY.absoluteLifetimeMs)
    && now - activity < AUTH_POLICY.inactivityMs
}

export function requireRecentAuthentication(authenticatedAt: string, now = Date.now()) {
  const authenticated = Date.parse(authenticatedAt)
  if (!Number.isFinite(authenticated) || authenticated > now || now - authenticated >= AUTH_POLICY.recentAuthenticationMs) {
    throw new AuthError('REAUTH_REQUIRED', 'Confirm your password to continue.', 428)
  }
}

export function sessionCookie(value: string, maxAge: number) {
  return `${AUTH_POLICY.cookie}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}`
}