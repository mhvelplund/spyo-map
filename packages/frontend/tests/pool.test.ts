import { runWithConcurrency } from '../src/utils/pool';

describe('runWithConcurrency', () => {
  it('never exceeds the limit and keeps result order', async () => {
    let inFlight = 0;
    let max = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = await runWithConcurrency(items, 3, async (n) => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 10 - n));
      inFlight--;
      return n * 2;
    });
    expect(max).toBe(3);
    expect(out).toEqual(items.map((n) => n * 2));
  });

  it('handles an empty list', async () => {
    expect(await runWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});
