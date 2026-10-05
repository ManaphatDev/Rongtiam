// Runs the real migrations in PGlite (Postgres in WASM) on top of tiny Supabase stubs, so RLS, triggers and RPCs
// can be tested without Docker or a cloud project.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

export async function createDb() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(root, 'tests', 'db', 'supabase-stubs.sql'), 'utf8'));
  const dir = join(root, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function newUser(db: Db): Promise<string> {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  return id;
}

/** Run SQL as an authenticated user (role `authenticated`, auth.uid() = uid), optionally with a realtime topic. */
export function as(db: Db, uid: string, topic?: string) {
  const run = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      if (topic) await tx.query(`select set_config('realtime.topic', $1, true)`, [topic]);
      await tx.exec('set local role authenticated');
      return (await tx.query<T>(sql, params)).rows;
    });
  return {
    uid,
    query: run,
    async rpc<T = unknown>(fn: string, args: unknown[]): Promise<T> {
      const ph = args.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await run<{ r: T }>(`select public.${fn}(${ph}) as r`, args);
      return rows[0].r;
    },
    async ops(room: string, ops: unknown[]) {
      return run(`select * from public.apply_ops($1, $2::jsonb)`, [room, JSON.stringify(ops)]);
    },
  };
}

export async function messages(db: Db, sinceId = 0) {
  return (await db.query<{ id: number; topic: string; event: string; payload: Record<string, unknown> }>(
    'select id, topic, event, payload from realtime.messages where id > $1 order by id', [sinceId])).rows;
}

/** Postgres error code of a rejected promise (e.g. '42501'). */
export async function errCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown';
  }
}
