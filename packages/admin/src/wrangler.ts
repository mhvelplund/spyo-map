import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface Runner {
  d1(sql: string, remote: boolean): Promise<unknown>;
  r2Delete(key: string, remote: boolean): Promise<void>;
}

// Run wrangler's JS entrypoint with the current node binary: no shell, so args are never re-parsed.
const WRANGLER_BIN = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const CONFIG = fileURLToPath(new URL('../../worker/wrangler.toml', import.meta.url));

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`wrangler exited with code ${code}`)),
    );
  });
}

export const wranglerRunner: Runner = {
  async d1(sql, remote) {
    const out = await run([
      'd1', 'execute', 'spyo-map', '--config', CONFIG, remote ? '--remote' : '--local', '--json', '--command', sql,
    ]);
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  },
  async r2Delete(key, remote) {
    await run(['r2', 'object', 'delete', `spyo-map/${key}`, '--config', CONFIG, remote ? '--remote' : '--local']);
  },
};
