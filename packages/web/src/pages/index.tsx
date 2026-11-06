import { PageTitle } from '@wso2/oxygen-ui';
import type { ComponentType } from 'react';
import type { PageId } from '../routes';
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

function Pending({ route }: PageProps) {
  return (
    <PageTitle>
      <PageTitle.Header>{PAGE_TITLES[route.page]}</PageTitle.Header>
    </PageTitle>
  );
}

export const PAGES: Record<PageId, ComponentType<PageProps>> = {
  overview: Pending,
  'net-worth': Pending,
  'cash-flow': Pending,
  spending: Pending,
  transfers: Pending,
  conversions: Pending,
  accounts: Pending,
  account: Pending,
  transactions: Pending,
  statements: Pending,
  needs: Pending,
};
