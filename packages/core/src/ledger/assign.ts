import type { BankPlugin, FileInput, ParsedStatement, StatementFormat } from '../banks/types';
import type { Account } from '../config/schema';
import type { Decision } from '../decisions/load';
import { accountLabel, parseTidyName } from '../tidy/names';

export type Assignment =
  | {
      account: Account;
      via: 'number' | 'masked' | 'file-name' | 'tidy-name' | 'answer' | 'only-account';
    }
  | { ask: 'pick-account'; candidates: string[] }
  | { ask: 'new-account'; proposal: Partial<Account> };

const WILDCARDS = new Set(['X', 'x', '*']);

function clean(number: string): string {
  return number.replace(/[\s-]/g, '');
}

export function maskFits(a: string, b: string): boolean {
  const left = clean(a);
  const right = clean(b);
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index] ?? '';
    const y = right[index] ?? '';
    if (!WILDCARDS.has(x) && !WILDCARDS.has(y) && x !== y) return false;
  }
  return true;
}

function byNumber(accounts: Account[], number: string): Account[] {
  return accounts.filter(
    (account) => account.number !== undefined && maskFits(account.number, number),
  );
}

function decide(
  hits: Account[],
  via: Exclude<Assignment, { ask: string }>['via'],
): Assignment | undefined {
  const [only] = hits;
  if (hits.length === 1 && only) return { account: only, via };
  if (hits.length > 1)
    return { ask: 'pick-account', candidates: hits.map((account) => account.id) };
  return undefined;
}

function proposal(
  parsed: ParsedStatement,
  plugin: BankPlugin,
  format: StatementFormat,
  number?: string,
): Partial<Account> {
  const result: Partial<Account> = { bank: plugin.id };
  if (number) result.number = number;
  if (parsed.account.currency) result.currency = parsed.account.currency;
  const [onlyType] = format.accountTypes;
  const type = parsed.account.type ?? (format.accountTypes.length === 1 ? onlyType : undefined);
  if (type) result.type = type;
  return result;
}

export function assignAccount(input: {
  parsed: ParsedStatement;
  file: FileInput;
  plugin: BankPlugin;
  format: StatementFormat;
  accounts: Account[];
  decisions: Decision[];
  fileHash: string;
}): Assignment {
  const { parsed, file, plugin, format, accounts, decisions, fileHash } = input;
  const atBank = accounts.filter((account) => account.bank === plugin.id && !account.discovered);
  const { number, masked, numberHint } = parsed.account;

  const answered = decisions.find(
    (decision) => decision.type === 'file-account' && decision.file === fileHash,
  );
  const answeredAccount =
    answered?.type === 'file-account'
      ? accounts.find((account) => account.id === answered.account)
      : undefined;

  const stated = number ?? masked;
  if (stated) {
    const found = decide(byNumber(atBank, stated), number ? 'number' : 'masked');
    if (found && 'account' in found) return found;
    if (answeredAccount) return { account: answeredAccount, via: 'answer' };
    return found ?? { ask: 'new-account', proposal: proposal(parsed, plugin, format, stated) };
  }
  if (answeredAccount) return { account: answeredAccount, via: 'answer' };

  if (numberHint) {
    return (
      decide(byNumber(atBank, numberHint), 'file-name') ?? {
        ask: 'new-account',
        proposal: proposal(parsed, plugin, format, numberHint),
      }
    );
  }

  const tidy = parseTidyName(file.name);
  if (tidy && tidy.bank.toLowerCase() === plugin.shortName.toLowerCase()) {
    const hits = atBank.filter(
      (account) =>
        (!tidy.currency || account.currency === tidy.currency) &&
        (accountLabel(account, atBank) === tidy.label ||
          (account.number !== undefined && maskFits(account.number, tidy.label))),
    );
    const found = decide(hits, 'tidy-name');
    if (found) return found;
  }

  const holdable = atBank.filter((account) => format.accountTypes.includes(account.type));
  return (
    decide(holdable, 'only-account') ?? {
      ask: 'new-account',
      proposal: proposal(parsed, plugin, format),
    }
  );
}
