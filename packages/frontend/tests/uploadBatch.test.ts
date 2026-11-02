import { planBatch } from '../src/utils/uploadBatch';

const f = (name: string) => new File(['x'], name);

describe('planBatch', () => {
  it('treats a repeated hash in the same batch as a duplicate', () => {
    const a = f('a.jpg');
    const b = f('b.jpg');
    const plan = planBatch(
      [
        { file: a, inspection: { ok: true, sha256: 'h1' } },
        { file: b, inspection: { ok: true, sha256: 'h1' } },
      ],
      new Set()
    );
    expect(plan.toUpload).toEqual([{ file: a, sha256: 'h1' }]);
    expect(plan.duplicates).toEqual([b]);
  });

  it('treats a known hash as a duplicate and keeps rejections', () => {
    const a = f('a.jpg');
    const r = f('r.jpg');
    const plan = planBatch(
      [
        { file: a, inspection: { ok: true, sha256: 'h1' } },
        { file: r, inspection: { ok: false, reason: 'nope' } },
      ],
      new Set(['h1'])
    );
    expect(plan.toUpload).toEqual([]);
    expect(plan.duplicates).toEqual([a]);
    expect(plan.rejected).toEqual([{ file: r, reason: 'nope' }]);
  });
});
