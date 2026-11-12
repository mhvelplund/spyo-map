import { describe, it, expect } from '@jest/globals';
import {
  findActiveUploaderByEmail,
  findActiveUploaderById,
} from '../src/services/uploaders.js';
import { fakeD1 } from './helpers/fakeD1.js';

describe('findActiveUploaderByEmail', () => {
  it('normalises the email and filters disabled uploaders', async () => {
    const { db, calls } = fakeD1([{ id: 1, display_name: 'MH', is_admin: 0 }]);
    const result = await findActiveUploaderByEmail(db, ' Malephex@Gmail.com ');
    expect(result).toEqual({ id: 1, displayName: 'MH', isAdmin: false });
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
    const { db, calls } = fakeD1([{ id: 3, display_name: 'Bob', is_admin: 0 }]);
    expect(await findActiveUploaderById(db, 3)).toEqual({ id: 3, displayName: 'Bob', isAdmin: false });
    expect(calls[0].params).toEqual([3]);
    expect(calls[0].sql).toContain('disabled_at IS NULL');
  });

  it('returns null when no row matches', async () => {
    const { db } = fakeD1([]);
    expect(await findActiveUploaderById(db, 3)).toBeNull();
  });
});

describe('is_admin mapping', () => {
  it('maps is_admin to isAdmin', async () => {
    const { db, calls } = fakeD1([{ id: 1, display_name: 'MH', is_admin: 1 }]);
    expect(await findActiveUploaderById(db, 1)).toEqual({ id: 1, displayName: 'MH', isAdmin: true });
    expect(calls[0].sql).toContain('is_admin');
  });
  it('treats is_admin 0 as not admin', async () => {
    const { db } = fakeD1([{ id: 2, display_name: 'Bob', is_admin: 0 }]);
    expect((await findActiveUploaderByEmail(db, 'b@x.y'))?.isAdmin).toBe(false);
  });
});
