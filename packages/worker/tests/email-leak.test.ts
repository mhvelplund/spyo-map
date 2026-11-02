import { describe, it, expect } from '@jest/globals';
import { handleApiRequest } from '../src/router.js';
import { fakeD1 } from './helpers/fakeD1.js';

const EMAIL_RE = /[^\s"@]+@[^\s"@]+\.[a-z]+/i;

const ROW = {
  id: 'abc',
  latitude: 51.5,
  longitude: -0.12,
  timestamp: '2024-01-01T00:00:00.000Z',
  email: 'leak@example.com',
  uploader_name: 'MH',
};
const ROW_OTHER = { ...ROW, id: 'def', latitude: 51.501 };

describe('API responses never leak emails', () => {
  const { db } = fakeD1([ROW, ROW_OTHER]);
  const env = { DB: db, ASSETS: {}, IMAGES_BASE_URL: 'https://img.test' } as never;

  for (const path of ['/api/images', '/api/images/abc', '/api/images/abc/nearby']) {
    it(`${path} body contains no email`, async () => {
      const res = await handleApiRequest(new Request(`https://x.test${path}`), env);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('MH');
      expect(body).not.toMatch(EMAIL_RE);
    });
  }
});
