import type { DateRange, Ledger, TidyProposal } from '@kanakku/core';
import type { Status } from '../api';
import type { Route } from '../routes';

export interface PageProps {
  ledger: Ledger;
  status: Status;
  tidy: TidyProposal[];
  route: Route;
  range: DateRange;
  rangeLabel: string;
}
