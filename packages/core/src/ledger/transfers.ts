import type { Account } from '../config/schema';
import type { Decision } from '../decisions/load';
import { addDays, diffDays } from '../model/dates';
import { hashText } from '../model/hash';
import type { CurrencyCode, IsoDate } from '../model/types';
import type { Part, Transaction, Transfer } from './types';

export interface MatchContext {
  accounts: Account[];
  windowDays: number;
  fees: Record<CurrencyCode, number[]>;
  youNames: string[];
  coverage: Record<string, { firstKnown?: IsoDate; lastCovered?: IsoDate }>;
  decisions: Decision[];
}

interface Candidate {
  out: Transaction;
  in: Transaction;
  outIndex: number;
  inIndex: number;
  score: number;
  rule: 'reference' | 'exact' | 'fee';
  fee: number;
}

const transferPart = (amount: number): Part => ({ kind: 'transfer', category: '', amount });

function linkTransfer(
  out: Transaction | undefined,
  incoming: Transaction | undefined,
  fields: Omit<Transfer, 'id' | 'out' | 'in'> & { id?: string },
): Transfer {
  const transfer: Transfer = {
    id: fields.id ?? hashText(`t|${out?.id ?? ''}|${incoming?.id ?? ''}|${fields.to}`),
    from: fields.from,
    to: fields.to,
    date: fields.date,
    amountOut: fields.amountOut,
    currencyOut: fields.currencyOut,
    fee: fields.fee,
    rule: fields.rule,
    status: fields.status,
  };
  if (out) transfer.out = out.id;
  if (incoming) transfer.in = incoming.id;
  if (fields.amountIn !== undefined) transfer.amountIn = fields.amountIn;
  if (fields.currencyIn !== undefined) transfer.currencyIn = fields.currencyIn;
  return transfer;
}

function settleOut(
  row: Transaction,
  fee: number,
  transfer: Transfer,
  decidedBy: Transaction['decidedBy'],
): Transaction {
  const parts: Part[] =
    fee > 0
      ? [transferPart(row.amount + fee), { kind: 'spending', category: 'Fees', amount: -fee }]
      : [transferPart(row.amount)];
  const settled: Transaction = {
    ...row,
    kind: 'transfer',
    category: '',
    decidedBy,
    parts,
    transfer: transfer.id,
  };
  delete settled.flag;
  return settled;
}

function settleIn(
  row: Transaction,
  transfer: Transfer,
  decidedBy: Transaction['decidedBy'],
): Transaction {
  const settled: Transaction = {
    ...row,
    kind: 'transfer',
    category: '',
    decidedBy,
    parts: [transferPart(row.amount)],
    transfer: transfer.id,
  };
  delete settled.flag;
  return settled;
}

function pairFee(out: Transaction, incoming: Transaction): number {
  if (out.currency !== incoming.currency) return 0;
  return Math.max(0, -out.amount - incoming.amount);
}

export function applyPairAnswers(
  txns: Transaction[],
  decisions: Decision[],
): { txns: Transaction[]; transfers: Transfer[] } {
  const rows = new Map(txns.map((row) => [row.id, row]));
  const transfers: Transfer[] = [];
  const used = new Set<string>();
  for (const decision of decisions) {
    if (decision.type !== 'pair') continue;
    const out = rows.get(decision.out);
    const incoming = rows.get(decision.in);
    if (!out || !incoming || used.has(out.id) || used.has(incoming.id)) continue;
    const fee = pairFee(out, incoming);
    const transfer = linkTransfer(out, incoming, {
      from: out.account,
      to: incoming.account,
      date: out.date,
      amountOut: -out.amount,
      currencyOut: out.currency,
      amountIn: incoming.amount,
      currencyIn: incoming.currency,
      fee,
      rule: 'answer',
      status: 'confirmed',
    });
    rows.set(out.id, settleOut(out, fee, transfer, 'answer'));
    rows.set(incoming.id, settleIn(incoming, transfer, 'answer'));
    used.add(out.id);
    used.add(incoming.id);
    transfers.push(transfer);
  }
  return { txns: txns.map((row) => rows.get(row.id) ?? row), transfers };
}

function hinted(row: Transaction): boolean {
  return row.tags.includes('transfer-hint') || row.tags.includes('card-payment');
}

function named(row: Transaction, youNames: string[]): boolean {
  const text = row.description.toLowerCase();
  return youNames.some((name) => name.trim() !== '' && text.includes(name.toLowerCase()));
}

function hasHint(row: Transaction, youNames: string[]): boolean {
  return hinted(row) || named(row, youNames);
}

function scorePair(
  out: Transaction,
  incoming: Transaction,
  ctx: MatchContext,
): Candidate | undefined {
  const days = diffDays(out.date, incoming.date);
  if (Math.abs(days) > ctx.windowDays) return undefined;
  const sameReference = out.reference !== undefined && out.reference === incoming.reference;
  let rule: Candidate['rule'];
  let fee = 0;
  let score = 0;
  if (out.currency !== incoming.currency) {
    if (!sameReference) return undefined;
    rule = 'reference';
  } else {
    const difference = -out.amount - incoming.amount;
    if (difference === 0) {
      rule = 'exact';
      score += 100;
    } else if (difference > 0 && (ctx.fees[out.currency] ?? []).includes(difference)) {
      rule = 'fee';
      fee = difference;
      score += 50;
    } else {
      return undefined;
    }
    if (sameReference) rule = 'reference';
  }
  if (sameReference) score += 1000;
  score -= 10 * Math.abs(days);
  if (days >= 0) score += 5;
  if (hinted(out) || hinted(incoming)) score += 3;
  if (named(out, ctx.youNames) || named(incoming, ctx.youNames)) score += 3;
  return { out, in: incoming, outIndex: 0, inIndex: 0, score, rule, fee };
}

function interchangeable(group: Candidate[]): boolean {
  const same = (a: Transaction, b: Transaction) =>
    a.account === b.account && a.date === b.date && a.amount === b.amount;
  const [first] = group;
  if (!first) return false;
  return group.every((candidate) => same(candidate.out, first.out) && same(candidate.in, first.in));
}

function choosePairs(candidates: Candidate[]): { accepted: Candidate[]; ambiguous: Set<string> } {
  const accepted: Candidate[] = [];
  const ambiguous = new Set<string>();
  const taken = new Set<string>();
  const free = (candidate: Candidate) =>
    !taken.has(candidate.out.id) &&
    !taken.has(candidate.in.id) &&
    !ambiguous.has(candidate.out.id) &&
    !ambiguous.has(candidate.in.id);
  const shares = (a: Candidate, b: Candidate) => a.out.id === b.out.id || a.in.id === b.in.id;
  const byScore = (a: Candidate, b: Candidate) =>
    b.score - a.score || a.outIndex - b.outIndex || a.inIndex - b.inIndex;

  const decideFrom = (pool: Candidate[]) => {
    const [best] = pool;
    if (!best) return false;
    const rivals = pool.filter(
      (other) => other !== best && other.score === best.score && shares(other, best),
    );
    if (rivals.length === 0 || interchangeable([best, ...rivals])) {
      accepted.push(best);
      taken.add(best.out.id);
      taken.add(best.in.id);
    } else {
      for (const candidate of [best, ...rivals]) {
        ambiguous.add(candidate.out.id);
        ambiguous.add(candidate.in.id);
      }
    }
    return true;
  };

  for (;;) {
    const live = candidates.filter(free).sort(byScore);
    if (live.length === 0) break;
    const counts = new Map<string, number>();
    for (const candidate of live) {
      counts.set(candidate.out.id, (counts.get(candidate.out.id) ?? 0) + 1);
      counts.set(candidate.in.id, (counts.get(candidate.in.id) ?? 0) + 1);
    }
    const forced = live.filter(
      (candidate) => counts.get(candidate.out.id) === 1 || counts.get(candidate.in.id) === 1,
    );
    decideFrom(forced.length > 0 ? forced : live);
  }
  return { accepted, ambiguous };
}

function cardFor(row: Transaction, accounts: Account[]): Account | undefined {
  const cards = accounts.filter((account) => account.type === 'credit-card');
  if (cards.length === 1) return cards[0];
  const bank = accounts.find((account) => account.id === row.account)?.bank;
  const atBank = cards.filter((account) => account.bank === bank);
  return atBank.length === 1 ? atBank[0] : undefined;
}

function covers(coverage: MatchContext['coverage'][string] | undefined, date: IsoDate): boolean {
  return (
    coverage?.firstKnown !== undefined &&
    coverage.lastCovered !== undefined &&
    date >= coverage.firstKnown &&
    date <= coverage.lastCovered
  );
}

export function matchTransfers(
  txns: Transaction[],
  ctx: MatchContext,
): { txns: Transaction[]; transfers: Transfer[] } {
  const accounts = new Map(ctx.accounts.map((account) => [account.id, account]));
  const blocked = new Set<string>();
  const blockedPairs = new Set<string>();
  for (const decision of ctx.decisions) {
    if (decision.type !== 'not-transfer') continue;
    if (decision.with) {
      blockedPairs.add(`${decision.txn}|${decision.with}`);
      blockedPairs.add(`${decision.with}|${decision.txn}`);
    } else {
      blocked.add(decision.txn);
    }
  }
  const open = (row: Transaction) =>
    row.decidedBy === undefined &&
    row.amount !== 0 &&
    !row.tags.includes('purchase') &&
    !blocked.has(row.id) &&
    accounts.has(row.account);

  const indexed = txns.map((row, index) => ({ row, index }));
  const outs = indexed.filter(
    ({ row }) => open(row) && row.amount < 0 && accounts.get(row.account)?.type !== 'credit-card',
  );
  const ins = indexed.filter(({ row }) => open(row) && row.amount > 0);
  const candidates: Candidate[] = [];
  for (const out of outs) {
    for (const incoming of ins) {
      if (out.row.account === incoming.row.account) continue;
      if (blockedPairs.has(`${out.row.id}|${incoming.row.id}`)) continue;
      const scored = scorePair(out.row, incoming.row, ctx);
      if (scored) candidates.push({ ...scored, outIndex: out.index, inIndex: incoming.index });
    }
  }

  const rows = new Map(txns.map((row) => [row.id, row]));
  const transfers: Transfer[] = [];
  const { accepted, ambiguous } = choosePairs(candidates);
  for (const pair of accepted) {
    const transfer = linkTransfer(pair.out, pair.in, {
      from: pair.out.account,
      to: pair.in.account,
      date: pair.out.date,
      amountOut: -pair.out.amount,
      currencyOut: pair.out.currency,
      amountIn: pair.in.amount,
      currencyIn: pair.in.currency,
      fee: pair.fee,
      rule: pair.rule,
      status: 'matched',
    });
    rows.set(pair.out.id, settleOut(pair.out, pair.fee, transfer, 'match'));
    rows.set(pair.in.id, settleIn(pair.in, transfer, 'match'));
    transfers.push(transfer);
  }
  for (const id of ambiguous) {
    const row = rows.get(id);
    if (row) rows.set(id, { ...row, flag: 'ambiguous' });
  }

  const counterparties = ctx.decisions.filter(
    (decision): decision is Extract<Decision, { type: 'counterparty' }> =>
      decision.type === 'counterparty',
  );
  for (const [id, row] of rows) {
    if (row.decidedBy !== undefined || row.flag === 'ambiguous' || !open(row)) continue;
    const text = row.description.toLowerCase();
    const answer = counterparties.find((decision) => text.includes(decision.text.toLowerCase()));
    if (answer && !answer.mine) continue;
    let target: Account | undefined;
    let rule: Transfer['rule'] | undefined;
    if (answer?.mine && answer.account) {
      target = accounts.get(answer.account);
      rule = 'counterparty';
    } else if (row.tags.includes('card-payment') && row.amount < 0) {
      const card = cardFor(row, ctx.accounts);
      if (card && !covers(ctx.coverage[card.id], row.date)) {
        target = card;
        rule = 'wording';
      }
    }
    if (target && rule && target.id !== row.account) {
      const outgoing = row.amount < 0;
      const transfer = linkTransfer(outgoing ? row : undefined, outgoing ? undefined : row, {
        from: outgoing ? row.account : target.id,
        to: outgoing ? target.id : row.account,
        date: row.date,
        amountOut: Math.abs(row.amount),
        currencyOut: row.currency,
        fee: 0,
        rule,
        status: 'one-sided',
      });
      rows.set(
        id,
        outgoing ? settleOut(row, 0, transfer, 'match') : settleIn(row, transfer, 'match'),
      );
      transfers.push(transfer);
      continue;
    }
    if (!hasHint(row, ctx.youNames)) continue;
    const reach = addDays(row.date, ctx.windowDays);
    const waiting = ctx.accounts.some((account) => {
      if (account.id === row.account || account.closed) return false;
      const lastCovered = ctx.coverage[account.id]?.lastCovered;
      return lastCovered !== undefined && lastCovered < reach;
    });
    rows.set(id, { ...row, flag: waiting ? 'waiting' : 'possible' });
  }

  return { txns: txns.map((row) => rows.get(row.id) ?? row), transfers };
}
