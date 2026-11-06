import type { StatementFormat } from '../types';
import { parseTable, scoreTable } from './table';

const REFERENCE = /\/\s*(\d{12})\s*\//;

export const combankCardCsv: StatementFormat = {
  id: 'combank-card-csv',
  fileTypes: ['.csv'],
  accountTypes: ['credit-card'],
  detect: (file) => scoreTable(file, false),
  parse: (file) => {
    const statement = parseTable(file, false);
    statement.account.type = 'credit-card';
    for (const row of statement.rows) {
      const reference = REFERENCE.exec(row.description)?.[1];
      if (reference) row.reference = reference;
    }
    return statement;
  },
};
