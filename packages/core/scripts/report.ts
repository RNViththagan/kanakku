import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type Account,
  addMonths,
  buildLedger,
  cashFlowByMonth,
  type FileInput,
  findBank,
  formatAmount,
  type Ledger,
  loadConfig,
  loadDecisions,
  netWorthSeries,
  parseRatesCsv,
  planTidy,
  type RateQuote,
  rateBookFor,
} from '../src';
import { balanceOn } from '../src/views/balances';

const { values } = parseArgs({
  options: { data: { type: 'string' }, today: { type: 'string' } },
});
if (!values.data) {
  console.error('Usage: pnpm --filter @kanakku/core report --data <folder> [--today YYYY-MM-DD]');
  process.exit(2);
}
const dataFolder = values.data;
const today = values.today ?? new Date().toISOString().slice(0, 10);

const configPath = join(dataFolder, 'kanakku', 'config.yaml');
const { config, errors } = loadConfig(readFileSync(configPath, 'utf8'));
if (!config) {
  for (const error of errors)
    console.error(`config.yaml line ${error.line ?? '?'}: ${error.path} ${error.message}`);
  process.exit(1);
}

const decisionsPath = join(dataFolder, 'kanakku', 'decisions.yaml');
const decisions = existsSync(decisionsPath)
  ? loadDecisions(readFileSync(decisionsPath, 'utf8')).decisions
  : [];

const ratesFolder = join(dataFolder, 'kanakku', 'rates');
const rates: RateQuote[] = existsSync(ratesFolder)
  ? readdirSync(ratesFolder)
      .filter((name) => name.endsWith('.csv'))
      .flatMap((name) =>
        parseRatesCsv(readFileSync(join(ratesFolder, name), 'utf8'), basename(name, '.csv')),
      )
  : [];

function walk(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

const files: FileInput[] = config.folders.flatMap((folder) => {
  const root = isAbsolute(folder.path) ? folder.path : join(dataFolder, folder.path);
  return walk(root).map((path) => ({
    path: relative(dataFolder, path),
    name: basename(path),
    text: readFileSync(path, 'utf8'),
    folderBank: folder.bank,
  }));
});

const ledger: Ledger = buildLedger({ files, config, decisions, rates, today });
const home = config.homeCurrency;
const money = (minor: number, currency = home) => formatAmount(minor, currency, config.locale);
const nameOf = (id: string) => ledger.accounts.find((account) => account.id === id)?.name ?? id;
const lines: string[] = [`Kanakku report for ${dataFolder} on ${today}`, ''];

lines.push('Accounts');
const banks = [...new Set(ledger.accounts.map((account) => account.bank))];
for (const bankId of banks) {
  lines.push(`  ${findBank(bankId)?.name ?? bankId}`);
  for (const account of ledger.accounts.filter((item: Account) => item.bank === bankId)) {
    const coverage = ledger.coverage[account.id];
    const balance = balanceOn(ledger, account.id, coverage?.lastCovered ?? today);
    const shown =
      balance === undefined
        ? 'no statements'
        : `${money(balance, account.currency)} ${account.currency}`;
    const covered =
      coverage?.segments
        .map((segment) => `${segment.state} ${segment.from}..${segment.to}`)
        .join(', ') ?? '';
    const behind = coverage?.behindDays ? `, ${coverage.behindDays} days behind` : '';
    lines.push(
      `    ${account.name.padEnd(24)} ${account.type.padEnd(13)} ${shown.padStart(20)}  [${covered}${behind}]`,
    );
  }
}

const year = Number(today.slice(0, 4));
const month = Number(today.slice(5, 7));
const start = addMonths(year, month, -11);
const from = `${start.year}-${String(start.month).padStart(2, '0')}-01`;
lines.push('', `Net worth at month end (${home})`);
for (const point of netWorthSeries(ledger, { from, to: today, step: 'month' })) {
  if (
    point.unknown.length ===
    ledger.accounts.filter((account) => account.type !== 'fixed-deposit').length
  )
    continue;
  const gaps =
    point.unknown.length > 0 ? `  not yet known: ${point.unknown.map(nameOf).join(', ')}` : '';
  const unvalued = point.unvalued.length > 0 ? `  no rate: ${point.unvalued.join(', ')}` : '';
  lines.push(`  ${point.date}  ${money(point.total).padStart(16)}${gaps}${unvalued}`);
}

lines.push('', `Cash flow (${home})`);
for (const row of cashFlowByMonth(ledger, { from, to: today })) {
  lines.push(
    `  ${row.month}  in ${money(row.income).padStart(14)}  out ${money(row.spending).padStart(14)}  net ${money(row.net).padStart(14)}`,
  );
}

const byStatus = new Map<string, number>();
for (const transfer of ledger.transfers)
  byStatus.set(transfer.status, (byStatus.get(transfer.status) ?? 0) + 1);
lines.push(
  '',
  `Transfers: ${ledger.transfers.length} (${[...byStatus].map(([status, count]) => `${status} ${count}`).join(', ')})`,
);
for (const transfer of [...ledger.transfers].sort((a, b) => (a.date < b.date ? -1 : 1))) {
  const arrived =
    transfer.amountIn !== undefined
      ? ` -> ${money(transfer.amountIn, transfer.currencyIn)} ${transfer.currencyIn}`
      : '';
  const fee = transfer.fee > 0 ? `  fee ${money(transfer.fee, transfer.currencyOut)}` : '';
  lines.push(
    `  ${transfer.date}  ${nameOf(transfer.from)} -> ${nameOf(transfer.to)}  ${money(transfer.amountOut, transfer.currencyOut)} ${transfer.currencyOut}${arrived}${fee}  [${transfer.rule}, ${transfer.status}]`,
  );
}

lines.push('', 'Conversions');
for (const conversion of ledger.conversions) {
  lines.push(
    `  ${conversion.date}  ${money(conversion.amountOut, conversion.currencyOut)} ${conversion.currencyOut} -> ${money(conversion.amountIn, conversion.currencyIn)} ${conversion.currencyIn}  rate ${(conversion.micro / 1_000_000).toFixed(6)}`,
  );
}
const rateBook = rateBookFor(ledger);
for (const currency of new Set(ledger.accounts.map((account) => account.currency))) {
  if (currency === home) continue;
  const rate = rateBook.rateOn(currency, today);
  lines.push(
    `  ${currency} today: ${rate ? `${(rate.micro / 1_000_000).toFixed(6)} from ${rate.source} on ${rate.date}` : 'no rate'}`,
  );
}

lines.push('', 'Cards');
for (const [cardId, cycles] of Object.entries(ledger.cards)) {
  for (const cycle of cycles) {
    lines.push(
      `  ${nameOf(cardId)}  ${cycle.from}..${cycle.to}  billed ${money(cycle.billed)}  paid ${money(cycle.paid)}  due ${cycle.dueDate}  ${cycle.status} (${cycle.coverage})`,
    );
  }
}

lines.push('', `Needs you (${ledger.needs.length})`);
for (const need of ledger.needs) lines.push(`  [${need.severity}] ${need.type}: ${need.message}`);

lines.push('', 'Tidy-up suggestions');
const proposals = planTidy({
  ledger,
  folders: config.folders,
  existing: new Set(files.map((file) => file.path)),
});
for (const proposal of proposals)
  lines.push(
    `  ${proposal.action} ${proposal.file}${proposal.to ? ` -> ${proposal.to}` : ''}  (${proposal.reason})`,
  );
if (proposals.length === 0) lines.push('  nothing to do');

console.log(lines.join('\n'));
