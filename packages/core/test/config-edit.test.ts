import { describe, expect, it } from 'vitest';
import { addRule, upsertAccount } from '../src/config/edit';
import { loadConfig } from '../src/config/load';

const BASE = [
  '# Kanakku settings',
  'version: 1',
  'homeCurrency: LKR # money is valued in this',
  'locale: en-LK',
  'accounts:',
  '  - id: main',
  '    name: Main account # where the salary lands',
  '    bank: boc',
  '    type: savings',
  '    currency: LKR',
  '    number: "0012345678"',
  '  - id: fd-1',
  '    name: One-year deposit',
  '    bank: combank',
  '    type: fixed-deposit',
  '    currency: LKR',
  '    number: "003000000001"',
  '    deposit: { principal: 500000, start: 2026-01-10 }',
  'rules:',
  '  - match: SALARY # the monthly pay',
  '    kind: income',
  '    category: Salary',
  '',
].join('\n');

function edited(result: { text: string } | { errors: unknown[] }): string {
  if ('errors' in result) throw new Error(JSON.stringify(result.errors));
  return result.text;
}

function config(text: string) {
  const loaded = loadConfig(text);
  if (!loaded.config) throw new Error(JSON.stringify(loaded.errors));
  return loaded.config;
}

describe('upsertAccount', () => {
  it('adds a deposit account with its term and keeps comments', () => {
    const text = edited(
      upsertAccount(BASE, {
        id: 'fd-2',
        name: 'Three-month deposit',
        bank: 'combank',
        type: 'fixed-deposit',
        currency: 'LKR',
        number: '003012345678',
        deposit: { start: '2026-08-07', months: 3, rate: 8 },
      }),
    );
    for (const comment of [
      '# Kanakku settings',
      '# money is valued in this',
      '# where the salary lands',
      '# the monthly pay',
    ]) {
      expect(text).toContain(comment);
    }
    const added = config(text).accounts.at(-1);
    expect(added).toMatchObject({
      id: 'fd-2',
      number: '003012345678',
      deposit: { start: '2026-08-07', months: 3, rate: 8 },
    });
  });

  it('updates the fields of an existing account', () => {
    const text = edited(upsertAccount(BASE, { id: 'main', name: 'Salary account' }));
    expect(config(text).accounts[0]).toEqual({
      ...config(BASE).accounts[0],
      name: 'Salary account',
    });
    expect(text).toContain('# where the salary lands');
    expect(config(text).accounts).toHaveLength(2);
  });

  it('merges deposit details instead of replacing them', () => {
    const text = edited(upsertAccount(BASE, { id: 'fd-1', deposit: { months: 12, rate: 9 } }));
    expect(config(text).accounts[1]?.deposit).toEqual({
      principal: 50000000,
      start: '2026-01-10',
      months: 12,
      rate: 9,
    });
  });

  it('keeps CRLF line endings and a BOM', () => {
    const windows = `﻿${BASE.replace(/\n/g, '\r\n')}`;
    const text = edited(upsertAccount(windows, { id: 'main', name: 'Salary account' }));
    expect(text.startsWith('﻿')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(config(text.replace(/^﻿/, '')).accounts[0]?.name).toBe('Salary account');
  });

  it('refuses an account that would not load', () => {
    const result = upsertAccount(BASE, {
      id: 'odd',
      name: 'Odd',
      bank: 'boc',
      type: 'savings',
      currency: 'lkr',
    });
    expect(result).toEqual({
      errors: [expect.objectContaining({ path: 'accounts[2].currency' })],
    });
  });

  it('refuses a new account without name, bank, type and currency', () => {
    expect(upsertAccount(BASE, { id: 'new', name: 'New' })).toEqual({
      errors: [
        {
          path: 'accounts',
          message: 'name, bank, type and currency are needed for a new account',
        },
      ],
    });
  });

  it('refuses to edit a config that already has errors', () => {
    const broken = BASE.replace(
      'currency: LKR\n    number: "0012345678"',
      'currency: lkr\n    number: "0012345678"',
    );
    expect('errors' in upsertAccount(broken, { id: 'main', name: 'X' })).toBe(true);
    expect('errors' in addRule(broken, { match: 'RENT', category: 'Rent' })).toBe(true);
  });
});

describe('addRule', () => {
  it('adds a rule at the end', () => {
    const text = edited(addRule(BASE, { match: 'RENT', category: 'Rent', direction: 'out' }));
    expect(config(text).rules.at(-1)).toEqual({
      match: { text: 'RENT' },
      direction: 'out',
      category: 'Rent',
    });
    expect(text).toContain('# the monthly pay');
  });

  it('adds a rules list when there is none', () => {
    const bare = 'version: 1\nhomeCurrency: LKR\n';
    const text = edited(addRule(bare, { match: 'RENT', kind: 'spending', category: 'Rent' }));
    expect(config(text).rules).toEqual([
      { match: { text: 'RENT' }, kind: 'spending', category: 'Rent' },
    ]);
    expect(text).toMatch(/rules:\n\s+- match: RENT/);
  });

  it('refuses a rule shorter than 3 characters', () => {
    expect(addRule(BASE, { match: '  ab ', category: 'Rent' })).toEqual({
      errors: [{ path: 'rules', message: 'the text to match needs at least 3 characters' }],
    });
  });
});
