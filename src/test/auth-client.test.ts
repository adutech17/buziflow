import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.restoreAllMocks(); vi.resetModules() })
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

describe('Custom session request lifecycle', () => {
  it('automatically attaches bound CSRF to status updates', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ok: true }))
    const { api, setCsrfToken } = await import('@/lib/shopflow-api')
    setCsrfToken('bound-token')
    await api.post('/api/shop/status', { id: 'record', status: 'Paid' })
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-csrf-token')).toBe('bound-token')
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('same-origin')
  })
  it('does not accept an old-workspace read after switching', async () => {
    let complete: ((value: Response) => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (input === '/api/shop/bootstrap') return new Promise(resolve => { complete = resolve })
      return response({ ok: true, csrfToken: 'new-workspace-token' })
    })
    const { api } = await import('@/lib/shopflow-api')
    const read = api.get('/api/shop/bootstrap').catch(error => error)
    await api.post('/api/auth/workspace', { workspaceId: 'other-workspace' })
    complete?.(response({ data: { sales: ['old-workspace-sale'] } }))
    expect(await read).toBeInstanceOf(Error)
  })
  it('retries only explicit pre-mutation step-up rejection with the rotated CSRF', async () => {
    let attempts = 0
    const tokens: (string | null)[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input === '/api/auth/reauthenticate') return response({ csrfToken: 'rotated-token' })
      attempts += 1; tokens.push(new Headers(init?.headers).get('x-csrf-token'))
      return attempts === 1 ? response({ code: 'REAUTH_REQUIRED', error: 'Confirm' }, 428) : response({ ok: true })
    })
    const { api, registerReauthentication, setCsrfToken } = await import('@/lib/shopflow-api')
    setCsrfToken('old-token')
    const unregister = registerReauthentication(async () => { await api.post('/api/auth/reauthenticate', { password: 'test-only' }) })
    expect((await api.post('/api/shop/refund', { id: 'sale' })).data.ok).toBe(true)
    expect(tokens).toEqual(['old-token', 'rotated-token'])
    unregister()
  })
  it('never retries a mutation after an ambiguous network failure', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'))
    const { api } = await import('@/lib/shopflow-api')
    await expect(api.post('/api/shop/sales', { id: 'sale' })).rejects.toThrow('Network failure')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('drops queued mutations when the session ends', async () => {
    let complete: ((value: Response) => void) | undefined
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const { api, clearSessionState } = await import('@/lib/shopflow-api')
    const first = api.post('/api/shop/expenses').catch(error => error)
    await Promise.resolve(); await Promise.resolve()
    const queued = api.post('/api/shop/status').catch(error => error)
    clearSessionState(false)
    complete?.(response({ ok: true }))
    expect(await first).toBeInstanceOf(Error)
    expect(await queued).toBeInstanceOf(Error)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})