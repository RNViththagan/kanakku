import type { ComponentType } from 'react';
import type { PageId } from '../routes';
import { Account } from './Account';
import { Accounts } from './Accounts';
import { CashFlow } from './CashFlow';
import { Conversions } from './Conversions';
import { Needs } from './Needs';
import { NetWorth } from './NetWorth';
import { Overview } from './Overview';
import { Spending } from './Spending';
import { Statements } from './Statements';
import { Transactions } from './Transactions';
import { Transfers } from './Transfers';
import type { PageProps } from './types';

export const PAGE_TITLES: Record<PageId, string> = {
  overview: 'Overview',
  'net-worth': 'Net worth',
  'cash-flow': 'Cash flow',
  spending: 'Spending',
  transfers: 'Transfers',
  conversions: 'Conversions',
  accounts: 'Accounts',
  account: 'Account',
  transactions: 'Transactions',
  statements: 'Statements',
  needs: 'Needs you',
};

export const PAGES: Record<PageId, ComponentType<PageProps>> = {
  overview: Overview,
  'net-worth': NetWorth,
  'cash-flow': CashFlow,
  spending: Spending,
  transfers: Transfers,
  conversions: Conversions,
  accounts: Accounts,
  account: Account,
  transactions: Transactions,
  statements: Statements,
  needs: Needs,
};
