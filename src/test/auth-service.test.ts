// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// Actual PostgreSQL executes the same conversion and session RPCs used by the
// app. No hosted data, credentials or alternative auth is used in these tests.
let db: PGlite
const uid = '00000000-0000-4000-8000-000000000001'
const ws = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const sid = 'a'.repeat(64)
async function seed(id = sid) {
  await db.query(`insert into custom_sessions(id,user_id,workspace_id,csrf_token,security_version,created_at,expires_at,last_activity_at,authenticated_at) values($1,$2,$3,'csrf-session-one',1,now(),now()+interval '7 days',now(),now())`, [id, uid, ws])
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,encrypted_password text,created_at timestamptz default now(),banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create table public.workspaces(id uuid primary key default gen_random_uuid(),name text);
    create table public.profiles(id uuid primary key references auth.users(id),workspace_id uuid references workspaces(id),name text,role text,active boolean,avatar_url text,created_at timestamptz default now());
    create table public.app_sessions(id text,user_id uuid references auth.users(id));
    create table public.password_reset_tokens(id text,user_id uuid references auth.users(id));
    insert into auth.users(id,email,encrypted_password) values('${uid}','owner@example.test','$2b$12$existing');
    insert into workspaces(id,name) values('${ws}','Original business'),('${other}','Other business');
    insert into profiles(id,workspace_id,name,role,active) values('${uid}','${ws}','Owner','Managing Director',true);`)
  await db.exec(await readFile(new URL('../../database/custom-auth.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })

describe.sequential('Database conversion and session enforcement', () => {
  it('preserves accounts and separates membership roles from profiles', async () => {
    const account = await db.query<{ email: string }>('select email from app_accounts where id=$1', [uid])
    expect(account.rows[0]?.email).toBe('owner@example.test')
    const roles = await db.query<{ role: string }>('select role from workspace_memberships where user_id=$1', [uid])
    expect(roles.rows[0]?.role).toBe('Managing Director')
    const old = await db.query("select column_name from information_schema.columns where table_name='profiles' and column_name='role'")
    expect(old.rows).toHaveLength(0)
  })
  it('rejects missing CSRF before mutations', async () => {
    await seed()
    await expect(db.query('select * from consume_custom_session($1,null,true,true)', [sid])).rejects.toThrow('CSRF_INVALID')
  })
  it('rejects invalid or other-session CSRF', async () => {
    await expect(db.query("select * from consume_custom_session($1,'csrf-session-two',true,true)", [sid])).rejects.toThrow('CSRF_INVALID')
  })
  it('accepts valid bound CSRF', async () => {
    const result = await db.query("select * from consume_custom_session($1,'csrf-session-one',true,true)", [sid])
    expect(result.rows).toHaveLength(1)
  })
  it('rotates atomically and preserves the absolute creation/deadline', async () => {
    const prior = await db.query<{ created_at: Date; expires_at: Date }>('select created_at,expires_at from custom_sessions where id=$1', [sid])
    const result = await db.query<{ created_at: Date; expires_at: Date }>('select * from rotate_custom_session($1,$2,$3,null)', [sid, 'b'.repeat(64), 'new-csrf'])
    expect(result.rows[0]?.created_at).toEqual(prior.rows[0]?.created_at)
    expect(result.rows[0]?.expires_at).toEqual(prior.rows[0]?.expires_at)
    expect((await db.query("select * from consume_custom_session($1,'csrf-session-one',true,true)", [sid])).rows).toHaveLength(0)
    expect((await db.query('select * from rotate_custom_session($1,$2,$3,null)', [sid, 'c'.repeat(64), 'third'])).rows).toHaveLength(0)
  })
  it('rejects cross-workspace rotation without membership', async () => {
    const result = await db.query('select * from rotate_custom_session($1,$2,$3,$4)', ['b'.repeat(64), 'd'.repeat(64), 'csrf', other])
    expect(result.rows).toHaveLength(0)
  })
  it('workspace switching never substitutes for password reauthentication', async () => {
    await db.query("insert into workspace_memberships(user_id,workspace_id,role) values($1,$2,'Auditor')", [uid, other])
    await seed('4'.repeat(64))
    await db.query("update custom_sessions set authenticated_at=now()-interval '10 minutes' where id=$1", ['4'.repeat(64)])
    const before = await db.query<{ authenticated_at: Date }>('select authenticated_at from custom_sessions where id=$1', ['4'.repeat(64)])
    const switched = await db.query<{ authenticated_at: Date }>('select * from rotate_custom_session($1,$2,$3,$4)', ['4'.repeat(64), '5'.repeat(64), 'switch-csrf', other])
    expect(switched.rows[0]?.authenticated_at).toEqual(before.rows[0]?.authenticated_at)
  })
  it('only verified reauthentication renews the step-up window', async () => {
    const confirmed = await db.query<{ recent: boolean }>('select authenticated_at > now()-interval \'1 minute\' as recent from rotate_custom_session($1,$2,$3,null,true)', ['5'.repeat(64), '6'.repeat(64), 'verified-csrf'])
    expect(confirmed.rows[0]?.recent).toBe(true)
  })
  it('rejects expired sessions even with valid CSRF', async () => {
    await seed('e'.repeat(64))
    await db.query("update custom_sessions set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=$1", ['e'.repeat(64)])
    expect((await db.query("select * from consume_custom_session($1,'csrf-session-one',true,true)", ['e'.repeat(64)])).rows).toHaveLength(0)
  })
  it('rejects sessions idle for thirty minutes', async () => {
    await seed('f'.repeat(64))
    await db.query("update custom_sessions set last_activity_at=now()-interval '30 minutes' where id=$1", ['f'.repeat(64)])
    expect((await db.query('select * from consume_custom_session($1,null,false,false)', ['f'.repeat(64)])).rows).toHaveLength(0)
  })
  it('invalidates sessions on logout revocation', async () => {
    await seed('1'.repeat(64))
    await db.query('update custom_sessions set revoked_at=now() where id=$1', ['1'.repeat(64)])
    expect((await db.query('select * from consume_custom_session($1,null,false,false)', ['1'.repeat(64)])).rows).toHaveLength(0)
  })
  it('revokes sessions on membership privilege changes', async () => {
    await db.query("update workspace_memberships set role='General Manager' where user_id=$1", [uid])
    expect((await db.query('select * from consume_custom_session($1,null,false,false)', ['b'.repeat(64)])).rows).toHaveLength(0)
  })
  it('revokes stolen sessions on account disablement', async () => {
    await seed('2'.repeat(64))
    await db.query('update app_accounts set active=false where id=$1', [uid])
    expect((await db.query('select * from consume_custom_session($1,null,false,false)', ['2'.repeat(64)])).rows).toHaveLength(0)
    await db.query('update app_accounts set active=true where id=$1', [uid])
  })
  it('consumes password recovery only once and revokes all sessions', async () => {
    await seed('3'.repeat(64))
    await db.query("insert into auth_recovery_tokens(id,user_id,expires_at) values('recovery',$1,now()+interval '15 minutes')", [uid])
    expect((await db.query<{ replace_custom_password: boolean }>("select replace_custom_password($1,'new-hash','recovery')", [uid])).rows[0]?.replace_custom_password).toBe(true)
    expect((await db.query<{ replace_custom_password: boolean }>("select replace_custom_password($1,'reused-hash','recovery')", [uid])).rows[0]?.replace_custom_password).toBe(false)
    expect((await db.query('select * from consume_custom_session($1,null,false,false)', ['3'.repeat(64)])).rows).toHaveLength(0)
  })
  it('removes former provider account access and browser database grants', async () => {
    const banned = await db.query<{ blocked: boolean }>('select banned_until>now() blocked from auth.users where id=$1', [uid])
    expect(banned.rows[0]?.blocked).toBe(true)
    const grants = await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated','public.profiles','select') allowed")
    expect(grants.rows[0]?.allowed).toBe(false)
  })
  it('uses durable rate limits rather than worker memory', async () => {
    for (let i = 0; i < 5; i++) expect((await db.query<{ auth_rate_limit: boolean }>("select auth_rate_limit('login-test',5,900)")).rows[0]?.auth_rate_limit).toBe(true)
    expect((await db.query<{ auth_rate_limit: boolean }>("select auth_rate_limit('login-test',5,900)")).rows[0]?.auth_rate_limit).toBe(false)
  })
})