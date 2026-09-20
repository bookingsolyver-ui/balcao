import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';

/** Postgres real em memória com um "Supabase mínimo" (auth.uid, papéis anon/authenticated) e as migrações aplicadas. */
export async function makeDb() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  return db;
}
export async function asUser<T>(db: PGlite, uid: string | 'anon', fn: () => Promise<T>): Promise<T> {
  await db.exec(uid === 'anon' ? `set role anon; select set_config('request.jwt.claim.sub','',false)` : `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false)`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
