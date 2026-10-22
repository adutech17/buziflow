// @ts-nocheck — verbatim port of the original ShopFlow API client
import { MAX_GET_RETRIES, REQUEST_TIMEOUT_MS, RETRYABLE_HTTP_STATUS } from './shopflow-constants'

export type ApiError = Error & { status?: number; code?: string; response?: { data?: unknown } }

type JsonRecord = Record<string, unknown>

let csrfToken = ''
let sessionGeneration = 0
const pendingRequests = new Set<AbortController>()
let reauthenticate: (() => Promise<void>) | undefined
let reauthenticationInFlight: Promise<void> | undefined
let mutationQueue: Promise<unknown> = Promise.resolve()

export function registerReauthentication(handler: () => Promise<void>) {
  reauthenticate = handler
  return () => { if (reauthenticate === handler) reauthenticate = undefined }
}

export function clearSessionState(notify = true) {
  csrfToken = ''
  sessionGeneration += 1
  for (const controller of pendingRequests) controller.abort()
  pendingRequests.clear()
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event('shopflow:session-ended'))
}

async function confirmAuthentication() {
  if (!reauthenticate) throw new Error('Confirm your password to continue.')
  if (!reauthenticationInFlight) {
    reauthenticationInFlight = reauthenticate().finally(() => { reauthenticationInFlight = undefined })
  }
  return reauthenticationInFlight
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function wait(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}

export function setCsrfToken(token: string) {
  csrfToken = token
}

function requestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<{ data: T }> {
  if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Only same-origin app requests are allowed.')
  const generation = sessionGeneration
  const method = (init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set('x-request-id', requestId())
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  let attempt = 0
  let confirmed = false
  while (true) {
    const controller = new AbortController()
    pendingRequests.add(controller)
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        if (csrfToken) headers.set('x-csrf-token', csrfToken)
        else headers.delete('x-csrf-token')
      }
      const response = await fetch(path, { ...init, method, headers, credentials: 'same-origin', signal })
      const data = await response.json().catch(() => ({})) as JsonRecord
      if (generation !== sessionGeneration) throw new Error('Session changed.')
      if (!response.ok) {
        const error = Object.assign(new Error(String(data.error || 'Request failed')), {
          status: response.status,
          code: typeof data.code === 'string' ? data.code : undefined,
          response: { data },
        }) as ApiError
        if (error.code === 'SESSION_EXPIRED') clearSessionState()
        if (error.code === 'REAUTH_REQUIRED' && !confirmed && path !== '/api/auth/reauthenticate') {
          // Only retry this explicit pre-mutation rejection; never retry an
          // ambiguous network failure for a state-changing request.
          window.clearTimeout(timeout)
          await confirmAuthentication()
          confirmed = true
          continue
        }
        if (method === 'GET' && RETRYABLE_HTTP_STATUS.has(response.status) && attempt < MAX_GET_RETRIES) {
          attempt += 1
          await wait(250 * 2 ** attempt)
          continue
        }
        throw error
      }
      if (typeof data.csrfToken === 'string') setCsrfToken(data.csrfToken)
      if (data.signedOut === true) clearSessionState()
      if (path === '/api/auth/session' && data.authenticated === false && csrfToken) clearSessionState()
      return { data: data as T }
    } catch (error) {
      if (isAbortError(error)) throw new Error('The request timed out. Please try again.')
      if (method === 'GET' && attempt < MAX_GET_RETRIES && !(error as ApiError)?.status) {
        attempt += 1
        await wait(250 * 2 ** attempt)
        continue
      }
      throw error
    } finally {
      pendingRequests.delete(controller)
      window.clearTimeout(timeout)
    }
  }
}

export const api = {
  get<T = any>(path: string) {
    return request<T>(path)
  },
  post<T = any>(path: string, body: JsonRecord = {}) {
    const run = () => request<T>(path, { method: 'POST', body: JSON.stringify(body) })
    // Reauthentication runs outside the mutation queue to unblock the request
    // that asked for it. Other mutations are serialized across cookie rotation.
    if (path === '/api/auth/reauthenticate') return run()
    const result = mutationQueue.then(run, run)
    mutationQueue = result.catch(() => {})
    return result
  },
  put<T = any>(path: string, body: JsonRecord = {}) {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  },
  patch<T = any>(path: string, body: JsonRecord = {}) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
  delete<T = any>(path: string, body: JsonRecord = {}) {
    return request<T>(path, { method: 'DELETE', body: JSON.stringify(body) })
  },
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
