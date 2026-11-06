import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hnb } from '../src/banks/hnb';
import type { FileInput } from '../src/banks/types';
import { matchWording } from '../src/banks/wording';

const text = (name: string) =>
  readFileSync(new URL(`./fixtures/hnb/${name}`, import.meta.url), 'utf8');
const input = (name: string, body = text(name)): FileInput => ({
  path: `Bank/HNB/${name}`,
  name,
  text: body,
});
const [format] = hnb.formats;
if (!format) throw new Error('HNB has no format');

describe('HNB account CSV', () => {
  it('detects its own file', () => {
    expect(format.detect(input('lkr-2026-03.csv'))).toBeGreaterThanOrEqual(0.9);
    expect(format.detect(input('empty-2026-04.csv'))).toBeGreaterThanOrEqual(0.9);
    const boc = 'BANK OF CEYLON - ACCOUNT STATEMENT\nAccount Number,1\n';
    expect(format.detect(input('x.csv', boc))).toBeNull();
  });

  it('reads the masked number, closing balance and rows', () => {
    const parsed = format.parse(input('lkr-2026-03.csv'));
    expect(parsed.account).toEqual({ masked: '12345XXXXX67' });
    expect(parsed.closing).toEqual({ date: '2026-03-31', balance: '1203.04' });
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0]).toMatchObject({
      date: '2026-03-04',
      reference: 'DC123456',
      description: 'Finacle Alert Charges',
      amount: '-25',
      balance: '1200.50',
    });
    expect(parsed.rows[1]).toMatchObject({ reference: 'SD2000001', amount: '150000' });
    expect(parsed.issues).toEqual([]);
  });

  it('infers the whole month when every row is in it', () => {
    expect(format.parse(input('lkr-2026-03.csv')).period).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
      inferred: true,
    });
    const early = text('lkr-2026-03.csv').replace('04/03/2026', '28/02/2026');
    expect(format.parse(input('early.csv', early)).period).toBeUndefined();
  });

  it('reads a month with no transactions', () => {
    const parsed = format.parse(input('empty-2026-04.csv'));
    expect(parsed.rows).toEqual([]);
    expect(parsed.period).toEqual({ from: '2026-04-01', to: '2026-04-30', inferred: true });
    expect(parsed.closing).toEqual({ date: '2026-04-30', balance: '1203.04' });
  });

  it('reads a month without an interest row', () => {
    const parsed = format.parse(input('no-interest-2026-05.csv'));
    expect(parsed.account.masked).toBeUndefined();
    expect(parsed.rows[1]).toMatchObject({ description: '', amount: '100' });
  });

  it('marks unreadable rows', () => {
    const broken = text('lkr-2026-03.csv').replace('20/03/2026', '20/13/2026');
    const parsed = format.parse(input('broken.csv', broken));
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.issues.map((issue) => issue.code)).toEqual(['bad-row']);
  });
});

describe('HNB files re-saved by a spreadsheet', () => {
  it('marks a file with month-first dates unreadable', () => {
    const swapped = text('lkr-2026-03.csv').replace(/^(\d{2})\/(\d{2})\/(\d{4})/gm, '$2/$1/$3');
    const parsed = format.parse(input('swapped.csv', swapped));
    expect(parsed.issues.map((issue) => issue.code)).toContain('date-order-suspect');
  });

  it('treats a row with extra cells as a bad row', () => {
    const shifted = text('lkr-2026-03.csv').replace(
      'Finacle Alert Charges,25,,1200.50',
      'Finacle Alert Charges,2,5,,1200.50',
    );
    const parsed = format.parse(input('shifted.csv', shifted));
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.issues.map((issue) => issue.code)).toEqual(['bad-row']);
  });
});

describe('HNB wording', () => {
  const match = (description: string, direction: 'in' | 'out') =>
    matchWording(description, direction, 'savings', hnb.wording);

  it('finds fixed deposit events with their numbers', () => {
    expect(match('Dr. Tran for funding A/c 123456789012', 'out')).toEqual({
      tags: ['deposit-placement'],
      deposit: '123456789012',
    });
    expect(match('123456789012 : Closure Proceeds', 'in')).toEqual({
      tags: ['deposit-closure'],
      deposit: '123456789012',
    });
  });

  it('finds interest and fees', () => {
    expect(match('12345XXXXX67:Int.Pd:23-02-2026 to 23-03-2026', 'in').tags).toEqual(['interest']);
    for (const fee of [
      'Finacle Alert Charges',
      'MB/IB FEE 2026',
      'MB/IB Bi Annual Fee',
      'COUNTER WITHDRAWAL CHGS',
    ]) {
      expect(match(fee, 'out').tags).toEqual(['fee']);
    }
  });

  it('finds transfer hints', () => {
    expect(match('MB:own-AML1', 'out')).toEqual({
      tags: ['transfer-hint'],
      counterparty: 'own-AML1',
    });
    expect(match('CEFT-JAN', 'in').tags).toEqual(['transfer-hint']);
  });

  it('declares its usual transfer fee', () => {
    expect(hnb.transferFees).toEqual({ LKR: ['25'] });
  });
});
