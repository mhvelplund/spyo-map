import type { D1Database } from '@cloudflare/workers-types';

export interface Call {
  sql: string;
  params: unknown[];
}

/** Minimal stand-in for D1Database that records calls and replays fixed rows. */
export function fakeD1(rows: Array<Record<string, unknown>>): {
  db: D1Database;
  calls: Call[];
} {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, params: [] };
      calls.push(call);
      const stmt = {
        bind(...params: unknown[]) {
          call.params = params;
          return stmt;
        },
        all: async () => ({ results: rows }),
        first: async () => rows[0] ?? null,
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls };
}
