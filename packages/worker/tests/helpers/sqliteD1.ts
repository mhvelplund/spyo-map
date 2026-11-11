import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

// Jest's resolver strips the `node:` prefix and fails on prefix-only builtins
// like node:sqlite, so load it through a native require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

type SqlValue = null | number | bigint | string;

/**
 * Real-SQL stand-in for D1Database backed by an in-memory node:sqlite database
 * with every migration applied in name order. Implements only the methods the
 * worker uses: prepare().bind().all()/first()/run() and batch().
 */
export function sqliteD1(): { db: D1Database; raw: DatabaseSyncType } {
  const raw = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }

  function prepare(sql: string) {
    let params: SqlValue[] = [];
    const stmt = {
      bind(...p: unknown[]) {
        params = p as SqlValue[];
        return stmt;
      },
      all: async () => ({
        results: raw.prepare(sql).all(...params) as Array<Record<string, unknown>>,
        success: true,
      }),
      first: async () => (raw.prepare(sql).get(...params) as Record<string, unknown>) ?? null,
      run: async () => {
        raw.prepare(sql).run(...params);
        return { success: true };
      },
    };
    return stmt;
  }

  const db = {
    prepare,
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;

  return { db, raw };
}
