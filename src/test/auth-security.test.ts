// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AUTH_POLICY, requireRecentAuthentication, sessionCookie, sessionIsValid, validateRequestOrigin } from '@/lib/auth-policy'
import { hasPermission } from '@/lib/shopflow-permissions'

const origin = 'https://shop.example'
const request = (headers: Record<string, string>) => new Request(`${origin}/api/shop/status`, { method: 'POST', headers })
describe('Custom authentication policy', () => {
  it('accepts same-origin requests', () => expect(() => validateRequestOrigin(request({ origin, referer: `${origin}/`, 'sec-fetch-site': 'same-origin' }), [origin])).not.toThrow())
  it('accepts legitimate allowlisted same-site requests', () => expect(() => validateRequestOrigin(request({ origin: 'https://staff.shop.example', referer: 'https://staff.shop.example/team', 'sec-fetch-site': 'same-site' }), [origin, 'https://staff.shop.example'])).not.toThrow())
  it('accepts Referer evidence only under the explicit allowlist policy', () => expect(() => validateRequestOrigin(request({ referer: `${origin}/` }), [origin])).not.toThrow())
  it('rejects cross-site Fetch Metadata even with an allowlisted Origin', () => expect(() => validateRequestOrigin(request({ origin, 'sec-fetch-site': 'cross-site' }), [origin])).toThrow())
  it('rejects inconsistent Origin and Referer', () => expect(() => validateRequestOrigin(request({ origin, referer: 'https://attacker.example/' }), [origin])).toThrow())
  it('rejects missing origin evidence', () => expect(() => validateRequestOrigin(request({}), [origin])).toThrow())
  it('rejects null Origin', () => expect(() => validateRequestOrigin(request({ origin: 'null' }), [origin])).toThrow())
  it('rejects an Origin containing a path', () => expect(() => validateRequestOrigin(request({ origin: `${origin}/` }), [origin])).toThrow())
  it('uses the exact host-only secure cookie', () => {
    const cookie = sessionCookie('example', 604800)
    expect(cookie).toBe('__Host-scholaris_session=example; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800')
    expect(cookie).not.toContain('Domain=')
  })
  const created = Date.UTC(2026, 9, 20)
  const session = (now: number) => ({ created_at: new Date(created).toISOString(), expires_at: new Date(created + 604800000).toISOString(), last_activity_at: new Date(now).toISOString(), revoked_at: null })
  it('expires exactly seven days after creation despite recent activity', () => expect(sessionIsValid(session(created + 604800000), created + 604800000)).toBe(false))
  it('does not trust an extended database deadline', () => expect(sessionIsValid({ ...session(created + 604800001), expires_at: new Date(created + 1209600000).toISOString() }, created + 604800001)).toBe(false))
  it('allows an unexpired recently active session', () => expect(sessionIsValid(session(created + 60000), created + 60001)).toBe(true))
  it('expires at 30 minutes of inactivity', () => expect(sessionIsValid(session(created), created + 1800000)).toBe(false))
  it('rejects revoked sessions', () => expect(sessionIsValid({ ...session(created), revoked_at: new Date(created).toISOString() }, created)).toBe(false))
  it('requires recent authentication after five minutes', () => expect(() => requireRecentAuthentication(new Date(created).toISOString(), created + 300000)).toThrow())
  it('accepts reauthentication inside five minutes', () => expect(() => requireRecentAuthentication(new Date(created).toISOString(), created + 299999)).not.toThrow())
  it('denies Auditor mutations but allows scoped reads', () => { expect(hasPermission('Auditor', 'sales', true)).toBe(false); expect(hasPermission('Auditor', 'sales', false)).toBe(true) })
  it('does not allow a sales agent to manage team access', () => expect(hasPermission('Sales Agent', 'team')).toBe(false))
  it('fails closed for unknown roles', () => expect(hasPermission('fake-admin', 'sales')).toBe(false))
  it('sets a seven-day absolute deadline and a 30-minute idle timeout', () => { expect(AUTH_POLICY.absoluteLifetimeMs).toBe(604800000); expect(AUTH_POLICY.inactivityMs).toBe(1800000) })
})