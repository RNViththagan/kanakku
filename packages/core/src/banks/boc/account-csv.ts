import { parseDmyDash, parseYmd } from '../../model/dates';
import { normalizeAmount } from '../../model/money';
import { parseCsv, stripBom } from '../../parse/csv';
import { signedAmount } from '../amounts';
import type { FileInput, ParsedRow, ParsedStatement, StatementFormat } from '../types';

const TITLE = 'BANK OF CEYLON - ACCOUNT STATEMENT';

function firstLine(text: string): string {
  const line = stripBom(text)
    .split(/\r?\n|\r/)
    .find((candidate) => candidate.trim() !== '');
  return line?.trim() ?? '';
}

function readHeader(cells: string[], statement: ParsedStatement): void {
  const key = cells[0]?.trim() ?? '';
  const value = cells[1]?.trim() ?? '';
  const checks = (statement.checks ??= {});
  if (key === 'Account Number') statement.account.number = value;
  if (key === 'Currency') statement.account.currency = value;
  if (key === 'Generated On') {
    const generated = parseDmyDash(value.split(/\s+/)[0] ?? '');
    if (generated) statement.generatedAt = generated;
  }
  if (key === 'Statement Period') {
    const match = /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/.exec(value);
    const from = parseYmd(match?.[1] ?? '');
    const to = parseYmd(match?.[2] ?? '');
    if (from && to) statement.period = { from, to };
  }
  if (key === 'Total Credits' || key === 'Total Debits') {
    const amount = normalizeAmount(value);
    const count = Number.parseInt(cells[2] ?? '', 10);
    if (key === 'Total Credits') {
      if (amount !== undefined) checks.credits = amount;
      if (Number.isInteger(count)) checks.creditCount = count;
    } else {
      if (amount !== undefined) checks.debits = amount;
      if (Number.isInteger(count)) checks.debitCount = count;
    }
  }
}

function readRow(
  cells: string[],
  columns: Map<string, number>,
  line: number,
): ParsedRow | undefined {
  const cell = (name: string) => cells[columns.get(name) ?? -1] ?? '';
  const date = parseYmd(cell('Date'));
  const amount = signedAmount(cell('Credit Amount'), cell('Debit Amount'));
  if (!date || amount === undefined) return undefined;
  const row: ParsedRow = {
    line,
    date,
    description: cell('Description').trim(),
    amount,
    raw: cells,
  };
  const balance = normalizeAmount(cell('Running Balance'));
  if (balance !== undefined) row.balance = balance;
  const cheque = cell('Cheque Number').trim();
  if (/[1-9]/.test(cheque)) row.reference = cheque;
  return row;
}

function parse(file: FileInput): ParsedStatement {
  const statement: ParsedStatement = { account: {}, rows: [], issues: [] };
  let columns: Map<string, number> | undefined;
  parseCsv(file.text).forEach((cells, index) => {
    const line = index + 1;
    if (!columns) {
      if (cells[0]?.trim() === 'Date' && cells[1]?.trim() === 'Description') {
        columns = new Map(cells.map((name, position) => [name.trim(), position]));
      } else {
        readHeader(cells, statement);
      }
      return;
    }
    if (cells.every((value) => value.trim() === '')) return;
    const row = readRow(cells, columns, line);
    if (row) statement.rows.push(row);
    else {
      statement.issues.push({
        level: 'warning',
        code: 'bad-row',
        message: `Line ${line} could not be read`,
        file: file.path,
        line,
      });
    }
  });
  if (statement.checks && Object.keys(statement.checks).length === 0) delete statement.checks;
  if (!columns) {
    statement.issues.push({
      level: 'error',
      code: 'no-table',
      message: 'No transaction table found',
      file: file.path,
    });
  }
  return statement;
}

export const bocAccountCsv: StatementFormat = {
  id: 'boc-account-csv',
  fileTypes: ['.csv'],
  accountTypes: ['savings', 'current'],
  detect: (file) => (firstLine(file.text) === TITLE ? 0.95 : null),
  parse,
};
