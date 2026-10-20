// @ts-nocheck — verbatim port of the original ShopFlow API client
import { MAX_GET_RETRIES, REQUEST_TIMEOUT_MS, RETRYABLE_HTTP_STATUS } from './shopflow-constants'

export type ApiError = Error & { status?: number; code?: string; response?: { data?: unknown } }

type JsonRecord = Record<string, unknown>

let csrfToken = ''

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
const apiBaseUrl = (env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

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
  const method = (init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set('x-request-id', requestId())
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken)

  let attempt = 0
  while (true) {
    const controller = new AbortController()
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, { ...init, method, headers, credentials: 'include', signal })
      const data = await response.json().catch(() => ({})) as JsonRecord
      if (!response.ok) {
        const error = Object.assign(new Error(String(data.error || 'Request failed')), {
          status: response.status,
          code: typeof data.code === 'string' ? data.code : undefined,
          response: { data },
        }) as ApiError
        if (method === 'GET' && RETRYABLE_HTTP_STATUS.has(response.status) && attempt < MAX_GET_RETRIES) {
          attempt += 1
          await wait(250 * 2 ** attempt)
          continue
        }
        throw error
      }
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
      window.clearTimeout(timeout)
    }
  }
}

export const api = {
  get<T = any>(path: string) {
    return request<T>(path)
  },
  post<T = any>(path: string, body: JsonRecord = {}) {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  },
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
