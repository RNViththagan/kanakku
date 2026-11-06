import { bankPlugins } from '../banks/registry';
import type {
  BankPlugin,
  FileInput,
  Issue,
  ParsedStatement,
  Period,
  StatementFormat,
} from '../banks/types';
import type { Account } from '../config/schema';
import type { Decision } from '../decisions/load';
import { diffDays } from '../model/dates';
import { hashText } from '../model/hash';
import { decimalToMinor } from '../model/money';
import type { IsoDate } from '../model/types';
import { accountLabel, parseTidyName, tidyName } from '../tidy/names';
import { assignAccount, maskFits } from './assign';
import { type CardCycle, cardCycles, cycleFor } from './cards';
import { applyUnreadableShare, verifyChecks } from './checks';
import { applyCategoryAnswers, applyDefaults, classify } from './classify';
import {
  type AccountCoverage,
  accountCoverage,
  BEHIND_DAYS,
  type CoverageSegment,
  filePeriod,
} from './coverage';
import { type NeedDraft, trackDeposits } from './deposits';
import { detectFormat } from './detect';
import { mergeAccountFiles } from './merge';
import { buildNeeds } from './needs';
import { type MoneyRow, toChronological, toMoneyRows } from './order';
import { applyPairAnswers, matchTransfers } from './transfers';
import type { FileStatus, Ledger, LedgerInput, Transaction } from './types';
import { buildConversions } from './valuation';

interface Entry {
  file: FileInput;
  status: FileStatus;
  parsed: ParsedStatement;
  rows: MoneyRow[];
  period?: Period;
  closing?: { date: IsoDate; balance: number };
  plugin: BankPlugin;
  account: Account;
}

function byDate(a: { date: string }, b: { date: string }): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function extensionOf(name: string): string {
  return /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? 'csv';
}

function readFile(
  file: FileInput,
  ctx: { plugins: BankPlugin[]; accounts: Account[]; decisions: Decision[] },
  drafts: NeedDraft[],
) {
  const status: FileStatus = {
    path: file.path,
    hash: hashText(file.text),
    rows: 0,
    status: 'ok',
    problems: [],
    issues: [],
  };
  const detected = detectFormat(file, ctx.plugins);
  if ('unreadable' in detected) {
    status.status = 'unreadable';
    status.issues.push({
      level: 'error',
      code: 'unreadable',
      message:
        detected.unreadable === 'tie'
          ? 'More than one bank format fits this file'
          : 'No bank plug-in can read this file',
      file: file.path,
    });
    return { status };
  }
  const { plugin, format } = detected;
  status.bank = plugin.id;
  status.format = format.id;
  if (file.folderBank && file.folderBank !== plugin.id) status.problems.push('wrong-folder');
  try {
    return readDetected(file, status, plugin, format, ctx, drafts);
  } catch (problem) {
    status.status = 'unreadable';
    status.issues.push({
      level: 'error',
      code: 'read-failed',
      message: `Kanakku could not read this file: ${(problem as Error).message}`,
      file: file.path,
    });
    return { status };
  }
}

function readDetected(
  file: FileInput,
  status: FileStatus,
  plugin: BankPlugin,
  format: StatementFormat,
  ctx: { plugins: BankPlugin[]; accounts: Account[]; decisions: Decision[] },
  drafts: NeedDraft[],
): { status: FileStatus; entry?: Entry } {
  const parsed = applyUnreadableShare(format.parse(file));
  status.issues.push(...parsed.issues.map((issue) => ({ ...issue, file: file.path })));
  if (parsed.issues.some((issue) => issue.level === 'error')) {
    status.status = 'unreadable';
    return { status };
  }
  status.rows = parsed.rows.length;
  if (parsed.generatedAt) status.generatedAt = parsed.generatedAt;
  const assignment = assignAccount({
    parsed,
    file,
    plugin,
    format,
    accounts: ctx.accounts,
    decisions: ctx.decisions,
    fileHash: status.hash,
  });
  if ('ask' in assignment) {
    status.status = 'unassigned';
    drafts.push(
      assignment.ask === 'new-account'
        ? {
            type: 'new-account',
            key: status.hash,
            message: `${file.name} is for an account Kanakku does not know yet. Add it?`,
            refs: { file: file.path },
            data: { proposal: assignment.proposal },
          }
        : {
            type: 'pick-account',
            key: status.hash,
            message: `Which account is ${file.name} for?`,
            refs: { file: file.path },
            data: { candidates: assignment.candidates },
          },
    );
    return { status };
  }
  const { account } = assignment;
  status.account = account.id;
  if (parsed.account.currency && parsed.account.currency !== account.currency) {
    status.issues.push({
      level: 'warning',
      code: 'currency-mismatch',
      message: `The file is in ${parsed.account.currency} but ${account.name} is in ${account.currency}`,
      file: file.path,
    });
  }
  status.issues.push(
    ...verifyChecks(parsed, account.currency).map((issue) => ({ ...issue, file: file.path })),
  );
  const ordered = toChronological(toMoneyRows(parsed.rows, account.currency, file.path));
  status.issues.push(...ordered.issues);
  const period = filePeriod(parsed, file.name, ordered.rows);
  const entry: Entry = { file, status, parsed, rows: ordered.rows, plugin, account };
  if (parsed.closing) {
    entry.closing = {
      date: parsed.closing.date,
      balance: decimalToMinor(parsed.closing.balance, account.currency),
    };
  }
  if (period) {
    entry.period = { from: period.from, to: period.to };
    status.period = entry.period;
  }
  return { status, entry };
}

function overlaps(a: Period, b: Period): boolean {
  return a.from <= b.to && b.from <= a.to;
}

function markFileProblems(group: Entry[], transactions: Transaction[]) {
  const preferred = [...group].sort(
    (a, b) =>
      b.rows.length - a.rows.length ||
      Number(parseTidyName(b.file.name) !== undefined) -
        Number(parseTidyName(a.file.name) !== undefined) ||
      (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0),
  );
  const kept: Entry[] = [];
  for (const entry of preferred) {
    const { period } = entry;
    const keptPaths = new Set(kept.map((other) => other.file.path));
    const own = transactions.filter((row) =>
      row.sources.some((source) => source.file === entry.file.path),
    );
    const coveredByKept =
      entry.rows.length > 0 &&
      own.every((row) => row.sources.some((source) => keptPaths.has(source.file))) &&
      period !== undefined &&
      kept.some(
        (other) => other.period && other.period.from <= period.from && other.period.to >= period.to,
      );
    if (coveredByKept) entry.status.problems.push('duplicate');
    else kept.push(entry);
  }
  for (const entry of group) {
    const { period } = entry;
    if (!period || entry.status.problems.includes('duplicate')) continue;
    const others = group.filter((other) => other !== entry && other.period);
    if (others.some((other) => other.period && overlaps(other.period, period))) {
      entry.status.problems.push('overlapping');
    }
  }
}

function markNames(entries: Entry[], accounts: Account[]) {
  for (const entry of entries) {
    const { account, plugin, file, rows, parsed } = entry;
    const fromData = filePeriod(parsed, '', rows);
    let period = fromData ? { from: fromData.from, to: fromData.to } : entry.period;
    let partial = false;
    const firstRow = rows[0];
    const lastRow = rows.at(-1);
    if (account.type === 'credit-card' && account.card && firstRow && lastRow) {
      const first = cycleFor(firstRow.date, account.card.statementDay);
      const last = cycleFor(lastRow.date, account.card.statementDay);
      period = { from: first.from, to: last.to };
      partial = (parsed.generatedAt ?? lastRow.date) < last.to;
    }
    if (!period) continue;
    const atBank = accounts.filter((other) => other.bank === plugin.id && !other.discovered);
    const expected = tidyName({
      bankShort: plugin.shortName,
      account,
      accountsAtBank: atBank,
      period,
      partial,
      ext: extensionOf(file.name),
    });
    entry.status.tidyName = expected;
    if (file.name === expected) continue;
    const named = parseTidyName(file.name);
    const dataFrom = firstRow?.date ?? parsed.closing?.date;
    const dataTo =
      parsed.closing?.date && (!lastRow || parsed.closing.date > lastRow.date)
        ? parsed.closing.date
        : lastRow?.date;
    const proper =
      named !== undefined &&
      named.bank.toLowerCase() === plugin.shortName.toLowerCase() &&
      (named.label === accountLabel(account, atBank) ||
        (account.number !== undefined && maskFits(account.number, named.label))) &&
      (!named.currency || named.currency === account.currency) &&
      (dataFrom === undefined || named.from <= dataFrom) &&
      (dataTo === undefined || named.to >= dataTo);
    if (!proper) entry.status.problems.unshift('improper-name');
  }
}

function cardCoverage(
  cycles: CardCycle[],
  group: Entry[],
  today: string,
  closed?: string,
): AccountCoverage {
  const latest = group
    .map((entry) => entry.parsed.generatedAt ?? entry.period?.to ?? '')
    .filter((date) => date !== '')
    .sort()
    .at(-1);
  const segments: CoverageSegment[] = [];
  for (const cycle of cycles) {
    const state = cycle.coverage === 'missing' ? 'missing' : 'covered';
    const to = latest && cycle.to > latest && state === 'covered' ? latest : cycle.to;
    const last = segments.at(-1);
    if (last && last.state === state) last.to = to;
    else segments.push({ from: cycle.from, to, state });
  }
  const coverage: AccountCoverage = { segments, brokenChains: [] };
  const first = cycles[0];
  if (first) coverage.firstKnown = first.from;
  if (latest) {
    coverage.lastCovered = latest;
    const behind = diffDays(latest, today);
    if (!closed && behind > BEHIND_DAYS) coverage.behindDays = behind;
  }
  return coverage;
}

function unusedDecisions(
  decisions: Decision[],
  ledger: Omit<Ledger, 'unusedDecisions'>,
  needIds: Set<string>,
): string[] {
  const txns = new Set(ledger.transactions.map((row) => row.id));
  const hashes = new Set(ledger.files.map((file) => file.hash));
  const accounts = new Set(ledger.accounts.map((account) => account.id));
  const descriptions = ledger.transactions.map((row) => row.description.toLowerCase());
  return decisions
    .filter((decision) => {
      switch (decision.type) {
        case 'file-account':
          return !hashes.has(decision.file);
        case 'pair':
          return !txns.has(decision.out) || !txns.has(decision.in);
        case 'not-transfer':
        case 'set':
          return !txns.has(decision.txn);
        case 'fd-principal':
          return !accounts.has(decision.deposit);
        case 'dismiss':
          return !needIds.has(decision.item);
        case 'counterparty':
          return !descriptions.some((text) => text.includes(decision.text.toLowerCase()));
        default:
          return false;
      }
    })
    .map((decision) => decision.id);
}

export function buildLedger(input: LedgerInput): Ledger {
  const plugins = input.plugins ?? bankPlugins;
  const { config, decisions, today } = input;
  const drafts: NeedDraft[] = [];
  const issues: Issue[] = [];
  const files: FileStatus[] = [];
  const entries: Entry[] = [];
  for (const file of input.files) {
    const read = readFile(file, { plugins, accounts: config.accounts, decisions }, drafts);
    files.push(read.status);
    if (read.entry) entries.push(read.entry);
  }

  const groups = new Map<string, Entry[]>();
  for (const entry of entries)
    groups.set(entry.account.id, [...(groups.get(entry.account.id) ?? []), entry]);

  let transactions: Transaction[] = [];
  const coverage: Ledger['coverage'] = {};
  const closings: Ledger['closings'] = {};
  for (const [accountId, group] of groups) {
    const account = group[0]?.account;
    if (!account) continue;
    const merged = mergeAccountFiles(
      accountId,
      account.currency,
      group.map((entry) => ({
        path: entry.file.path,
        newness: entry.parsed.generatedAt ?? entry.period?.to ?? entry.rows.at(-1)?.date ?? '',
        rows: entry.rows,
      })),
    );
    transactions.push(...merged.transactions);
    closings[accountId] = group.flatMap((entry) => (entry.closing ? [entry.closing] : []));
    if (account.type !== 'credit-card') {
      coverage[accountId] = accountCoverage({
        account,
        files: group.flatMap((entry) =>
          entry.period
            ? [
                {
                  path: entry.file.path,
                  period: entry.period,
                  ...(entry.closing && { closing: entry.closing }),
                },
              ]
            : [],
        ),
        transactions: merged.transactions,
        breaks: merged.breaks,
        today,
      });
    }
    markFileProblems(group, merged.transactions);
  }
  markNames(entries, config.accounts);
  transactions.sort(byDate);

  const accounts: Account[] = [...config.accounts];
  transactions = classify(transactions, {
    accounts,
    banks: plugins,
    rules: config.rules,
    decisions,
    categories: config.categories,
  });
  const paired = applyPairAnswers(transactions, decisions);
  const deposits = trackDeposits(paired.txns, { accounts, decisions });
  accounts.push(...deposits.accounts);
  issues.push(...deposits.issues);
  drafts.push(...deposits.needs);

  const cards: Ledger['cards'] = {};
  for (const account of accounts) {
    if (account.type !== 'credit-card') continue;
    const group = groups.get(account.id) ?? [];
    if (group.length === 0) continue;
    const cycles = cardCycles(
      account,
      deposits.txns,
      group.flatMap((entry) =>
        entry.period
          ? [
              {
                period: entry.period,
                ...(entry.parsed.generatedAt && { generatedAt: entry.parsed.generatedAt }),
              },
            ]
          : [],
      ),
      today,
    );
    cards[account.id] = cycles;
    coverage[account.id] = cardCoverage(cycles, group, today, account.closed);
  }

  const matched = matchTransfers(deposits.txns, {
    accounts,
    windowDays: config.transfers.windowDays,
    fees: config.transfers.fees,
    youNames: config.you.names,
    coverage: Object.fromEntries(
      Object.entries(coverage).map(([id, item]) => [
        id,
        {
          ...(item.firstKnown && { firstKnown: item.firstKnown }),
          ...(item.lastCovered && { lastCovered: item.lastCovered }),
        },
      ]),
    ),
    decisions,
  });
  const settled = applyCategoryAnswers(applyDefaults(matched.txns, accounts), decisions);
  const transfers = [...paired.transfers, ...deposits.transfers, ...matched.transfers];
  const conversions = buildConversions(transfers, new Map(settled.map((row) => [row.id, row])));

  const base = {
    today,
    homeCurrency: config.homeCurrency,
    locale: config.locale,
    accounts,
    files,
    transactions: settled,
    transfers,
    conversions,
    coverage,
    cards,
    closings,
    depositMoves: deposits.moves,
    issues,
    rates: { source: config.rates.source, stored: input.rates, manual: config.rates.manual },
  };
  const allNeeds = buildNeeds(base, drafts, config);
  const dismissed = new Set(
    decisions.flatMap((decision) => (decision.type === 'dismiss' ? [decision.item] : [])),
  );
  const needs = allNeeds.filter((need) => !dismissed.has(need.id));
  const withNeeds = { ...base, needs };
  return {
    ...withNeeds,
    unusedDecisions: unusedDecisions(
      decisions,
      withNeeds,
      new Set(allNeeds.map((need) => need.id)),
    ),
  };
}
