import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combank } from '../src/banks/combank';
import type { FileInput } from '../src/banks/types';
import { matchWording } from '../src/banks/wording';
import { applyUnreadableShare } from '../src/ledger/checks';

const ACCOUNT_FILE = 'transaction_history_0087654321_20260401.csv';
const CARD_FILE = 'transactions_history_current_period.csv';

const text = (name: string) =>
  readFileSync(new URL(`./fixtures/combank/${name}`, import.meta.url), 'utf8');
const input = (name: string, body = text(name)): FileInput => ({
  path: `Bank/ComBank/${name}`,
  name,
  text: body,
});
const accountFormat = combank.formats.find((format) => format.id === 'combank-account-csv');
const cardFormat = combank.formats.find((format) => format.id === 'combank-card-csv');
if (!accountFormat || !cardFormat) throw new Error('ComBank formats missing');

describe('ComBank formats', () => {
  it('each detects its own file', () => {
    expect(accountFormat.detect(input(ACCOUNT_FILE))).toBeGreaterThanOrEqual(0.9);
    expect(cardFormat.detect(input(CARD_FILE))).toBeGreaterThanOrEqual(0.9);
    const accountScore = accountFormat.detect(input(CARD_FILE)) ?? 0;
    expect(accountScore).toBeLessThan(cardFormat.detect(input(CARD_FILE)) ?? 0);
    expect(cardFormat.detect(input(ACCOUNT_FILE))).toBeNull();
  });

  it('does not claim other banks files', () => {
    const boc = 'BANK OF CEYLON - ACCOUNT STATEMENT\nAccount Number,1\n';
    expect(accountFormat.detect(input('x.csv', boc))).toBeNull();
    expect(cardFormat.detect(input('x.csv', boc))).toBeNull();
  });
});

describe('ComBank account CSV', () => {
  it('reads the account details', () => {
    const parsed = accountFormat.parse(input(ACCOUNT_FILE));
    expect(parsed.account).toEqual({ numberHint: '0087654321', currency: 'LKR' });
    expect(parsed.generatedAt).toBe('2026-04-01');
    expect(parsed.period).toBeUndefined();
  });

  it('reads every row and none of the footer', () => {
    const parsed = accountFormat.parse(input(ACCOUNT_FILE));
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.rows[0]).toMatchObject({
      date: '2026-03-30',
      description: 'ADVANCE INCOME TAX / - / -',
      amount: '-61.73',
      balance: '211147.83',
    });
    expect(parsed.rows[5]).toMatchObject({ date: '2026-03-03', amount: '-40000.00' });
    expect(parsed.issues).toEqual([]);
  });

  it('keeps reading after a bad row', () => {
    const broken = text(ACCOUNT_FILE).replace(',10/03/2026,', ',32/03/2026,');
    const parsed = accountFormat.parse(input(ACCOUNT_FILE, broken));
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows.at(-1)?.date).toBe('2026-03-03');
    expect(parsed.issues.map((issue) => issue.code)).toEqual(['bad-row']);
  });
});

describe('ComBank card CSV', () => {
  it('reads charges, refunds and references', () => {
    const parsed = cardFormat.parse(input(CARD_FILE));
    expect(parsed.account).toEqual({ currency: 'LKR', type: 'credit-card' });
    expect(parsed.generatedAt).toBe('2026-02-06');
    expect(parsed.rows.map((row) => row.date)).toEqual([
      '2026-01-08',
      '2026-01-20',
      '2026-01-11',
      '2026-02-03',
      '2026-02-04',
    ]);
    expect(parsed.rows[0]).toMatchObject({ amount: '-3000.00', reference: '000000000001' });
    expect(parsed.rows[4]).toMatchObject({ amount: '500.50', reference: '000000000005' });
    expect(parsed.rows[0]?.balance).toBeUndefined();
  });
});

describe('ComBank files re-saved by a spreadsheet', () => {
  it('marks a card file with dropped quotes unreadable', () => {
    const unquoted = text(CARD_FILE).replace(/"([\d,]+\.\d{2})"/g, '$1');
    const parsed = applyUnreadableShare(cardFormat.parse(input(CARD_FILE, unquoted)));
    expect(parsed.rows).toEqual([]);
    expect(parsed.issues.map((issue) => issue.code)).toContain('unreadable');
  });

  it('marks a card file with month-first dates unreadable', () => {
    const swapped = text(CARD_FILE).replace(/,(\d{2})\/(\d{2})\/(\d{4}),/g, ',$2/$1/$3,');
    const parsed = applyUnreadableShare(cardFormat.parse(input(CARD_FILE, swapped)));
    expect(parsed.rows).toEqual([]);
    expect(parsed.issues.map((issue) => issue.code)).toContain('date-order-suspect');
  });

  it('rejects dates without two-digit days and months', () => {
    const short = text(CARD_FILE).replace(',08/01/2026,', ',8/1/2026,');
    const parsed = cardFormat.parse(input(CARD_FILE, short));
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.issues.map((issue) => issue.code)).toEqual(['bad-row']);
  });
});

describe('ComBank wording', () => {
  const match = (
    description: string,
    direction: 'in' | 'out',
    type: 'savings' | 'credit-card' = 'savings',
  ) => matchWording(description, direction, type, combank.wording);

  it('finds tax, interest and fees', () => {
    expect(match('ADVANCE INCOME TAX / - / -', 'out').tags).toEqual(['tax']);
    expect(match('INTEREST / - / -', 'in').tags).toEqual(['interest']);
    expect(match('IB CEFT CHGS / - / -', 'out').tags).toEqual(['fee']);
  });

  it('finds fixed deposit events with their numbers', () => {
    expect(match('TRF TO: 003012345678 / IBT0000000001 / -', 'out')).toEqual({
      tags: ['deposit-placement'],
      deposit: '003012345678',
    });
    expect(match('IB Time Redemption Deposit', 'in').tags).toEqual(['deposit-return']);
    expect(match('Principal from eFD:003012345678', 'in')).toEqual({
      tags: ['deposit-return'],
      deposit: '003012345678',
    });
    expect(match('Interest from eFD:003012345678', 'in')).toEqual({
      tags: ['deposit-interest'],
      deposit: '003012345678',
    });
  });

  it('finds opening deposits, transfer hints and card payments', () => {
    expect(match('INITIAL DEP / 1 / 2', 'in').tags).toEqual(['opening-deposit']);
    expect(match('own / O0000000002 / EF 20260310 101500 CEFLKU0002', 'in').tags).toEqual([
      'transfer-hint',
    ]);
    expect(match('PAYMENT RECEIVED - THANK YOU', 'in', 'credit-card').tags).toEqual([
      'card-payment',
    ]);
    expect(match('CAFE TWO COLOMBO 04 COLK / 000000000005 / -', 'in', 'credit-card').tags).toEqual(
      [],
    );
  });
});
