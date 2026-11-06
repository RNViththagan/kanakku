import { parseDmy, parseMdyShort } from '../../model/dates';
import { normalizeAmount } from '../../model/money';
import { parseCsv } from '../../parse/csv';
import { signedAmount } from '../amounts';
import type { FileInput, ParsedRow, ParsedStatement } from '../types';

const REQUIRED = ['Transaction Date', 'Description', 'Currency', 'Debit', 'Credit'];
const BALANCE = 'Running Balance';
const GENERATED = 'Generated at';

interface Layout {
  rows: string[][];
  titled: boolean;
  bankNamed: boolean;
  header?: { index: number; columns: Map<string, number> };
}

function readLayout(text: string): Layout {
  const rows = parseCsv(text);
  const titled = rows
    .slice(0, 5)
    .some((cells) => cells.some((cell) => cell.trim() === 'Transaction History'));
  const bankNamed = rows.some((cells) =>
    cells.some((cell) => cell.includes('Commercial Bank of Ceylon')),
  );
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const names = (rows[index] ?? []).map((cell) => cell.trim());
    if (REQUIRED.every((name) => names.includes(name))) {
      const columns = new Map<string, number>();
      names.forEach((name, position) => {
        if (name !== '' && !columns.has(name)) columns.set(name, position);
      });
      return { rows, titled, bankNamed, header: { index, columns } };
    }
  }
  return { rows, titled, bankNamed };
}

export function scoreTable(file: FileInput, withBalance: boolean): number | null {
  const layout = readLayout(file.text);
  if (!layout.titled || !layout.header) return null;
  if (layout.header.columns.has(BALANCE) !== withBalance) return null;
  return layout.bankNamed ? 0.95 : 0.9;
}

function generatedAt(rows: string[][]): string | undefined {
  for (const cells of rows) {
    const cell = cells.map((value) => value.trim()).find((value) => value.startsWith(GENERATED));
    if (cell !== undefined)
      return parseMdyShort(cell.slice(GENERATED.length).trim().split(/\s+/)[0] ?? '');
  }
  return undefined;
}

export function parseTable(file: FileInput, withBalance: boolean): ParsedStatement {
  const layout = readLayout(file.text);
  const statement: ParsedStatement = { account: {}, rows: [], issues: [] };
  const generated = generatedAt(layout.rows);
  if (generated) statement.generatedAt = generated;
  if (!layout.header) {
    statement.issues.push({
      level: 'error',
      code: 'no-table',
      message: 'No transaction table found',
      file: file.path,
    });
    return statement;
  }
  const { columns, index: headerIndex } = layout.header;
  for (let index = headerIndex + 1; index < layout.rows.length; index += 1) {
    const cells = layout.rows[index] ?? [];
    if (cells.every((cell) => cell.trim() === '')) break;
    if (cells.some((cell) => cell.trim().startsWith(GENERATED))) break;
    const cell = (name: string) => cells[columns.get(name) ?? -1] ?? '';
    const line = index + 1;
    const date = parseDmy(cell('Transaction Date'));
    const amount = signedAmount(cell('Credit'), cell('Debit'));
    if (!date || amount === undefined) {
      statement.issues.push({
        level: 'warning',
        code: 'bad-row',
        message: `Line ${line} could not be read`,
        file: file.path,
        line,
      });
      continue;
    }
    const row: ParsedRow = {
      line,
      date,
      description: cell('Description').trim(),
      amount,
      raw: cells,
    };
    if (withBalance) {
      const balance = normalizeAmount(cell(BALANCE));
      if (balance !== undefined) row.balance = balance;
    }
    statement.rows.push(row);
    const currency = cell('Currency').trim();
    if (currency && !statement.account.currency) statement.account.currency = currency;
  }
  return statement;
}
