export const BUSINESS_ROLES = [
  'Managing Director',
  'General Manager',
  'Sales Agent',
  'Warehouse Manager',
  'Procurement Officer',
  'Accountant',
  'Auditor',
] as const

export type BusinessRole = (typeof BUSINESS_ROLES)[number]

export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
} as const

export function isValidPassword(password: string) {
  return password.length >= PASSWORD_RULES.minLength
    && password.length <= PASSWORD_RULES.maxLength
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password)
}

export const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 502, 503, 504])
export const REQUEST_TIMEOUT_MS = 20_000
export const MAX_GET_RETRIES = 2

export const API_ROUTES = {
  session: '/api/auth/session',
  login: '/api/auth/login',
  register: '/api/auth/register',
  forgotPassword: '/api/auth/forgot-password',
  resetPassword: '/api/auth/reset-password',
  logout: '/api/auth/logout',
  profile: '/api/auth/profile',
  password: '/api/auth/password',
  bootstrap: '/api/shop/bootstrap',
} as const

export type ApiRoute = typeof API_ROUTES[keyof typeof API_ROUTES]
