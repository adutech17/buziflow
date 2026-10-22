// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hash } from 'bcryptjs'
import { digestToken, hashPassword, randomToken, verifyPassword } from '@/server/auth-crypto'

describe('Custom password and token security', () => {
  it('hashes new passwords and rejects wrong passwords', async () => {
    const encoded = await hashPassword('Strong!Password123')
    expect(await verifyPassword('Strong!Password123', encoded)).toBe(true)
    expect(await verifyPassword('Wrong!Password123', encoded)).toBe(false)
  })
  it('preserves existing bcrypt credentials', async () => {
    const existing = await hash('Original!Password123', 4)
    expect(await verifyPassword('Original!Password123', existing)).toBe(true)
  })
  it('does not truncate new passwords beyond 72 bytes', async () => {
    const prefix = 'A'.repeat(80)
    const encoded = await hashPassword(prefix + 'a1!First')
    expect(await verifyPassword(prefix + 'a1!Second', encoded)).toBe(false)
  })
  it('stores session identifiers as non-reversible digests', async () => {
    const raw = randomToken()
    expect(raw).toHaveLength(64)
    expect(await digestToken(raw)).not.toBe(raw)
    expect(await digestToken(raw)).toHaveLength(64)
    expect(randomToken()).not.toBe(raw)
  })
})