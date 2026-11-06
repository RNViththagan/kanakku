import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { ChevronDown, ChevronRight, Search } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useMemo, useState } from 'react';
import { money, shortDate } from '../format';
import { hrefFor } from '../routes';
import {
  searchTransfers,
  type TransferRow,
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

const REASONS: Record<NonNullable<TransferRow['rule']>, string> = {
  reference: 'Paired because both sides carry the same bank reference.',
  exact: 'Paired because the same amount left one account and reached the other within days.',
  fee: 'Paired because the amounts differ by a known bank fee.',
  answer: 'Paired because you said so.',
  wording: 'Paired because the bank text says it is a card payment.',
  deposit: 'A fixed deposit being placed or paid back.',
  counterparty: 'Paired because the name in the bank text is one you marked as yours.',
};

const OPEN_REASONS: Partial<Record<TransferStatus, string>> = {
  possible: 'This looks like a transfer, but no matching line was found in your other accounts.',
  waiting: 'Waiting for the statement of the account at the other end.',
  ambiguous: 'More than one line in your other accounts could be the other side.',
};

function reasonOf(row: TransferRow): string {
  return row.rule ? REASONS[row.rule] : (OPEN_REASONS[row.status] ?? '');
}

function go(href: string): void {
  window.location.hash = href;
}

function Details({ row, locale }: { row: TransferRow; locale: string }) {
  return (
    <Stack spacing={1.5} sx={{ py: 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        {row.sides.map((side) => (
          <Box key={side.id} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" component="div">
              {side.amount < 0 ? 'Left ' : 'Arrived in '}
              <Link href={hrefFor({ page: 'account', param: side.accountId })}>
                {side.accountName}
              </Link>
              {` on ${shortDate(side.date, locale)}`}
            </Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {side.description}
            </Typography>
            <Typography variant="body2">
              <Amount minor={side.amount} currency={side.currency} locale={locale} />
            </Typography>
          </Box>
        ))}
        {row.sides.length < 2 ? (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              {row.deposit
                ? 'Deposits have no statement of their own, so Kanakku follows them from this line.'
                : 'No line from the other account yet.'}
            </Typography>
          </Box>
        ) : null}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {reasonOf(row)}
        {row.fee > 0 ? ` The bank kept ${money(row.fee, row.currency, locale)} as a fee.` : ''}
      </Typography>
    </Stack>
  );
}

export function Transfers({ ledger, range, rangeLabel, route }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const pairKey = route.query?.pair;
  const pairs = useMemo(() => transferPairs(ledger, range), [ledger, range]);
  const all = useMemo(() => transferRows(ledger, range), [ledger, range]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () => searchTransfers(pairKey ? all.filter((row) => row.pair === pairKey) : all, search),
    [all, pairKey, search],
  );
  const counts = Object.fromEntries(
    TABS.map((tab) => [tab.id, transfersOnTab(rows, tab.id).length]),
  );
  const [tab, setTab] = useState<TransferTab>(() =>
    !pairKey && transfersOnTab(all, 'needs').length > 0 ? 'needs' : 'all',
  );
  const shown = transfersOnTab(rows, tab);
  const pair = pairs.find((item) => `${item.from}|${item.to}` === pairKey);
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
              {pairs.map((item) => {
                const key = `${item.from}|${item.to}`;
                const href = hrefFor({ page: 'transfers', query: { pair: key } });
                return (
                  <TableRow
                    key={key}
                    hover
                    selected={key === pairKey}
                    onClick={() => go(href)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Link href={href} underline="hover">
                        {item.fromName}
                      </Link>
                    </TableCell>
                    <TableCell>{item.toName}</TableCell>
                    <TableCell align="right">{item.count}</TableCell>
                    <TableCell align="right">
                      <Amount minor={item.amount} currency={home} locale={locale} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Transfer list">
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ gap: 2, mb: 1, alignItems: { md: 'center' }, justifyContent: 'space-between' }}
        >
          <Tabs value={tab} onChange={(_event, value: TransferTab) => setTab(value)}>
            {TABS.map((item) => (
              <Tab
                key={item.id}
                value={item.id}
                label={`${item.label} (${counts[item.id] ?? 0})`}
              />
            ))}
          </Tabs>
          <TextField
            size="small"
            placeholder="Search accounts or bank text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              },
              htmlInput: { 'aria-label': 'Search transfers' },
            }}
            sx={{ minWidth: 260 }}
          />
        </Stack>
        {pairKey ? (
          <Chip
            sx={{ mb: 2 }}
            label={pair ? `${pair.fromName} to ${pair.toName}` : 'One pair of accounts'}
            onDelete={() => go(hrefFor({ page: 'transfers' }))}
          />
        ) : null}
        {shown.length === 0 ? (
          <Empty>{TABS.find((item) => item.id === tab)?.empty}</Empty>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Date</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Fee</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((row) => {
                  const expanded = open.has(row.id);
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        hover
                        onClick={() => toggle(row.id)}
                        sx={{ cursor: 'pointer', '& > td': expanded ? { borderBottom: 0 } : {} }}
                      >
                        <TableCell padding="checkbox">
                          <IconButton
                            size="small"
                            aria-label={expanded ? 'Hide details' : 'Show details'}
                            aria-expanded={expanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle(row.id);
                            }}
                          >
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </IconButton>
                        </TableCell>
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
                      {expanded ? (
                        <TableRow>
                          <TableCell />
                          <TableCell colSpan={6}>
                            <Details row={row} locale={locale} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </Section>
    </>
  );
}
