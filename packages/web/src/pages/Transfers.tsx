import {
  Box,
  Chip,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo, useState } from 'react';
import { money, shortDate } from '../format';
import {
  type TransferStatus,
  type TransferTab,
  transferPairs,
  transferRows,
  transfersOnTab,
} from '../tables';
import { Amount, Empty, Section, Title } from '../ui';
import type { PageProps } from './types';

const TABS: Array<{ id: TransferTab; label: string; empty: string }> = [
  { id: 'needs', label: 'Needs you', empty: 'No transfers need you.' },
  { id: 'waiting', label: 'Waiting', empty: 'No transfers are waiting for the other statement.' },
  { id: 'all', label: 'All', empty: 'No transfers in this range.' },
  { id: 'deposits', label: 'Fixed deposits', empty: 'No fixed deposit transfers in this range.' },
];

const STATUS: Record<
  TransferStatus,
  { label: string; color: 'success' | 'info' | 'warning' | 'default' }
> = {
  matched: { label: 'Matched', color: 'success' },
  confirmed: { label: 'Confirmed', color: 'success' },
  'one-sided': { label: 'One side', color: 'info' },
  waiting: { label: 'Waiting', color: 'default' },
  possible: { label: 'No match', color: 'warning' },
  ambiguous: { label: 'Several matches', color: 'warning' },
};

export function Transfers({ ledger, range, rangeLabel }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const pairs = useMemo(() => transferPairs(ledger, range), [ledger, range]);
  const rows = useMemo(() => transferRows(ledger, range), [ledger, range]);
  const counts = Object.fromEntries(
    TABS.map((tab) => [tab.id, transfersOnTab(rows, tab.id).length]),
  );
  const [tab, setTab] = useState<TransferTab>(counts.needs ? 'needs' : 'all');
  const shown = transfersOnTab(rows, tab);

  return (
    <>
      <Title title="Transfers" subtitle={`${rangeLabel}, money moved between your own accounts`} />
      <Section title="From and to">
        {pairs.length === 0 ? (
          <Empty>No transfers in this range.</Empty>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell align="right">Transfers</TableCell>
                <TableCell align="right">{`Amount (${home})`}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pairs.map((pair) => (
                <TableRow key={`${pair.from}|${pair.to}`}>
                  <TableCell>{pair.fromName}</TableCell>
                  <TableCell>{pair.toName}</TableCell>
                  <TableCell align="right">{pair.count}</TableCell>
                  <TableCell align="right">
                    <Amount minor={pair.amount} currency={home} locale={locale} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Transfer list">
        <Tabs value={tab} onChange={(_event, value: TransferTab) => setTab(value)} sx={{ mb: 2 }}>
          {TABS.map((item) => (
            <Tab key={item.id} value={item.id} label={`${item.label} (${counts[item.id] ?? 0})`} />
          ))}
        </Tabs>
        {shown.length === 0 ? (
          <Empty>{TABS.find((item) => item.id === tab)?.empty}</Empty>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Fee</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {shortDate(row.date, locale)}
                    </TableCell>
                    <TableCell>{row.fromName}</TableCell>
                    <TableCell>{row.toName}</TableCell>
                    <TableCell align="right">
                      {money(row.amount, row.currency, locale)}
                      {row.amountIn !== undefined &&
                      row.currencyIn &&
                      row.currencyIn !== row.currency ? (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {`arrived as ${money(row.amountIn, row.currencyIn, locale)}`}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell align="right">
                      {row.fee > 0 ? money(row.fee, row.currency, locale) : ''}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={STATUS[row.status].label}
                        color={STATUS[row.status].color}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Section>
    </>
  );
}
