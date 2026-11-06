import { describe, expect, it } from 'vitest';
import { hashText } from '../src/model/hash';

describe('hashText', () => {
  it('gives 16 hex characters', () => {
    expect(hashText('kanakku')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable and tells inputs apart', () => {
    expect(hashText('a')).toBe(hashText('a'));
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(hashText('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles text beyond ASCII', () => {
    expect(hashText('கணக்கு')).not.toBe(hashText('கணக்க'));
  });
});
