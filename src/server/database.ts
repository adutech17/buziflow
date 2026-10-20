import { createClient } from '@supabase/supabase-js'
import { AuthError } from '@/lib/auth-policy'

// The external database remains the original source of truth. No browser auth
// client is constructed; only this request-bound server client can access data.
export function database() {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SHOPFLOW_DATABASE_KEY']
  if (!url || !key) throw new AuthError('AUTH_NOT_CONFIGURED', 'Account service is not configured.', 503)
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers)
      if (key.startsWith('sb_') && headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization')
      headers.set('apikey', key)
      return fetch(input, { ...init, headers })
    } },
  })
}

export function databaseError(error: { code?: string } | null) {
  if (!error) return
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error.code ?? '')) {
    throw new AuthError('AUTH_MIGRATION_REQUIRED', 'Account security upgrade must be applied to the database before signing in.', 503)
  }
  throw new AuthError('SERVICE_UNAVAILABLE', 'Account service is temporarily unavailable.', 503)
}