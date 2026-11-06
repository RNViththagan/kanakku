import {
  type Account,
  addMonths,
  balanceOn,
  type Config,
  cashFlowByMonth,
  type FileInput,
  findBank,
  formatAmount,
  type Ledger,
  netWorthSeries,
  planTidy,
  rateBookFor,
} from '@kanakku/core';

export function renderReport(
  ledger: Ledger,
  input: { config: Config; dataFolder: string; files: FileInput[] },
): string {
  const { config } = input;
  const today = ledger.today;
  const home = config.homeCurrency;
  const money = (minor: number, currency = home) => formatAmount(minor, currency, config.locale);
  const nameOf = (id: string) => ledger.accounts.find((account) => account.id === id)?.name ?? id;
  const lines: string[] = [`Kanakku report for ${input.dataFolder} on ${today}`, ''];

  lines.push('Accounts');
  for (const bankId of new Set(ledger.accounts.map((account) => account.bank))) {
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

  const start = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), -11);
  const from = `${start.year}-${String(start.month).padStart(2, '0')}-01`;
  const tracked = ledger.accounts.filter((account) => account.type !== 'fixed-deposit').length;
  lines.push('', `Net worth at month end (${home})`);
  for (const point of netWorthSeries(ledger, { from, to: today, step: 'month' })) {
    if (point.unknown.length === tracked) continue;
    const gaps =
      point.unknown.length > 0 ? `  not yet known: ${point.unknown.map(nameOf).join(', ')}` : '';
    const unvalued = point.unvalued.length > 0 ? `  no rate: ${point.unvalued.join(', ')}` : '';
    lines.push(`  ${point.date}  ${money(point.total).padStart(16)}${gaps}${unvalued}`);
  }

  lines.push('', `Cash flow (${home})`);
  for (const row of cashFlowByMonth(ledger, { from, to: today })) {
    if (row.income === 0 && row.spending === 0) continue;
    lines.push(
      `  ${row.month}  in ${money(row.income).padStart(14)}  out ${money(row.spending).padStart(14)}  net ${money(row.net).padStart(14)}`,
    );
  }

  const byStatus = new Map<string, number>();
  for (const transfer of ledger.transfers)
    byStatus.set(transfer.status, (byStatus.get(transfer.status) ?? 0) + 1);
  const counts = [...byStatus].map(([status, count]) => `${status} ${count}`).join(', ');
  lines.push('', `Transfers: ${ledger.transfers.length}${counts ? ` (${counts})` : ''}`);
  for (const transfer of [...ledger.transfers].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )) {
    const arrived =
      transfer.amountIn !== undefined && transfer.currencyIn !== undefined
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
  const rates = rateBookFor(ledger);
  for (const currency of new Set(ledger.accounts.map((account) => account.currency))) {
    if (currency === home) continue;
    const rate = rates.rateOn(currency, today);
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
    existing: new Set(input.files.map((file) => file.path)),
  });
  for (const proposal of proposals) {
    lines.push(
      `  ${proposal.action} ${proposal.file}${proposal.to ? ` -> ${proposal.to}` : ''}  (${proposal.reason})`,
    );
  }
  if (proposals.length === 0) lines.push('  nothing to do');
  return lines.join('\n');
}
