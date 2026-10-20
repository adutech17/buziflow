import type { BusinessRole } from './shopflow-constants'

export const ROLE_PERMISSIONS: Record<BusinessRole, readonly string[]> = {
  'Managing Director': ['*'],
  'General Manager': ['overview', 'sales', 'products', 'stock', 'suppliers', 'purchases', 'expenses', 'invoices', 'customers', 'reports'],
  'Sales Agent': ['overview', 'sales', 'invoices', 'customers'],
  'Warehouse Manager': ['overview', 'products', 'stock', 'suppliers', 'purchases'],
  'Procurement Officer': ['overview', 'products', 'suppliers', 'purchases', 'stock'],
  'Accountant': ['overview', 'sales', 'expenses', 'invoices', 'reports', 'customers'],
  'Auditor': ['overview', 'sales:read', 'products:read', 'stock:read', 'suppliers:read', 'purchases:read', 'expenses:read', 'invoices:read', 'customers:read', 'reports'],
}

export function hasPermission(role: string, key: string, write = true): boolean {
  const grants = ROLE_PERMISSIONS[role as BusinessRole] ?? []
  return grants.includes('*') || grants.includes(key) || (!write && grants.includes(`${key}:read`))
}