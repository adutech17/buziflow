import { compare, hash } from 'bcryptjs'

export function randomToken(bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(buffer, value => value.toString(16).padStart(2, '0')).join('')
}

export async function digestToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Prehash new passwords to avoid bcrypt's 72-byte truncation. Existing imported
// bcrypt hashes remain usable and are upgraded on the next successful sign-in.
export async function hashPassword(password: string): Promise<string> {
  return `bcrypt-sha256:${await hash(await digestToken(password), 12)}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    return encoded.startsWith('bcrypt-sha256:')
      ? compare(await digestToken(password), encoded.slice('bcrypt-sha256:'.length))
      : /^\$2[aby]\$/.test(encoded) && await compare(password, encoded)
  } catch { return false }
}