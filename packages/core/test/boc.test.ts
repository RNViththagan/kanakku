import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boc } from '../src/banks/boc';
import type { FileInput } from '../src/banks/types';
import { matchWording } from '../src/banks/wording';
import { applyUnreadableShare, verifyChecks } from '../src/ledger/checks';

const text = (name: string) =>
  readFileSync(new URL(`./fixtures/boc/${name}`, import.meta.url), 'utf8');
const input = (name: string, body = text(name)): FileInput => ({
  path: `Bank/BOC/${name}`,
  name,
  text: body,
});
const [format] = boc.formats;
if (!format) throw new Error('BOC has no format');

describe('BOC account CSV', () => {
  it('detects its own file', () => {
    expect(format.detect(input('account.csv'))).toBeGreaterThanOrEqual(0.9);
    const withBom = String.fromCharCode(0xfeff) + text('account.csv');
    expect(format.detect(input('bom.csv', withBom))).toBeGreaterThanOrEqual(0.9);
    const hnbLayout = 'Date, Ref.No, Particulars, Debits, Credits, Balance\n';
    expect(format.detect(input('x.csv', hnbLayout))).toBeNull();
  });

  it('reads the header', () => {
    const parsed = format.parse(input('account.csv'));
    expect(parsed.account).toEqual({ number: '0012345678', currency: 'LKR' });
    expect(parsed.period).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(parsed.generatedAt).toBe('2026-04-01');
    expect(parsed.checks).toEqual({
      credits: '105012.40',
      creditCount: 3,
      debits: '47206.12',
      debitCount: 9,
    });
  });

  it('reads rows in file order', () => {
    const parsed = format.parse(input('account.csv'));
    expect(parsed.rows).toHaveLength(12);
    expect(parsed.rows[0]).toMatchObject({
      date: '2026-03-30',
      description: 'POS       SUPERMART - COLOMBO',
      amount: '-2350.00',
      balance: '107806.28',
    });
    expect(parsed.rows[1]).toMatchObject({ amount: '5000.00', balance: '110156.28' });
    expect(parsed.rows[0]?.reference).toBeUndefined();
    expect(parsed.issues).toEqual([]);
  });

  it('checks totals', () => {
    expect(verifyChecks(format.parse(input('account.csv')), 'LKR')).toEqual([]);
    const edited = text('account.csv').replace('"1,450.50"', '"1,405.50"');
    const issues = verifyChecks(format.parse(input('edited.csv', edited)), 'LKR');
    expect(issues.map((issue) => issue.code)).toEqual(['totals-mismatch']);
  });

  it('rejects impossible dates and marks the file unreadable', () => {
    const resaved = applyUnreadableShare(format.parse(input('resaved.csv')));
    expect(resaved.rows).toEqual([]);
    expect(resaved.issues.some((issue) => issue.code === 'unreadable')).toBe(true);

    const oneBad = text('account.csv').replace('2026-02-14', '2026-02-30');
    const parsed = applyUnreadableShare(format.parse(input('one-bad.csv', oneBad)));
    expect(parsed.rows).toHaveLength(11);
    expect(parsed.issues.filter((issue) => issue.code === 'bad-row')).toHaveLength(1);
    expect(parsed.issues.some((issue) => issue.code === 'unreadable')).toBe(false);
  });
});

describe('BOC wording', () => {
  const tags = (description: string, direction: 'in' | 'out') =>
    matchWording(description, direction, 'savings', boc.wording).tags;

  it('tells tax on interest from interest', () => {
    expect(tags('INTEREST WITHHELD', 'out')).toEqual(['tax']);
    expect(tags('INTEREST PAY SYS-GEN', 'in')).toEqual(['interest']);
  });

  it('finds fees, cash and purchases', () => {
    expect(tags('ATM SERVICE CHARGE', 'out')).toEqual(['fee']);
    expect(tags('SMS ALERT MONTHLY', 'out')).toEqual(['fee']);
    expect(tags('MINIMUM BALANCE CHARGE-SAVINGS', 'out')).toEqual(['fee']);
    expect(tags('ATMCASHWDLSAMPLE BRANCH', 'out')).toEqual(['cash']);
    expect(tags('SAVINGS DEPOSIT', 'in')).toEqual(['cash']);
    expect(tags('POS       SUPERMART - COLOMBO', 'out')).toEqual(['purchase']);
    expect(tags('ECOMMERCE PHONE COMPANY PLC', 'out')).toEqual(['purchase']);
  });

  it('finds opening deposits and transfer hints', () => {
    expect(tags('Initial Deposit', 'in')).toEqual(['opening-deposit']);
    expect(tags('CEFT-OWN', 'out')).toEqual(['transfer-hint']);
  });
});
