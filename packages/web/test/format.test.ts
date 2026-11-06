import { afterEach, describe, expect, it } from 'vitest';
import { compact, money, monthLabel, shortDate } from '../src/format';

const zone = process.env.TZ;

afterEach(() => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

describe('format', () => {
  it('shows full amounts with the currency', () => {
    expect(money(28529000, 'LKR', 'en-US')).toBe('285,290.00 LKR');
    expect(money(-65005, 'LKR', 'en-US')).toBe('-650.05 LKR');
    expect(money(120040, 'USD', 'en-US')).toBe('1,200.40 USD');
  });

  it('shortens large amounts', () => {
    expect(compact(386000000, 'LKR', 'en-US')).toBe('3.86M');
    expect(compact(28529000, 'LKR', 'en-US')).toBe('285.29K');
    expect(compact(-65005, 'LKR', 'en-US')).toBe('-650.05');
  });

  it('shows the same date in every time zone', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(shortDate('2026-11-06', 'en-US')).toBe('Nov 6, 2026');
    expect(monthLabel('2026-10', 'en-US')).toBe('Oct 2026');
    process.env.TZ = 'Pacific/Kiritimati';
    expect(shortDate('2026-11-06', 'en-US')).toBe('Nov 6, 2026');
    expect(monthLabel('2026-10', 'en-US')).toBe('Oct 2026');
  });
});
