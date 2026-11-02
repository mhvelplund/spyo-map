import { pathToFileURL } from 'node:url';
import { isSha256Hex } from '@spyo-map/shared';
import {
  addEmailSql, addUploaderSql, forgetUploadSql, listUploadersSql, removeImageSql, renameSql, setDisabledSql,
} from './sql.js';
import { wranglerRunner, type Runner } from './wrangler.js';

const USAGE = `usage:
  uploaders list | add <name> <email> | add-email <id> <email> | rename <id> <name> | disable <id> | enable <id>
  uploads forget <sha256>
  images remove <imageId>
  (add --remote to act on production; default is local)`;

function parseId(s: string): number {
  if (!/^\d+$/.test(s)) throw new Error('invalid id');
  return Number(s);
}

function need(args: string[], n: number): string[] {
  if (args.length !== n) throw new Error('bad args');
  return args;
}

export async function runCli(argv: string[], runner: Runner): Promise<number> {
  const remote = argv.includes('--remote');
  const args = argv.filter((a) => a !== '--remote' && a !== '--local');
  const [group, cmd, ...rest] = args;
  try {
    let sql: string;
    let after: (() => Promise<void>) | undefined;
    if (group === 'uploaders') {
      switch (cmd) {
        case 'list': need(rest, 0); sql = listUploadersSql(); break;
        case 'add': { const [n, e] = need(rest, 2); sql = addUploaderSql(n, e); break; }
        case 'add-email': { const [i, e] = need(rest, 2); sql = addEmailSql(parseId(i), e); break; }
        case 'rename': { const [i, n] = need(rest, 2); sql = renameSql(parseId(i), n); break; }
        case 'disable': { const [i] = need(rest, 1); sql = setDisabledSql(parseId(i), true); break; }
        case 'enable': { const [i] = need(rest, 1); sql = setDisabledSql(parseId(i), false); break; }
        default: throw new Error('bad command');
      }
    } else if (group === 'uploads' && cmd === 'forget') {
      const [h] = need(rest, 1);
      if (!isSha256Hex(h)) throw new Error('invalid sha256');
      sql = forgetUploadSql(h);
    } else if (group === 'images' && cmd === 'remove') {
      const [id] = need(rest, 1);
      sql = removeImageSql(id);
      after = async () => {
        await runner.r2Delete(`images/${id}.jpg`, remote);
        await runner.r2Delete(`images/thumbnails/${id}.jpg`, remote);
      };
    } else {
      throw new Error('bad command');
    }
    const result = await runner.d1(sql, remote);
    if (after) await after();
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    console.error(`error: ${(err as Error).message}\n${USAGE}`);
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2), wranglerRunner);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
