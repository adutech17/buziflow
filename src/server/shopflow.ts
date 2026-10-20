// @ts-nocheck — server-only ShopFlow backend; rows from Supabase are dynamically typed
// Server-only ShopFlow backend logic. Imported dynamically inside server route
// handlers only — never from client-reachable module scope.
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const COOKIE = 'shopflow_session';
const TTL = 7 * 24 * 60 * 60 * 1000;

const ROLES = ['Managing Director', 'General Manager', 'Sales Agent', 'Warehouse Manager', 'Procurement Officer', 'Accountant', 'Auditor'];
const GRANTS: Record<string, string[]> = {
  'Managing Director': ['*'],
  'General Manager': ['overview', 'sales', 'products', 'stock', 'suppliers', 'purchases', 'expenses', 'invoices', 'customers', 'reports'],
  'Sales Agent': ['overview', 'sales', 'invoices', 'customers'],
  'Warehouse Manager': ['overview', 'products', 'stock', 'suppliers', 'purchases'],
  'Procurement Officer': ['overview', 'products', 'suppliers', 'purchases', 'stock'],
  'Accountant': ['overview', 'sales', 'expenses', 'invoices', 'reports', 'customers'],
  'Auditor': ['overview', 'sales:read', 'products:read', 'stock:read', 'suppliers:read', 'purchases:read', 'expenses:read', 'invoices:read', 'customers:read', 'reports'],
};

// Best-effort in-memory rate limiting (workers are stateless; this is a soft guard).
const rateWindows = new Map<string, { count: number; resetAt: number }>();

type Profile = { id: string; workspace_id: string; name: string; role: string; active: boolean; avatar_url: string | null; created_at: string };
type SessionCtx = { userId: string; sessionId: string; csrfToken: string; profile: Profile };

function token(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

function bad(message: string, status = 400, extra: Record<string, string> = {}) {
  return json({ error: message }, status, extra);
}

function cookieHeader(request: Request) {
  return request.headers.get('cookie') || '';
}

function sessionIdFrom(request: Request) {
  const found = cookieHeader(request).split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='));
  return found ? found.slice(COOKIE.length + 1) : '';
}

function setCookie(request: Request, value: string, ageSeconds: number) {
  const secure = request.url.startsWith('https:') ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ageSeconds}${secure}`;
}

function rateLimit(request: Request, key: string, limit: number, windowMs: number) {
  const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const id = key + ':' + ip;
  const prior = rateWindows.get(id);
  if (!prior || prior.resetAt <= now) {
    rateWindows.set(id, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (prior.count >= limit) return bad('Too many requests. Please try again later.', 429, { 'retry-after': String(Math.ceil((prior.resetAt - now) / 1000)) });
  prior.count++;
  return null;
}

function validPassword(password: string) {
  return password.length >= 8 && password.length <= 128 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function num(v: unknown) {
  return Number.isFinite(Number(v)) ? Number(v) : NaN;
}

function docNo(prefix: string) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + token(3).toUpperCase();
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function bodyOf(request: Request, limit = 256 * 1024): Promise<any> {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > limit) return {};
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function getSession(request: Request, checkCsrf: boolean, body?: Record<string, any>): Promise<SessionCtx | null> {
  const id = sessionIdFrom(request);
  if (!id) return null;
  const { data: session } = await supabaseAdmin.from('app_sessions').select('*').eq('id', id).maybeSingle();
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;
  if (checkCsrf) {
    const given = request.headers.get('x-csrf-token') || (body?._csrf as string | undefined);
    if (!given || given !== session.csrf_token) return null;
  }
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', session.user_id).maybeSingle();
  if (!profile || profile.active === false) return null;
  return { userId: session.user_id, sessionId: id, csrfToken: session.csrf_token, profile: profile as Profile };
}

function permit(ctx: SessionCtx, key: string, write = true) {
  const g = GRANTS[ctx.profile.role] || [];
  return g.includes('*') || (write && g.includes(key)) || (!write && (g.includes(key + ':read') || g.includes(key)));
}

function guard(ctx: SessionCtx | null, key: string, write = true) {
  if (!ctx) return bad('Session or CSRF token is invalid.', 403);
  if (!permit(ctx, key, write)) return bad('Your role does not have permission for this action.', 403);
  return null;
}

async function createSession(userId: string) {
  const csrfToken = token(24);
  const id = token(32);
  const { error } = await supabaseAdmin.from('app_sessions').insert({ id, user_id: userId, csrf_token: csrfToken, expires_at: new Date(Date.now() + TTL).toISOString() });
  if (error) return null;
  return { id, csrfToken };
}

function anonClient() {
  return createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function publicUser(profile: Profile, email?: string) {
  return { name: profile.name, email: email ?? '', role: profile.role, avatarUrl: profile.avatar_url || '' };
}

async function emailMap(userIds: string[]) {
  const map = new Map<string, string>();
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users || []) if (userIds.includes(u.id)) map.set(u.id, u.email || '');
  return map;
}

// ---------- Auth handlers ----------

export async function handleSession(request: Request) {
  const ctx = await getSession(request, false);
  if (!ctx) return json({ authenticated: false });
  const emails = await emailMap([ctx.userId]);
  return json({ authenticated: true, csrfToken: ctx.csrfToken, user: publicUser(ctx.profile, emails.get(ctx.userId)) });
}

export async function handleRegister(request: Request) {
  const limited = rateLimit(request, 'register', 5, 15 * 60 * 1000);
  if (limited) return limited;
  const { count } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
  if ((count || 0) > 0) return bad('Workspace registration is closed. Ask the Managing Director to create your account.', 403);
  const b = await bodyOf(request);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(password)) {
    return bad('Use a valid name and email, and a password of at least 8 characters with uppercase, lowercase, a number and a special character.');
  }
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) return bad(createError?.message?.includes('already') ? 'An account with that email already exists.' : 'Account could not be created.', createError?.message?.includes('already') ? 409 : 500);
  const userId = created.user.id;
  const { data: workspace, error: wsError } = await supabaseAdmin.from('workspaces').insert({ name: name + "'s workspace" }).select('id').single();
  if (wsError || !workspace) return bad('Workspace could not be created.', 500);
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({ id: userId, workspace_id: workspace.id, name, role: 'Managing Director', active: true });
  if (profileError) return bad('Profile could not be created.', 500);
  const session = await createSession(userId);
  if (!session) return bad('Unable to create session.', 500);
  return json({ csrfToken: session.csrfToken, user: { name, email, role: 'Managing Director' } }, 201, { 'set-cookie': setCookie(request, session.id, TTL / 1000) });
}

export async function handleLogin(request: Request) {
  const limited = rateLimit(request, 'login', 10, 15 * 60 * 1000);
  if (limited) return limited;
  const b = await bodyOf(request);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.user) return bad('Email or password is incorrect.', 401);
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  if (!profile || profile.active === false) return bad('Email or password is incorrect.', 401);
  const session = await createSession(data.user.id);
  if (!session) return bad('Unable to create session.', 500);
  return json({ csrfToken: session.csrfToken, user: publicUser(profile as Profile, email) }, 200, { 'set-cookie': setCookie(request, session.id, TTL / 1000) });
}

export async function handleLogout(request: Request) {
  const b = await bodyOf(request);
  const ctx = await getSession(request, true, b);
  if (!ctx) return bad('Session or CSRF token is invalid.', 403);
  await supabaseAdmin.from('app_sessions').delete().eq('id', ctx.sessionId);
  return json({ ok: true }, 200, { 'set-cookie': setCookie(request, '', 0) });
}

export async function handleProfile(request: Request) {
  const b = await bodyOf(request);
  const ctx = await getSession(request, true, b);
  if (!ctx) return bad('Session or CSRF token is invalid.', 403);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const avatarUrl = String(b.avatarUrl || '').trim();
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Enter a valid display name and email address.');
  if (avatarUrl) {
    try {
      const u = new URL(avatarUrl);
      if (u.protocol !== 'https:' || avatarUrl.length > 1000) return bad('Profile image must be a valid HTTPS image URL.');
    } catch {
      return bad('Profile image must be a valid HTTPS image URL.');
    }
  }
  const { error } = await supabaseAdmin.from('profiles').update({ name, avatar_url: avatarUrl || null, updated_at: new Date().toISOString() }).eq('id', ctx.userId);
  if (error) return bad('Profile could not be saved.', 500);
  await supabaseAdmin.auth.admin.updateUserById(ctx.userId, { email });
  return json({ user: { name, email, role: ctx.profile.role, avatarUrl } });
}

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function handleUpload(request: Request) {
  const b = await bodyOf(request, 3 * 1024 * 1024);
  const ctx = await getSession(request, true, b);
  if (!ctx) return bad('Session or CSRF token is invalid.', 403);
  const kind = b.kind === 'logo' ? 'logo' : 'avatar';
  if (kind === 'logo' && ctx.profile.role !== 'Managing Director') return bad('Only the Managing Director can change the shop logo.', 403);
  const m = /^data:([a-z/+]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
  if (!m || !IMAGE_TYPES[m[1]]) return bad('Choose a PNG, JPG, WEBP or GIF image.');
  const bin = atob(m[2]);
  if (bin.length > 2 * 1024 * 1024) return bad('Image must be 2 MB or smaller.');
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const folder = kind === 'logo' ? `logos/${ctx.profile.workspace_id}` : `profiles/${ctx.userId}`;
  const path = `${folder}/${Date.now()}-${token(6)}.${IMAGE_TYPES[m[1]]}`;
  const { error } = await supabaseAdmin.storage.from('avatars').upload(path, bytes, { contentType: m[1], upsert: false });
  if (error) return bad('Image could not be uploaded.', 500);
  const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(path);
  return json({ url: data.publicUrl });
}

export async function handlePassword(request: Request) {
  const b = await bodyOf(request);
  const ctx = await getSession(request, true, b);
  if (!ctx) return bad('Session or CSRF token is invalid.', 403);
  const currentPassword = String(b.currentPassword || '');
  const newPassword = String(b.newPassword || '');
  if (!validPassword(newPassword)) return bad('New password must be at least 8 characters and include uppercase, lowercase, a number and a special character.');
  if (currentPassword === newPassword) return bad('Choose a new password different from your current password.');
  const emails = await emailMap([ctx.userId]);
  const email = emails.get(ctx.userId) || '';
  const { error: verifyError } = await anonClient().auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) return bad('Current password is incorrect.', 401);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(ctx.userId, { password: newPassword });
  if (error) return bad('Password could not be updated.', 500);
  await supabaseAdmin.from('app_sessions').delete().eq('user_id', ctx.userId).neq('id', ctx.sessionId);
  return json({ ok: true });
}

export async function handleForgotPassword(request: Request) {
  const limited = rateLimit(request, 'forgot-password', 5, 15 * 60 * 1000);
  if (limited) return limited;
  const b = await bodyOf(request);
  const email = String(b.email || '').trim().toLowerCase();
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const user = (users?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (user) {
    const raw = token(32);
    await supabaseAdmin.from('password_reset_tokens').insert({ user_id: user.id, token_hash: await sha256(raw), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  }
  return json({ ok: true, message: 'If that account exists, recovery instructions have been issued.' });
}

export async function handleResetPassword(request: Request) {
  const limited = rateLimit(request, 'reset-password', 8, 15 * 60 * 1000);
  if (limited) return limited;
  const b = await bodyOf(request);
  const email = String(b.email || '').trim().toLowerCase();
  const raw = String(b.token || '');
  const newPassword = String(b.newPassword || '');
  if (!validPassword(newPassword) || !raw) return bad('Invalid or expired reset request.', 400);
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const user = (users?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (!user) return bad('Invalid or expired reset request.', 400);
  const { data: tokens } = await supabaseAdmin.from('password_reset_tokens').select('*').eq('user_id', user.id).is('used_at', null).gt('expires_at', new Date().toISOString());
  let valid: { id: string } | null = null;
  for (const t of tokens || []) {
    if (t.token_hash === (await sha256(raw))) { valid = t; break; }
  }
  if (!valid) return bad('Invalid or expired reset request.', 400);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) return bad('Password could not be updated.', 500);
  await supabaseAdmin.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', valid.id);
  await supabaseAdmin.from('app_sessions').delete().eq('user_id', user.id);
  return json({ ok: true });
}

// ---------- Shop data mapping ----------

const mapProduct = (p: any) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, category: p.category, price: Number(p.price), cost: Number(p.cost), stock: Number(p.stock), reorderLevel: Number(p.reorder_level), updatedAt: p.updated_at });
const mapSale = (s: any, agentName: string) => ({ id: s.id, number: s.number, items: (s.sale_lines || []).map((l: any) => ({ productId: l.product_id, name: l.product_name, qty: Number(l.quantity), price: Number(l.unit_price) })), total: Number(s.total), payment: s.payment, customer: s.customer, createdAt: s.created_at, agentName, idempotencyKey: s.idempotency_key, refundedAt: s.refunded_at || null, refundReason: s.refund_reason || '' });
const mapStock = (m: any, productName: string, actorName: string) => ({ id: m.id, productId: m.product_id, productName, type: m.movement_type, qty: Number(m.quantity), reason: m.reason, actorName, createdAt: m.created_at });
const mapSupplier = (s: any) => ({ id: s.id, name: s.name, contact: s.contact, email: s.email, phone: s.phone, address: s.address, taxId: s.tax_id, createdAt: s.created_at });
const mapPurchase = (p: any) => ({ id: p.id, number: p.number, supplierId: p.supplier_id, supplierName: p.supplier_name, productId: p.product_id, productName: p.product_name, qty: Number(p.qty), unitCost: Number(p.unit_cost), total: Number(p.total), status: p.status, expectedDate: p.expected_date, createdAt: p.created_at });
const mapExpense = (e: any) => ({ id: e.id, description: e.description, category: e.category, amount: Number(e.amount), date: e.date, payment: e.payment, actorName: e.actor_name, createdAt: e.created_at });
const mapInvoice = (i: any) => ({ id: i.id, number: i.number, customer: i.customer, customerPhone: i.customer_phone, description: i.description, qty: Number(i.qty), unitPrice: Number(i.unit_price), items: (i.invoice_lines || []).map((l: any) => ({ description: l.description, qty: Number(l.quantity), unitPrice: Number(l.unit_price) })), total: Number(i.total), status: i.status, dueDate: i.due_date, createdAt: i.created_at });
const mapCustomer = (c: any) => ({ id: c.id, name: c.name, phone: c.phone, visits: c.visits, lifetimeValue: Number(c.lifetime_value) });

export async function handleBootstrap(request: Request) {
  const ctx = await getSession(request, false);
  if (!ctx) return bad('Sign in to continue.', 401);
  const ws = ctx.profile.workspace_id;
  const [productsR, salesR, customersR, suppliersR, purchasesR, expensesR, invoicesR, stockR, teamR, changeR] = await Promise.all([
    supabaseAdmin.from('products').select('*').eq('workspace_id', ws),
    supabaseAdmin.from('sales').select('*, sale_lines(*)').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('customers').select('*').eq('workspace_id', ws),
    supabaseAdmin.from('suppliers').select('*').eq('workspace_id', ws),
    supabaseAdmin.from('purchases').select('*').eq('workspace_id', ws),
    supabaseAdmin.from('expenses').select('*').eq('workspace_id', ws),
    supabaseAdmin.from('invoices').select('*, invoice_lines(*)').eq('workspace_id', ws),
    supabaseAdmin.from('stock_ledger').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(250),
    supabaseAdmin.from('profiles').select('*').eq('workspace_id', ws),
    supabaseAdmin.from('change_requests').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(250),
  ]);
  const products = (productsR.data || []).map(mapProduct);
  const actorIds = [...new Set([...(salesR.data || []).map((s: any) => s.actor_id), ...(stockR.data || []).map((m: any) => m.actor_id)].filter(Boolean))] as string[];
  const emails = await emailMap([ctx.userId, ...(teamR.data || []).map((t: any) => t.id)]);
  const { data: actors } = actorIds.length ? await supabaseAdmin.from('profiles').select('id, name').in('id', actorIds) : { data: [] as any[] };
  const actorName = (id: string | null) => (actors || []).find((a: any) => a.id === id)?.name || '—';
  const productName = (id: string) => products.find((p) => p.id === id)?.name || '—';
  const sales = (salesR.data || []).map((s: any) => mapSale(s, actorName(s.actor_id)));
  const expenses = (expensesR.data || []).map(mapExpense);
  const purchases = (purchasesR.data || []).map(mapPurchase);
  const invoices = (invoicesR.data || []).map(mapInvoice);
  const live = sales.filter((x) => !x.refundedAt);
  const revenue = live.reduce((n, x) => n + x.total, 0);
  const cost = live.reduce((n, x) => n + x.items.reduce((a: number, i: any) => a + i.qty * (products.find((p) => p.id === i.productId)?.cost || 0), 0), 0);
  const exp = expenses.reduce((n, x) => n + x.amount, 0);
  const purchaseValue = purchases.filter((x) => ['Draft', 'Ordered'].includes(x.status)).reduce((n, x) => n + x.total, 0);
  const receivables = invoices.filter((x) => x.status !== 'Paid' && x.status !== 'Cancelled').reduce((n, x) => n + x.total, 0);
  const isManager = ctx.profile.role === 'Managing Director';
  const team = isManager
    ? (teamR.data || []).map((t: any) => ({ id: t.id, name: t.name, email: emails.get(t.id) || '', role: t.role, active: t.active, createdAt: t.created_at }))
    : [];
  const changeRequests = (changeR.data || [])
    .filter((r: any) => ctx.profile.role === 'Managing Director' || r.requester_id === ctx.userId)
    .map((r: any) => ({ id: r.id, requesterName: (teamR.data || []).find((t: any) => t.id === r.requester_id)?.name || '—', operation: r.operation, entity: r.entity_type, recordId: (r.payload as any)?.recordId || r.entity_id, reason: r.reason, status: r.status, decidedBy: r.decision_reason ? ((teamR.data || []).find((t: any) => t.id === r.reviewer_id)?.name || '—') : undefined, createdAt: r.created_at }));
  const { data: wsRow } = await supabaseAdmin.from('workspaces').select('*').eq('id', ws).maybeSingle();
  return json({
    user: publicUser(ctx.profile, emails.get(ctx.userId)),
    csrfToken: ctx.csrfToken,
    settings: mapSettings(wsRow),
    stats: { revenue, orders: live.length, refunds: sales.length - live.length, products: products.length, lowStock: products.filter((p) => p.stock <= p.reorderLevel).length, purchaseValue, expenses: exp, grossProfit: revenue - cost, receivables },
    data: {
      products,
      sales,
      customers: (customersR.data || []).map(mapCustomer),
      suppliers: (suppliersR.data || []).map(mapSupplier),
      purchases,
      expenses,
      invoices,
      stock: (stockR.data || []).map((m: any) => mapStock(m, productName(m.product_id), actorName(m.actor_id))),
      team,
      changeRequests,
    },
  });
}

async function shopCtx(request: Request, key: string, write = true) {
  const b = await bodyOf(request);
  const ctx = await getSession(request, write, b);
  const denied = guard(ctx, key, write);
  return { b, ctx, denied };
}

export async function handleListProducts(request: Request) {
  const ctx = await getSession(request, false);
  if (!ctx) return bad('Sign in to continue.', 401);
  const { data } = await supabaseAdmin.from('products').select('*').eq('workspace_id', ctx.profile.workspace_id);
  return json({ items: (data || []).map(mapProduct) });
}

export async function handleListSales(request: Request) {
  const ctx = await getSession(request, false);
  if (!ctx) return bad('Sign in to continue.', 401);
  const { data } = await supabaseAdmin.from('sales').select('*, sale_lines(*)').eq('workspace_id', ctx.profile.workspace_id);
  return json({ items: (data || []).map((s: any) => mapSale(s, '—')) });
}

export async function handleListCustomers(request: Request) {
  const ctx = await getSession(request, false);
  if (!ctx) return bad('Sign in to continue.', 401);
  const { data } = await supabaseAdmin.from('customers').select('*').eq('workspace_id', ctx.profile.workspace_id);
  return json({ items: (data || []).map(mapCustomer) });
}

export async function handleCreateTeam(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'team');
  if (denied) return denied;
  if (ctx!.profile.role !== 'Managing Director') return bad('Only the Managing Director can create team accounts.', 403);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const role = String(b.role || '');
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(password) || !ROLES.includes(role) || role === 'Managing Director') {
    return bad('Check name, email, compliant password and allowed role.');
  }
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return bad(error?.message?.includes('already') ? 'That email already has an account.' : 'Team member could not be created.', error?.message?.includes('already') ? 409 : 500);
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({ id: created.user.id, workspace_id: ctx!.profile.workspace_id, name, role, active: true });
  if (profileError) return bad('Team member could not be created.', 500);
  return json({ id: created.user.id, name, email, role }, 201);
}

export async function handleCreateProduct(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'products');
  if (denied) return denied;
  const name = String(b.name || '').trim();
  const sku = String(b.sku || '').trim().toUpperCase();
  const barcode = String(b.barcode || '').trim();
  const price = num(b.price);
  const cost = num(b.cost || 0);
  const stock = num(b.stock);
  const reorderLevel = num(b.reorderLevel ?? 5);
  if (name.length < 2 || name.length > 120 || !sku || sku.length > 40 || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(reorderLevel) || reorderLevel < 0) {
    return bad('Check product details, price and stock.');
  }
  const ws = ctx!.profile.workspace_id;
  const { data: existing } = await supabaseAdmin.from('products').select('id, sku, barcode').eq('workspace_id', ws);
  if ((existing || []).some((p: any) => p.sku === sku || (barcode && p.barcode === barcode))) return bad('SKU or barcode already exists.', 409);
  const { data: product, error } = await supabaseAdmin.from('products').insert({ workspace_id: ws, name, sku, barcode, category: String(b.category || 'General'), price, cost, stock, reorder_level: reorderLevel }).select('id').single();
  if (error || !product) return bad('Product could not be saved.', 500);
  if (stock > 0) await supabaseAdmin.from('stock_ledger').insert({ workspace_id: ws, product_id: product.id, quantity: stock, movement_type: 'IN', reason: 'Opening stock', actor_id: ctx!.userId });
  return json({ id: product.id, name, sku, barcode, price, stock }, 201);
}

export async function handleCreateSale(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'sales');
  if (denied) return denied;
  const ws = ctx!.profile.workspace_id;
  const customer = String(b.customer || 'Walk-in customer').trim();
  const payment = String(b.payment || 'Cash');
  const idempotencyKey = String(b.idempotencyKey || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 120) return bad('A sale request key is required.');
  const { data: prior } = await supabaseAdmin.from('sales').select('id, number, total').eq('workspace_id', ws).eq('idempotency_key', idempotencyKey).maybeSingle();
  if (prior) return json({ id: prior.id, number: prior.number, total: Number(prior.total), duplicate: true });
  const rawLines = Array.isArray(b.lines) && b.lines.length ? b.lines : [{ productId: b.productId, qty: b.qty }];
  if (rawLines.length > 100 || !customer || customer.length > 120 || !['Cash', 'Mobile Money', 'Card', 'Bank transfer', 'Credit'].includes(payment)) return bad('Check sale details.');
  const lines: { p: any; qty: number }[] = [];
  for (const l of rawLines) {
    const qty = num((l as any).qty);
    if (!(l as any).productId || !Number.isInteger(qty) || qty < 1 || qty > 100000) return bad('Check sale details.');
    const { data: p } = await supabaseAdmin.from('products').select('*').eq('id', String((l as any).productId)).eq('workspace_id', ws).maybeSingle();
    if (!p) return bad('Product not found.', 404);
    if (Number(p.stock) < qty) return bad(`Insufficient stock for ${p.name}.`, 409);
    lines.push({ p, qty });
  }
  const adjusted: { p: any; qty: number }[] = [];
  for (const { p, qty } of lines) {
    const { error: stockError } = await supabaseAdmin.from('products').update({ stock: Number(p.stock) - qty, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (stockError) {
      for (const a of adjusted) await supabaseAdmin.from('products').update({ stock: a.p.stock }).eq('id', a.p.id);
      return bad('Stock update failed.', 500);
    }
    adjusted.push({ p, qty });
  }
  const { data: wsRow } = await supabaseAdmin.from('workspaces').select('tax_rate, tax_inclusive').eq('id', ws).maybeSingle();
  const sub = lines.reduce((n, { p, qty }) => n + Number(p.price) * qty, 0);
  const rate = Number(wsRow?.tax_rate || 0);
  const total = Math.round((wsRow && !wsRow.tax_inclusive ? sub * (1 + rate / 100) : sub) * 100) / 100;
  const number = docNo('RCPT');
  const { data: sale, error: saleError } = await supabaseAdmin.from('sales').insert({ workspace_id: ws, number, payment, customer, total, actor_id: ctx!.userId, idempotency_key: idempotencyKey }).select('id').single();
  if (saleError || !sale) {
    for (const a of adjusted) await supabaseAdmin.from('products').update({ stock: a.p.stock }).eq('id', a.p.id);
    return bad('Sale failed; stock restoration attempted.', 500);
  }
  await supabaseAdmin.from('sale_lines').insert(lines.map(({ p, qty }) => ({ sale_id: sale.id, product_id: p.id, product_name: p.name, quantity: qty, unit_price: p.price })));
  await supabaseAdmin.from('receipts').insert({ workspace_id: ws, sale_id: sale.id, receipt_number: number });
  await supabaseAdmin.from('stock_ledger').insert(lines.map(({ p, qty }) => ({ workspace_id: ws, product_id: p.id, quantity: qty, movement_type: 'OUT', reason: 'Sale ' + number, actor_id: ctx!.userId })));
  const { data: existingCustomer } = await supabaseAdmin.from('customers').select('*').eq('workspace_id', ws).ilike('name', customer).maybeSingle();
  if (existingCustomer) {
    await supabaseAdmin.from('customers').update({ visits: existingCustomer.visits + 1, lifetime_value: Number(existingCustomer.lifetime_value) + total }).eq('id', existingCustomer.id);
  } else {
    await supabaseAdmin.from('customers').insert({ workspace_id: ws, name: customer, phone: '', visits: 1, lifetime_value: total });
  }
  return json({ id: sale.id, number, total }, 201);
}

export async function handleStockMove(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'stock');
  if (denied) return denied;
  const ws = ctx!.profile.workspace_id;
  const id = String(b.productId || '');
  const type = String(b.type || 'IN');
  const qty = num(b.qty);
  const reason = String(b.reason || '').trim();
  const { data: p } = await supabaseAdmin.from('products').select('*').eq('id', id).eq('workspace_id', ws).maybeSingle();
  if (!p) return bad('Product not found.', 404);
  if (!['IN', 'OUT', 'SET'].includes(type) || !Number.isInteger(qty) || qty < 0 || !reason) return bad('Enter valid movement, quantity and reason.');
  const current = Number(p.stock);
  const nextStock = type === 'IN' ? current + qty : type === 'OUT' ? current - qty : qty;
  if (nextStock < 0) return bad('Stock cannot become negative.', 409);
  const { error } = await supabaseAdmin.from('products').update({ stock: nextStock, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return bad('Stock adjustment failed.', 500);
  const { data: move, error: moveError } = await supabaseAdmin.from('stock_ledger').insert({ workspace_id: ws, product_id: id, quantity: type === 'SET' ? Math.abs(nextStock - current) : qty, movement_type: type, reason, actor_id: ctx!.userId }).select('id').single();
  if (moveError || !move) return bad('Movement log could not be saved.', 500);
  return json({ id: move.id, stock: nextStock }, 201);
}

export async function handleCreateSupplier(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'suppliers');
  if (denied) return denied;
  const name = String(b.name || '').trim();
  if (name.length < 2) return bad('Supplier name is required.');
  const { data, error } = await supabaseAdmin.from('suppliers').insert({ workspace_id: ctx!.profile.workspace_id, name, contact: String(b.contact || ''), email: String(b.email || ''), phone: String(b.phone || ''), address: String(b.address || ''), tax_id: String(b.taxId || '') }).select('id').single();
  if (error || !data) return bad('Supplier could not be saved.', 500);
  return json({ id: data.id, name }, 201);
}

export async function handleCreatePurchase(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'purchases');
  if (denied) return denied;
  const ws = ctx!.profile.workspace_id;
  const qty = num(b.qty);
  const unitCost = num(b.unitCost);
  if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(unitCost) || unitCost < 0 || !b.supplierId || !b.productId) return bad('Select supplier, product and valid quantity/cost.');
  const { data: sup } = await supabaseAdmin.from('suppliers').select('*').eq('id', String(b.supplierId)).eq('workspace_id', ws).maybeSingle();
  const { data: p } = await supabaseAdmin.from('products').select('*').eq('id', String(b.productId)).eq('workspace_id', ws).maybeSingle();
  if (!sup || !p) return bad('Supplier or product not found.', 404);
  const number = docNo('PO');
  const { data, error } = await supabaseAdmin.from('purchases').insert({ workspace_id: ws, number, supplier_id: sup.id, supplier_name: sup.name, product_id: p.id, product_name: p.name, qty, unit_cost: unitCost, total: Math.round(qty * unitCost * 100) / 100, status: 'Draft', expected_date: String(b.expectedDate || '') }).select('id').single();
  if (error || !data) return bad('Purchase order failed.', 500);
  return json({ id: data.id, number }, 201);
}

export async function handleCreateExpense(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'expenses');
  if (denied) return denied;
  const amount = num(b.amount);
  const description = String(b.description || '').trim();
  if (!description || !Number.isFinite(amount) || amount <= 0) return bad('Enter an expense description and positive amount.');
  const { data, error } = await supabaseAdmin.from('expenses').insert({ workspace_id: ctx!.profile.workspace_id, description, category: String(b.category || 'Other'), amount, date: String(b.date || new Date().toISOString().slice(0, 10)), payment: String(b.payment || 'Cash'), actor_id: ctx!.userId, actor_name: ctx!.profile.name }).select('id').single();
  if (error || !data) return bad('Expense could not be saved.', 500);
  return json({ id: data.id }, 201);
}

export async function handleCreateInvoice(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'invoices');
  if (denied) return denied;
  const ws = ctx!.profile.workspace_id;
  const customer = String(b.customer || '').trim();
  const rawLines = Array.isArray(b.lines) && b.lines.length
    ? b.lines
    : [{ description: b.description, qty: b.qty, unitPrice: b.unitPrice }];
  if (!customer || rawLines.length > 100) return bad('Enter a customer and at least one invoice line.');
  const lines: { description: string; qty: number; unitPrice: number }[] = [];
  for (const l of rawLines) {
    const description = String((l as any).description || '').trim();
    const qty = num((l as any).qty);
    const unitPrice = num((l as any).unitPrice);
    if (!description || description.length > 200 || !Number.isInteger(qty) || qty < 1 || qty > 100000 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return bad('Enter description, quantity and positive price for every line.');
    }
    lines.push({ description, qty, unitPrice });
  }
  const { data: wsRow } = await supabaseAdmin.from('workspaces').select('tax_rate, tax_inclusive').eq('id', ws).maybeSingle();
  const sub = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  const rate = Number(wsRow?.tax_rate || 0);
  const total = Math.round((wsRow && !wsRow.tax_inclusive ? sub * (1 + rate / 100) : sub) * 100) / 100;
  const number = docNo('INV');
  const first = lines[0];
  const { data, error } = await supabaseAdmin.from('invoices').insert({ workspace_id: ws, number, customer, customer_phone: String(b.customerPhone || ''), description: first.description, qty: first.qty, unit_price: first.unitPrice, total, status: 'Issued', due_date: String(b.dueDate || '') }).select('id').single();
  if (error || !data) return bad('Invoice could not be created.', 500);
  const { error: lineError } = await supabaseAdmin.from('invoice_lines').insert(lines.map((l) => ({ invoice_id: data.id, description: l.description, quantity: l.qty, unit_price: l.unitPrice })));
  if (lineError) {
    await supabaseAdmin.from('invoices').delete().eq('id', data.id);
    return bad('Invoice lines could not be saved.', 500);
  }
  return json({ id: data.id, number, total }, 201);
}

export async function handleChangeRequest(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'overview');
  if (denied) return denied;
  const reason = String(b.reason || '').trim();
  const entity = String(b.entity || '');
  const recordId = String(b.recordId || '');
  if (reason.length < 10 || reason.length > 500 || !entity || !recordId) return bad('Provide a meaningful reason for this request.');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId);
  const { data, error } = await supabaseAdmin.from('change_requests').insert({ workspace_id: ctx!.profile.workspace_id, requester_id: ctx!.userId, entity_type: entity, entity_id: isUuid ? recordId : '00000000-0000-0000-0000-000000000000', operation: String(b.operation || 'update'), reason, status: 'Pending', payload: { recordId } }).select('id').single();
  if (error || !data) return bad('Request could not be saved.', 500);
  return json({ id: data.id, status: 'Pending' }, 201);
}

export async function handleChangeDecision(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'team');
  if (denied) return denied;
  if (ctx!.profile.role !== 'Managing Director') return bad('Only the Managing Director can decide requests.', 403);
  const id = String(b.id || '');
  const decision = String(b.decision || '');
  const reason = String(b.reason || '').trim();
  if (!['Approved', 'Rejected'].includes(decision) || reason.length < 5) return bad('Decision and reason are required.');
  const { data: r } = await supabaseAdmin.from('change_requests').select('*').eq('id', id).eq('workspace_id', ctx!.profile.workspace_id).maybeSingle();
  if (!r || r.status !== 'Pending') return bad('Request not found or already decided.', 404);
  const { error } = await supabaseAdmin.from('change_requests').update({ status: decision, decision_reason: reason, reviewer_id: ctx!.userId, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) return bad('Decision could not be saved.', 500);
  await supabaseAdmin.from('audit_events').insert({ workspace_id: r.workspace_id, actor_id: ctx!.userId, action: 'change_request_decision', entity_type: r.entity_type, entity_id: r.entity_id, metadata: { details: decision + ' — ' + reason } });
  return json({ ok: true });
}

export async function handleStatus(request: Request) {
  const b = await bodyOf(request);
  const entity = String(b.entity || '');
  const key = entity === 'purchases' ? 'purchases' : entity === 'invoices' ? 'invoices' : 'team';
  const ctx = await getSession(request, true, b);
  const denied = guard(ctx, key);
  if (denied) return denied;
  const ws = ctx!.profile.workspace_id;
  const id = String(b.id || '');
  const status = String(b.status || '');
  if (entity === 'team') {
    if (ctx!.profile.role !== 'Managing Director') return bad('Only Managing Director can change team access.', 403);
    const { data: u } = await supabaseAdmin.from('profiles').select('*').eq('id', id).eq('workspace_id', ws).maybeSingle();
    if (!u || u.role === 'Managing Director' || !['Active', 'Disabled'].includes(status)) return bad('Team record or status invalid.', 400);
    const { error } = await supabaseAdmin.from('profiles').update({ active: status === 'Active', updated_at: new Date().toISOString() }).eq('id', id);
    return error ? bad('Update failed.', 500) : json({ ok: true });
  }
  if (entity === 'invoices') {
    const { data: i } = await supabaseAdmin.from('invoices').select('*').eq('id', id).eq('workspace_id', ws).maybeSingle();
    if (!i || !['Paid', 'Cancelled'].includes(status)) return bad('Invoice status invalid.', 400);
    const { error } = await supabaseAdmin.from('invoices').update({ status }).eq('id', id);
    return error ? bad('Update failed.', 500) : json({ ok: true });
  }
  if (entity === 'purchases') {
    const { data: p } = await supabaseAdmin.from('purchases').select('*').eq('id', id).eq('workspace_id', ws).maybeSingle();
    if (!p) return bad('Purchase order not found.', 404);
    if (status === 'Ordered' && p.status === 'Draft') {
      const { error } = await supabaseAdmin.from('purchases').update({ status }).eq('id', id);
      return error ? bad('Update failed.', 500) : json({ ok: true });
    }
    if (status === 'Received' && p.status === 'Ordered') {
      const { data: product } = await supabaseAdmin.from('products').select('*').eq('id', p.product_id).eq('workspace_id', ws).maybeSingle();
      if (!product) return bad('Product not found.', 404);
      const { error: stockError } = await supabaseAdmin.from('products').update({ stock: Number(product.stock) + Number(p.qty), cost: p.unit_cost, updated_at: new Date().toISOString() }).eq('id', p.product_id);
      if (stockError) return bad('Stock receipt failed.', 500);
      await supabaseAdmin.from('stock_ledger').insert({ workspace_id: ws, product_id: p.product_id, quantity: p.qty, movement_type: 'IN', reason: 'Received ' + p.number, actor_id: ctx!.userId });
      const { error } = await supabaseAdmin.from('purchases').update({ status }).eq('id', id);
      return error ? bad('Stock received but PO status update failed; reconcile.', 500) : json({ ok: true });
    }
    return bad('Invalid purchase-order transition.', 409);
  }
  return bad('Unknown status entity.');
}


// ---------- Shop settings ----------

const CURRENCIES = ['GHS', 'NGN', 'KES', 'ZAR', 'USD', 'EUR', 'GBP', 'XOF', 'CAD', 'INR'];

function mapSettings(w: any) {
  return {
    shopName: w?.name || '', currency: w?.currency || 'GHS', taxLabel: w?.tax_label || 'VAT',
    taxRate: Number(w?.tax_rate || 0), taxInclusive: w?.tax_inclusive !== false,
    logoUrl: w?.receipt_logo_url || '', address: w?.receipt_address || '', phone: w?.receipt_phone || '',
    footer: w?.receipt_footer || '', setupCompleted: !!w?.setup_completed,
  };
}

export async function handleSaveSettings(request: Request) {
  const b = await bodyOf(request);
  const ctx = await getSession(request, true, b);
  if (!ctx) return bad('Session or CSRF token is invalid.', 403);
  if (ctx.profile.role !== 'Managing Director') return bad('Only the Managing Director can change shop settings.', 403);
  const shopName = String(b.shopName || '').trim();
  const currency = String(b.currency || '');
  const taxLabel = String(b.taxLabel || 'VAT').trim();
  const taxRate = num(b.taxRate);
  const logoUrl = String(b.logoUrl || '').trim();
  const str = (v: unknown, max: number) => String(v || '').trim().slice(0, max);
  if (shopName.length < 2 || shopName.length > 80) return bad('Shop name must be 2–80 characters.');
  if (!CURRENCIES.includes(currency)) return bad('Choose a supported currency.');
  if (!taxLabel || taxLabel.length > 20) return bad('Tax name must be 1–20 characters.');
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return bad('Tax rate must be between 0 and 100.');
  if (logoUrl && (!/^https:\/\//i.test(logoUrl) || logoUrl.length > 500)) return bad('Logo must be an HTTPS image link.');
  const { data, error } = await supabaseAdmin.from('workspaces').update({
    name: shopName, currency, tax_label: taxLabel, tax_rate: taxRate, tax_inclusive: b.taxInclusive !== false,
    receipt_logo_url: logoUrl, receipt_address: str(b.address, 200), receipt_phone: str(b.phone, 40),
    receipt_footer: str(b.footer, 200), setup_completed: true,
  }).eq('id', ctx.profile.workspace_id).select('*').single();
  if (error) return bad('Settings could not be saved.', 500);
  return json({ settings: mapSettings(data) });
}

export async function handleRefund(request: Request) {
  const { b, ctx, denied } = await shopCtx(request, 'sales');
  if (denied) return denied;
  if (!['Managing Director', 'General Manager', 'Accountant'].includes(ctx!.profile.role)) return bad('Only a Managing Director, General Manager or Accountant can refund sales.', 403);
  const ws = ctx!.profile.workspace_id;
  const reason = String(b.reason || '').trim();
  if (reason.length < 3 || reason.length > 200) return bad('Give a short reason for the refund.');
  const { data: sale } = await supabaseAdmin.from('sales').select('*, sale_lines(*)').eq('id', String(b.id || '')).eq('workspace_id', ws).maybeSingle();
  if (!sale) return bad('Sale not found.', 404);
  if (sale.refunded_at) return bad('This sale was already refunded.', 409);
  const { data: claimed, error } = await supabaseAdmin.from('sales').update({ refunded_at: new Date().toISOString(), refund_reason: reason, refunded_by: ctx!.userId }).eq('id', sale.id).is('refunded_at', null).select('id');
  if (error || !claimed?.length) return bad('Refund could not be recorded.', 409);
  for (const l of sale.sale_lines || []) {
    const { data: p } = await supabaseAdmin.from('products').select('stock').eq('id', l.product_id).eq('workspace_id', ws).maybeSingle();
    if (!p) continue;
    await supabaseAdmin.from('products').update({ stock: Number(p.stock) + Number(l.quantity), updated_at: new Date().toISOString() }).eq('id', l.product_id);
    await supabaseAdmin.from('stock_ledger').insert({ workspace_id: ws, product_id: l.product_id, quantity: Number(l.quantity), movement_type: 'IN', reason: 'Refund ' + sale.number + ': ' + reason, actor_id: ctx!.userId });
  }
  const { data: c } = await supabaseAdmin.from('customers').select('*').eq('workspace_id', ws).ilike('name', sale.customer).maybeSingle();
  if (c) await supabaseAdmin.from('customers').update({ lifetime_value: Math.max(0, Number(c.lifetime_value) - Number(sale.total)) }).eq('id', c.id);
  return json({ ok: true });
}
