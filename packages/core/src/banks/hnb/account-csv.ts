import { parseDmy, startOfMonth } from '../../model/dates';
import { normalizeAmount } from '../../model/money';
import { parseCsv } from '../../parse/csv';
import { signedAmount } from '../amounts';
import type { FileInput, ParsedRow, ParsedStatement, StatementFormat } from '../types';

const HEADER = ['Date', 'Ref.No', 'Particulars', 'Debits', 'Credits', 'Balance'];
const CLOSING = 'BALANCE AS AT DATE';
const MASKED = /^(\d+X+\d+):Int\.Pd:/i;

function contentRows(text: string): string[][] {
  return parseCsv(text).filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function isHeader(cells: string[] | undefined): boolean {
  return (
    cells !== undefined &&
    cells.length === HEADER.length &&
    cells.every((cell, index) => cell.trim() === HEADER[index])
  );
}

function detect(file: FileInput): number | null {
  const rows = contentRows(file.text);
  if (!isHeader(rows[0])) return null;
  return rows.at(-1)?.[2]?.trim() === CLOSING ? 0.95 : 0.8;
}

function parse(file: FileInput): ParsedStatement {
  const statement: ParsedStatement = { account: {}, rows: [], issues: [] };
  const table = parseCsv(file.text);
  const headerIndex = table.findIndex((cells) => isHeader(cells));
  if (headerIndex < 0) {
    statement.issues.push({
      level: 'error',
      code: 'no-table',
      message: 'No transaction table found',
      file: file.path,
    });
    return statement;
  }
  for (let index = headerIndex + 1; index < table.length; index += 1) {
    const cells = table[index] ?? [];
    if (cells.every((cell) => cell.trim() === '')) continue;
    const line = index + 1;
    const [
      dateCell = '',
      reference = '',
      particulars = '',
      debit = '',
      credit = '',
      balanceCell = '',
    ] = cells;
    const date = parseDmy(dateCell);
    const description = particulars.trim();
    const balance = normalizeAmount(balanceCell);
    if (description === CLOSING && date && balance !== undefined) {
      statement.closing = { date, balance };
      break;
    }
    const amount = signedAmount(credit, debit);
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
    const row: ParsedRow = { line, date, description, amount, raw: cells };
    if (balance !== undefined) row.balance = balance;
    if (reference.trim() !== '') row.reference = reference.trim();
    statement.rows.push(row);
    const masked = MASKED.exec(description)?.[1];
    if (masked && !statement.account.masked) statement.account.masked = masked;
    else if (masked && masked !== statement.account.masked) {
      statement.issues.push({
        level: 'warning',
        code: 'mixed-accounts',
        message: 'Rows name more than one account',
        file: file.path,
        line,
      });
    }
  }
  const closing = statement.closing;
  if (closing) {
    const from = startOfMonth(closing.date);
    if (statement.rows.every((row) => row.date >= from && row.date <= closing.date)) {
      statement.period = { from, to: closing.date, inferred: true };
    }
  }
  return statement;
}

export const hnbAccountCsv: StatementFormat = {
  id: 'hnb-account-csv',
  fileTypes: ['.csv'],
  accountTypes: ['savings', 'current'],
  detect,
  parse,
};
