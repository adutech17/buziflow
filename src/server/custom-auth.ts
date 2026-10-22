import { z } from 'zod'
import { AUTH_POLICY, AuthError, requireRecentAuthentication, sessionCookie, sessionIsValid, validateRequestOrigin } from '@/lib/auth-policy'
import { BUSINESS_ROLES, isValidPassword } from '@/lib/shopflow-constants'
import { hasPermission } from '@/lib/shopflow-permissions'
import { database, databaseError } from './database'
import { digestToken, hashPassword, randomToken, verifyPassword } from './auth-crypto'

export type Profile = { id: string; workspace_id: string; name: string; role: string; active: boolean; avatar_url: string | null; created_at: string }
export type SessionCtx = {
  userId: string; sessionId: string; csrfToken: string; profile: Profile;
  email: string; expiresAt: string; authenticatedAt: string; workspaceId: string;
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...extra,
  } })
}
export function bad(message: string, status = 400) { return json({ error: message }, status) }

export function allowedOrigins() {
  const configured = process.env['SHOPFLOW_APP_ORIGINS']
  const origins = (configured ?? 'https://seamless-data-handoff.lovable.app,https://id-preview--244916b9-195b-4503-b642-7a7dfc5b0c75.lovable.app').split(',').map(value => value.trim()).filter(Boolean)
  // Local development only. Never derive the trust list from Host/forwarded headers.
  if (import.meta.env.DEV) origins.push('http://localhost:8080')
  return origins
}
export function validateOrigin(request: Request) { validateRequestOrigin(request, allowedOrigins()) }

export async function bodyOf(request: Request, limit = 256 * 1024): Promise<Record<string, any>> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw new AuthError('CONTENT_TYPE_INVALID', 'Use a JSON request.', 415)
  }
  if (Number(request.headers.get('content-length')) > limit) throw new AuthError('BODY_TOO_LARGE', 'Request is too large.', 413)
  const reader = request.body?.getReader()
  if (!reader) return {}
  const chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    size += result.value.byteLength
    if (size > limit) { await reader.cancel(); throw new AuthError('BODY_TOO_LARGE', 'Request is too large.', 413) }
    chunks.push(result.value)
  }
  const joined = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  try {
    const value = JSON.parse(new TextDecoder().decode(joined))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch { throw new AuthError('BODY_INVALID', 'Invalid JSON request.', 400) }
}

function cookieId(request: Request) {
  const entries = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${AUTH_POLICY.cookie}=`))
  if (entries.length !== 1) return ''
  const entry = entries[0]
  if (!entry) return ''
  const value = entry.slice(AUTH_POLICY.cookie.length + 1)
  return /^[a-f0-9]{64}$/.test(value) ? value : ''
}

export async function getSession(request: Request, write: boolean, _body?: unknown, activity = true): Promise<SessionCtx> {
  if (write) validateOrigin(request)
  const raw = cookieId(request)
  if (!raw) throw new AuthError('SESSION_EXPIRED', 'Sign in to continue.', 401)
  const db = database()
  const id = await digestToken(raw)
  const { data, error } = await db.rpc('consume_custom_session', { p_id: id, p_csrf: request.headers.get('x-csrf-token'), p_write: write, p_activity: activity })
  if (error?.message?.includes('CSRF_INVALID')) throw new AuthError('CSRF_INVALID', 'Security token is invalid. Refresh and try again.')
  databaseError(error)
  const session = data?.[0]
  if (!session || !sessionIsValid(session)) throw new AuthError('SESSION_EXPIRED', 'Your session expired. Sign in again.', 401)
  const [accountR, profileR, memberR] = await Promise.all([
    db.from('app_accounts').select('id,email,active').eq('id', session.user_id).single(),
    db.from('profiles').select('*').eq('id', session.user_id).single(),
    db.from('workspace_memberships').select('role,active').eq('user_id', session.user_id).eq('workspace_id', session.workspace_id).single(),
  ])
  databaseError(accountR.error); databaseError(profileR.error); databaseError(memberR.error)
  if (!accountR.data?.active || !profileR.data?.active || !memberR.data?.active) throw new AuthError('SESSION_EXPIRED', 'Account access has been revoked.', 401)
  return { userId: session.user_id, sessionId: id, csrfToken: session.csrf_token,
    profile: { ...profileR.data, workspace_id: session.workspace_id, role: memberR.data.role } as Profile,
    email: accountR.data.email, expiresAt: session.expires_at, authenticatedAt: session.authenticated_at, workspaceId: session.workspace_id }
}

export function permit(ctx: SessionCtx, key: string, write = true) { return hasPermission(ctx.profile.role, key, write) }
export function guard(ctx: SessionCtx | null, key: string, write = true) {
  if (!ctx) return bad('Sign in to continue.', 401)
  return permit(ctx, key, write) ? null : bad('Your role does not have permission for this action.', 403)
}
export function stepUp(ctx: SessionCtx) { requireRecentAuthentication(ctx.authenticatedAt) }
export function publicUser(profile: Profile, email = '') {
  return { name: profile.name, email, role: profile.role, avatarUrl: profile.avatar_url ?? '' }
}
export async function emailMap(userIds: string[]) {
  const result = new Map<string, string>()
  if (!userIds.length) return result
  const { data, error } = await database().from('app_accounts').select('id,email').in('id', [...new Set(userIds)])
  databaseError(error)
  for (const account of data ?? []) result.set(account.id, account.email)
  return result
}

async function rateLimit(request: Request, action: string, email = '', limit = 10) {
  const db = database()
  // Trust only the edge-provided IP header, never caller-supplied forwarding chains.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const keys = [action + ':ip:' + ip, ...(email ? [action + ':account:' + email] : [])]
  for (const value of keys) {
    const { data, error } = await db.rpc('auth_rate_limit', { p_key: await digestToken(value), p_limit: limit, p_window_seconds: 900 })
    databaseError(error)
    if (!data) throw new AuthError('RATE_LIMITED', 'Too many attempts. Try again later.', 429)
  }
}
const emailSchema = z.string().trim().toLowerCase().email().max(254)
const passwordSchema = z.string().min(1).max(128)
const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema })
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new AuthError('VALIDATION_FAILED', 'Check your account details.', 400)
  return result.data
}
async function verifyAccount(email: string, password: string) {
  const { data, error } = await database().from('app_accounts').select('*').eq('email', email).maybeSingle()
  databaseError(error)
  // Missing users receive an equivalent bcrypt operation to reduce timing leakage.
  const encoded = data?.password_hash ?? '$2b$12$LQv3c1yqBWVHxkd0LHAkCOY5./Vb5oNQck0.Z7xJcbF1X4.RxtOQK'
  const matches = await verifyPassword(password, encoded)
  if (!matches || !data?.active) throw new AuthError('CREDENTIALS_INVALID', 'Email or password is incorrect.', 401)
  return data
}

async function createSession(request: Request, account: any) {
  const db = database()
  const { data: profile, error: pe } = await db.from('profiles').select('*').eq('id', account.id).single()
  databaseError(pe)
  const { data: memberships, error: me } = await db.from('workspace_memberships').select('*').eq('user_id', account.id).eq('active', true).order('workspace_id')
  databaseError(me)
  const membership = memberships?.find(value => value.workspace_id === profile?.workspace_id) ?? memberships?.[0]
  if (!profile?.active || !membership) throw new AuthError('CREDENTIALS_INVALID', 'Email or password is incorrect.', 401)
  const raw = randomToken(); const csrf = randomToken(); const now = new Date().toISOString()
  const old = cookieId(request)
  if (old) {
    const { error } = await db.from('custom_sessions').update({ revoked_at: now }).eq('id', await digestToken(old))
    databaseError(error)
  }
  const expiresAt = new Date(Date.now() + AUTH_POLICY.absoluteLifetimeMs).toISOString()
  const { error } = await db.from('custom_sessions').insert({ id: await digestToken(raw), user_id: account.id,
    workspace_id: membership.workspace_id, csrf_token: csrf, security_version: account.security_version,
    created_at: now, expires_at: expiresAt, last_activity_at: now, authenticated_at: now,
    user_agent_hash: await digestToken(request.headers.get('user-agent') ?? '') })
  databaseError(error)
  return json({ csrfToken: csrf, expiresAt, user: publicUser({ ...profile, role: membership.role } as Profile, account.email) }, 200,
    { 'set-cookie': sessionCookie(raw, AUTH_POLICY.absoluteLifetimeMs / 1000) })
}

export async function createAccount(body: unknown, workspace?: string) {
  const values = parse(z.object({ name: z.string().trim().min(2).max(80), email: emailSchema,
    password: passwordSchema.refine(isValidPassword), role: z.enum(BUSINESS_ROLES).optional() }), body)
  const role = workspace ? values.role : 'Managing Director'
  if (!role || (workspace && role === 'Managing Director')) throw new AuthError('VALIDATION_FAILED', 'Choose an allowed team role.', 400)
  const { data, error } = await database().rpc('create_custom_account', {
    p_email: values.email, p_hash: await hashPassword(values.password), p_name: values.name, p_role: role, p_workspace: workspace ?? null,
  })
  if (error?.code === '23505') throw new AuthError('ACCOUNT_EXISTS', 'That email already has an account.', 409)
  if (error?.message?.includes('REGISTRATION_CLOSED')) throw new AuthError('REGISTRATION_CLOSED', 'Ask the Managing Director to create your account.')
  databaseError(error)
  return { id: data, name: values.name, email: values.email, role }
}

export async function handleSession(request: Request) {
  try {
    const ctx = await getSession(request, false, undefined, false)
    const { data, error } = await database().from('workspace_memberships').select('workspace_id,workspaces(name)').eq('user_id', ctx.userId).eq('active', true)
    databaseError(error)
    return json({ authenticated: true, csrfToken: ctx.csrfToken, expiresAt: ctx.expiresAt,
      user: publicUser(ctx.profile, ctx.email), workspaceId: ctx.workspaceId,
      workspaces: (data ?? []).map(value => ({ id: value.workspace_id, name: (value.workspaces as any)?.name ?? '' })) })
  } catch (error) {
    if (error instanceof AuthError && error.code === 'SESSION_EXPIRED') return json({ authenticated: false }, 200, { 'set-cookie': sessionCookie('', 0) })
    throw error
  }
}
export async function handleRegister(request: Request) {
  validateOrigin(request); await rateLimit(request, 'register', '', 5)
  const account = await createAccount(await bodyOf(request))
  const { data, error } = await database().from('app_accounts').select('*').eq('id', account.id).single()
  databaseError(error)
  return createSession(request, data)
}
export async function handleLogin(request: Request) {
  validateOrigin(request)
  const values = parse(credentialsSchema, await bodyOf(request))
  await rateLimit(request, 'login', values.email)
  const account = await verifyAccount(values.email, values.password)
  return createSession(request, account)
}
export async function handleLogout(request: Request) {
  const ctx = await getSession(request, true)
  const { error } = await database().from('custom_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', ctx.sessionId).is('revoked_at', null)
  databaseError(error)
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) })
}

async function rotate(request: Request, ctx: SessionCtx, workspace?: string) {
  const raw = randomToken(); const csrf = randomToken()
  const { data, error } = await database().rpc('rotate_custom_session', { p_old: ctx.sessionId, p_new: await digestToken(raw), p_csrf: csrf, p_workspace: workspace ?? null })
  databaseError(error)
  const session = data?.[0]
  if (!session) throw new AuthError('SESSION_EXPIRED', 'Session changed. Sign in again.', 401)
  return json({ ok: true, csrfToken: csrf, expiresAt: session.expires_at }, 200,
    { 'set-cookie': sessionCookie(raw, (Date.parse(session.expires_at) - Date.now()) / 1000) })
}
export async function handleReauthenticate(request: Request) {
  const ctx = await getSession(request, true)
  const body = parse(z.object({ password: passwordSchema }), await bodyOf(request))
  await rateLimit(request, 'reauthenticate', ctx.email, 5)
  await verifyAccount(ctx.email, body.password)
  return rotate(request, ctx)
}
export async function handleSwitchWorkspace(request: Request) {
  const ctx = await getSession(request, true)
  const body = parse(z.object({ workspaceId: z.string().uuid() }), await bodyOf(request))
  const { data, error } = await database().from('workspace_memberships').select('active').eq('user_id', ctx.userId).eq('workspace_id', body.workspaceId).maybeSingle()
  databaseError(error)
  if (!data?.active) throw new AuthError('FORBIDDEN', 'You do not have access to this workspace.')
  return rotate(request, ctx, body.workspaceId)
}
export async function handleProfile(request: Request) {
  const ctx = await getSession(request, true)
  const values = parse(z.object({ name: z.string().trim().min(2).max(80), email: emailSchema,
    avatarUrl: z.union([z.literal(''), z.string().url().max(1000).refine(value => value.startsWith('https://'))]) }), await bodyOf(request))
  const db = database()
  const emailChanged = values.email !== ctx.email
  if (emailChanged) {
    stepUp(ctx)
    const { error } = await db.from('app_accounts').update({ email: values.email }).eq('id', ctx.userId)
    if (error?.code === '23505') throw new AuthError('ACCOUNT_EXISTS', 'That email already has an account.', 409)
    databaseError(error)
  }
  const { error } = await db.from('profiles').update({ name: values.name, avatar_url: values.avatarUrl || null, updated_at: new Date().toISOString() }).eq('id', ctx.userId)
  databaseError(error)
  return json({ user: { name: values.name, email: values.email, role: ctx.profile.role, avatarUrl: values.avatarUrl }, signedOut: emailChanged }, 200,
    emailChanged ? { 'set-cookie': sessionCookie('', 0) } : {})
}
export async function handlePassword(request: Request) {
  const ctx = await getSession(request, true)
  const values = parse(z.object({ currentPassword: passwordSchema, newPassword: passwordSchema.refine(isValidPassword) }), await bodyOf(request))
  if (values.currentPassword === values.newPassword) return bad('Choose a password different from your current one.')
  await rateLimit(request, 'password', ctx.email, 5)
  await verifyAccount(ctx.email, values.currentPassword)
  const { data, error } = await database().rpc('replace_custom_password', { p_user: ctx.userId, p_hash: await hashPassword(values.newPassword), p_recovery: null })
  databaseError(error)
  if (!data) throw new AuthError('SESSION_EXPIRED', 'Account access was revoked.', 401)
  return json({ ok: true, signedOut: true }, 200, { 'set-cookie': sessionCookie('', 0) })
}
export async function handleForgotPassword(request: Request) {
  validateOrigin(request)
  const { email } = parse(z.object({ email: emailSchema }), await bodyOf(request))
  await rateLimit(request, 'recovery', email, 5)
  const apiKey = process.env['SHOPFLOW_RECOVERY_EMAIL_KEY']
  const from = process.env['SHOPFLOW_RECOVERY_EMAIL_FROM']
  if (!apiKey || !from) throw new AuthError('RECOVERY_NOT_CONFIGURED', 'Password recovery email is not configured. Contact your Managing Director.', 503)
  const db = database(); const { data: account, error } = await db.from('app_accounts').select('id,active').eq('email', email).maybeSingle()
  databaseError(error)
  if (account?.active) {
    const raw = randomToken(); const id = await digestToken(raw)
    const { error: insertError } = await db.from('auth_recovery_tokens').insert({ id, user_id: account.id, expires_at: new Date(Date.now() + AUTH_POLICY.recoveryLifetimeMs).toISOString() })
    databaseError(insertError)
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'ShopFlow password recovery', text: `Your ShopFlow recovery token is ${raw}. It expires in 15 minutes. If you did not request this, ignore this email.` }) })
    if (!response.ok) { await db.from('auth_recovery_tokens').delete().eq('id', id); throw new AuthError('RECOVERY_UNAVAILABLE', 'Recovery email could not be delivered. Try again later.', 503) }
  }
  return json({ ok: true, message: 'If that account exists, recovery instructions have been sent.' })
}
export async function handleResetPassword(request: Request) {
  validateOrigin(request)
  const values = parse(z.object({ email: emailSchema, token: z.string().regex(/^[a-f0-9]{64}$/), newPassword: passwordSchema.refine(isValidPassword) }), await bodyOf(request))
  await rateLimit(request, 'reset', values.email, 5)
  const db = database(); const { data: account, error } = await db.from('app_accounts').select('id').eq('email', values.email).eq('active', true).maybeSingle()
  databaseError(error)
  if (!account) return bad('Invalid or expired reset request.')
  const { data, error: resetError } = await db.rpc('replace_custom_password', { p_user: account.id, p_hash: await hashPassword(values.newPassword), p_recovery: await digestToken(values.token) })
  databaseError(resetError)
  if (!data) return bad('Invalid or expired reset request.')
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) })
}