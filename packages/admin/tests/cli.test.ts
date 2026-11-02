import { jest } from '@jest/globals';
import { runCli } from '../src/cli.js';
import type { Runner } from '../src/wrangler.js';

function fake() {
  const d1 = jest.fn<Runner['d1']>().mockResolvedValue([]);
  const r2Delete = jest.fn<Runner['r2Delete']>().mockResolvedValue(undefined);
  return { d1, r2Delete } satisfies Runner;
}

describe('runCli', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('images remove deletes row then both R2 objects', async () => {
    const r = fake();
    expect(await runCli(['images', 'remove', 'abc', '--remote'], r)).toBe(0);
    expect(r.d1).toHaveBeenCalledTimes(1);
    expect(r.d1).toHaveBeenCalledWith("DELETE FROM images WHERE id = 'abc';", true);
    expect(r.r2Delete.mock.calls).toEqual([
      ['images/abc.jpg', true],
      ['images/thumbnails/abc.jpg', true],
    ]);
  });

  it('defaults to local', async () => {
    const r = fake();
    await runCli(['uploaders', 'list'], r);
    expect(r.d1.mock.calls[0][1]).toBe(false);
  });

  it('rejects non-integer ids without calling the runner', async () => {
    const r = fake();
    expect(await runCli(['uploaders', 'rename', 'x', 'Y'], r)).not.toBe(0);
    expect(r.d1).not.toHaveBeenCalled();
    expect(r.r2Delete).not.toHaveBeenCalled();
  });

  it('forget requires a sha256', async () => {
    const r = fake();
    expect(await runCli(['uploads', 'forget', 'zz'], r)).not.toBe(0);
    expect(r.d1).not.toHaveBeenCalled();
    expect(await runCli(['uploads', 'forget', 'a'.repeat(64)], r)).toBe(0);
  });

  it('unknown command fails', async () => {
    const r = fake();
    expect(await runCli(['nope'], r)).not.toBe(0);
  });
});
