import { describe, it, expect } from '@jest/globals';
import { parseSourcePrefix } from '../src/config.js';

describe('parseSourcePrefix', () => {
  it.each([undefined, '', 'raw', 'raw/'])('maps %p to raw/', (value) => {
    expect(parseSourcePrefix(value)).toBe('raw/');
  });

  it.each(['originals', 'originals/', ' originals// '])('maps %p to originals/', (value) => {
    expect(parseSourcePrefix(value)).toBe('originals/');
  });

  it.each(['images/', 'failed', 'Originals'])('rejects %p', (value) => {
    expect(() => parseSourcePrefix(value)).toThrow(/SOURCE_PREFIX/);
  });
});
