import { describe, expect, it } from 'vitest';
import type { Account } from '../src/config/schema';
import { parseTidyName, tidyName } from '../src/tidy/names';

const account = (fields: Partial<Account> & Pick<Account, 'id'>): Account => ({
  name: fields.id,
  bank: 'boc',
  type: 'savings',
  currency: 'LKR',
  ...fields,
});

const period = { from: '2026-01-01', to: '2026-03-31' };

describe('tidyName', () => {
  it('uses bank, number and period', () => {
    const main = account({ id: 'main', number: '0012345678' });
    expect(
      tidyName({ bankShort: 'BOC', account: main, accountsAtBank: [main], period, ext: 'csv' }),
    ).toBe('BOC_0012345678_2026-01-01_to_2026-03-31.csv');
  });

  it('adds the currency when the bank holds more than one', () => {
    const lkr = account({ id: 'lkr', bank: 'hnb', number: '33333XXXXX33' });
    const usd = account({ id: 'usd', bank: 'hnb', currency: 'USD', number: '12345XXXXX67' });
    const march = { from: '2026-03-01', to: '2026-03-31' };
    expect(
      tidyName({
        bankShort: 'HNB',
        account: usd,
        accountsAtBank: [lkr, usd],
        period: march,
        ext: 'csv',
      }),
    ).toBe('HNB_12345XXXXX67_USD_2026-03-01_to_2026-03-31.csv');
    expect(
      tidyName({
        bankShort: 'HNB',
        account: usd,
        accountsAtBank: [usd],
        period: march,
        ext: 'csv',
      }),
    ).toBe('HNB_12345XXXXX67_2026-03-01_to_2026-03-31.csv');
  });

  it('labels cards by type, and partial cycles', () => {
    const card = account({ id: 'card', bank: 'combank', type: 'credit-card' });
    const cycle = { from: '2026-10-06', to: '2026-11-05' };
    const input = {
      bankShort: 'ComBank',
      account: card,
      accountsAtBank: [card],
      period: cycle,
      ext: 'csv',
    };
    expect(tidyName(input)).toBe('ComBank_CreditCard_2026-10-06_to_2026-11-05.csv');
    expect(tidyName({ ...input, partial: true })).toBe(
      'ComBank_CreditCard_2026-10-06_to_2026-11-05_partial.csv',
    );
  });

  it('adds the account id when two cards have no numbers', () => {
    const one = account({ id: 'card', bank: 'combank', type: 'credit-card' });
    const two = account({ id: 'card2', bank: 'combank', type: 'credit-card' });
    const cycle = { from: '2026-10-06', to: '2026-11-05' };
    expect(
      tidyName({
        bankShort: 'ComBank',
        account: two,
        accountsAtBank: [one, two],
        period: cycle,
        ext: 'csv',
      }),
    ).toBe('ComBank_CreditCard-card2_2026-10-06_to_2026-11-05.csv');
  });
});

describe('parseTidyName', () => {
  it('reverses tidy names', () => {
    expect(parseTidyName('BOC_0012345678_2026-01-01_to_2026-03-31.csv')).toEqual({
      bank: 'BOC',
      label: '0012345678',
      from: '2026-01-01',
      to: '2026-03-31',
      partial: false,
    });
    expect(parseTidyName('HNB_12345XXXXX67_USD_2026-03-01_to_2026-03-31.csv')).toEqual({
      bank: 'HNB',
      label: '12345XXXXX67',
      currency: 'USD',
      from: '2026-03-01',
      to: '2026-03-31',
      partial: false,
    });
    expect(parseTidyName('ComBank_CreditCard-card2_2026-10-06_to_2026-11-05_partial.csv')).toEqual({
      bank: 'ComBank',
      label: 'CreditCard-card2',
      from: '2026-10-06',
      to: '2026-11-05',
      partial: true,
    });
  });

  it('rejects other names and impossible periods', () => {
    expect(parseTidyName('Account Statement (3).csv')).toBeUndefined();
    expect(parseTidyName('BOC_0012345678_2026-13-01_to_2026-03-31.csv')).toBeUndefined();
    expect(parseTidyName('BOC_0012345678_2026-03-31_to_2026-01-01.csv')).toBeUndefined();
  });
});
