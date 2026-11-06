import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  clampDate,
  daysInMonth,
  diffDays,
  endOfMonth,
  monthKey,
  parseDayMonthName,
  parseDmy,
  parseDmyDash,
  parseMdyShort,
  parseYmd,
  startOfMonth,
} from '../src/model/dates';

describe('parsing', () => {
  it('reads DD/MM/YYYY', () => {
    expect(parseDmy('07/10/2026')).toBe('2026-10-07');
  });

  it('rejects impossible dates', () => {
    expect(parseDmy('31/02/2026')).toBeUndefined();
    expect(parseDmy('13/25/2026')).toBeUndefined();
    expect(parseYmd('2026-13-01')).toBeUndefined();
  });

  it('reads the other bank formats', () => {
    expect(parseYmd('2026-01-05')).toBe('2026-01-05');
    expect(parseDmyDash('06-11-2026')).toBe('2026-11-06');
    expect(parseMdyShort('11/6/26')).toBe('2026-11-06');
    expect(parseDayMonthName('06 Nov 2026')).toBe('2026-11-06');
  });

  it('ignores surrounding spaces and rejects other text', () => {
    expect(parseDmy(' 07/10/2026 ')).toBe('2026-10-07');
    expect(parseDmy('2026-10-07')).toBeUndefined();
    expect(parseYmd('')).toBeUndefined();
  });
});

describe('date math', () => {
  it('adds days across months', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts days between dates', () => {
    expect(diffDays('2026-10-30', '2026-11-02')).toBe(3);
    expect(diffDays('2026-11-02', '2026-10-30')).toBe(-3);
  });

  it('knows month lengths and clamps days', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(clampDate(2026, 2, 30)).toBe('2026-02-28');
    expect(clampDate(2026, 3, 30)).toBe('2026-03-30');
  });

  it('moves between months', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthKey('2026-03-15')).toBe('2026-03');
    expect(startOfMonth('2026-03-15')).toBe('2026-03-01');
    expect(endOfMonth('2026-02-15')).toBe('2026-02-28');
  });
});
