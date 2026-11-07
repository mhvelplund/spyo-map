import { describe, it, expect } from '@jest/globals';
import {
  findActiveUploaderByEmail,
  findActiveUploaderById,
} from '../src/services/uploaders.js';
import { fakeD1 } from './helpers/fakeD1.js';

describe('findActiveUploaderByEmail', () => {
  it('normalises the email and filters disabled uploaders', async () => {
    const { db, calls } = fakeD1([{ id: 1, display_name: 'MH' }]);
    const result = await findActiveUploaderByEmail(db, ' Malephex@Gmail.com ');
    expect(result).toEqual({ id: 1, displayName: 'MH' });
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual(['malephex@gmail.com']);
    expect(calls[0].sql).toContain('disabled_at IS NULL');
    expect(calls[0].sql).toContain('uploader_emails');
  });

  it('returns null when no row matches', async () => {
    const { db } = fakeD1([]);
    expect(await findActiveUploaderByEmail(db, 'x@y.z')).toBeNull();
  });
});

describe('findActiveUploaderById', () => {
  it('looks up by id and filters disabled uploaders', async () => {
    const { db, calls } = fakeD1([{ id: 3, display_name: 'Bob' }]);
    expect(await findActiveUploaderById(db, 3)).toEqual({ id: 3, displayName: 'Bob' });
    expect(calls[0].params).toEqual([3]);
    expect(calls[0].sql).toContain('disabled_at IS NULL');
  });

  it('returns null when no row matches', async () => {
    const { db } = fakeD1([]);
    expect(await findActiveUploaderById(db, 3)).toBeNull();
  });
});
