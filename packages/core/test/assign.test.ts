import { describe, expect, it } from 'vitest';
import { boc } from '../src/banks/boc';
import { combank } from '../src/banks/combank';
import { hnb } from '../src/banks/hnb';
import type { BankPlugin, FileInput, ParsedStatement, StatementFormat } from '../src/banks/types';
import type { Account } from '../src/config/schema';
import type { Decision } from '../src/decisions/load';
import { assignAccount, maskFits } from '../src/ledger/assign';

const account = (fields: Partial<Account> & Pick<Account, 'id' | 'bank'>): Account => ({
  name: fields.id,
  type: 'savings',
  currency: 'LKR',
  ...fields,
});

const bocMain = account({ id: 'main', bank: 'boc', number: '0012345678' });
const bocOther = account({ id: 'other', bank: 'boc', type: 'current', number: '0087878787' });
const hnbLkr = account({ id: 'hnb-lkr', bank: 'hnb', number: '12345XXXXX67' });
const hnbUsd = account({ id: 'hnb-usd', bank: 'hnb', currency: 'USD', number: '67890XXXXX12' });
const cbSavings = account({ id: 'cb', bank: 'combank', number: '0087654321' });
const card = account({
  id: 'card',
  bank: 'combank',
  type: 'credit-card',
  card: { statementDay: 5, dueDay: 26, openingOwed: 0 },
});

function formatOf(plugin: BankPlugin, id?: string): StatementFormat {
  const format = id ? plugin.formats.find((candidate) => candidate.id === id) : plugin.formats[0];
  if (!format) throw new Error(`missing format ${id}`);
  return format;
}

function run(
  plugin: BankPlugin,
  parsedAccount: ParsedStatement['account'],
  accounts: Account[],
  options: { name?: string; format?: string; decisions?: Decision[] } = {},
) {
  const file: FileInput = {
    path: `x/${options.name ?? 'file.csv'}`,
    name: options.name ?? 'file.csv',
    text: '',
  };
  return assignAccount({
    parsed: { account: parsedAccount, rows: [], issues: [] },
    file,
    plugin,
    format: formatOf(plugin, options.format),
    accounts,
    decisions: options.decisions ?? [],
    fileHash: 'h1',
  });
}

describe('assignAccount', () => {
  it('uses the account number in the file', () => {
    expect(run(boc, { number: '0012345678', currency: 'LKR' }, [bocMain, bocOther])).toEqual({
      account: bocMain,
      via: 'number',
    });
  });

  it('uses a masked number', () => {
    expect(run(hnb, { masked: '12345XXXXX67' }, [hnbLkr, hnbUsd])).toEqual({
      account: hnbLkr,
      via: 'masked',
    });
  });

  it('uses a saved answer for the file', () => {
    const decisions: Decision[] = [
      { id: 'd', at: 'x', type: 'file-account', file: 'h1', account: 'hnb-usd' },
    ];
    expect(run(hnb, {}, [hnbLkr, hnbUsd], { decisions })).toEqual({
      account: hnbUsd,
      via: 'answer',
    });
  });

  it('uses the number in the bank download name', () => {
    const result = run(combank, { numberHint: '0087654321', currency: 'LKR' }, [cbSavings, card], {
      format: 'combank-account-csv',
    });
    expect(result).toEqual({ account: cbSavings, via: 'file-name' });
  });

  it('uses a tidy file name', () => {
    const result = run(hnb, {}, [hnbLkr, hnbUsd], {
      name: 'HNB_67890XXXXX12_USD_2026-05-01_to_2026-05-31.csv',
    });
    expect(result).toEqual({ account: hnbUsd, via: 'tidy-name' });
  });

  it('uses the only account the format can hold', () => {
    const result = run(combank, { type: 'credit-card', currency: 'LKR' }, [cbSavings, card], {
      format: 'combank-card-csv',
    });
    expect(result).toEqual({ account: card, via: 'only-account' });
  });

  it('asks when nothing decides', () => {
    expect(run(hnb, {}, [hnbLkr, hnbUsd], { name: 'Account Statement (3).csv' })).toEqual({
      ask: 'pick-account',
      candidates: ['hnb-lkr', 'hnb-usd'],
    });
  });

  it("does not give a file with an unknown number to the bank's only account", () => {
    expect(run(boc, { number: '0099999999', currency: 'LKR' }, [bocMain])).toEqual({
      ask: 'new-account',
      proposal: { bank: 'boc', number: '0099999999', currency: 'LKR' },
    });
  });

  it('still lets a saved answer assign a file with an unknown number', () => {
    const decisions: Decision[] = [
      { id: 'd', at: 'x', type: 'file-account', file: 'h1', account: 'main' },
    ];
    expect(run(boc, { number: '0099999999' }, [bocMain], { decisions })).toEqual({
      account: bocMain,
      via: 'answer',
    });
  });

  it('asks when a masked number fits two accounts', () => {
    const twin = account({ id: 'twin', bank: 'hnb', number: '123450000067' });
    expect(run(hnb, { masked: '12345XXXXX67' }, [hnbLkr, twin])).toEqual({
      ask: 'pick-account',
      candidates: ['hnb-lkr', 'twin'],
    });
  });

  it('asks when two cards at the bank have no numbers', () => {
    const card2 = { ...card, id: 'card2' };
    const result = run(combank, { type: 'credit-card', currency: 'LKR' }, [card, card2], {
      format: 'combank-card-csv',
    });
    expect(result).toEqual({ ask: 'pick-account', candidates: ['card', 'card2'] });
  });

  it('proposes a card when the bank has none yet', () => {
    const result = run(combank, { type: 'credit-card', currency: 'LKR' }, [cbSavings], {
      format: 'combank-card-csv',
    });
    expect(result).toEqual({
      ask: 'new-account',
      proposal: { bank: 'combank', type: 'credit-card', currency: 'LKR' },
    });
  });
});

describe('maskFits', () => {
  it('treats X as any digit on either side', () => {
    expect(maskFits('12345XXXXX67', '12345XXXXX67')).toBe(true);
    expect(maskFits('123456789067', '12345XXXXX67')).toBe(true);
    expect(maskFits('12345XXXXX67', '123456789067')).toBe(true);
    expect(maskFits('123456789068', '12345XXXXX67')).toBe(false);
    expect(maskFits('1234567890', '12345XXXXX67')).toBe(false);
  });
});
