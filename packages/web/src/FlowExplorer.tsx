import type { CurrencyCode, DateRange, Ledger } from '@kanakku/core';
import {
  Box,
  Breadcrumbs,
  Button,
  LinearProgress,
  Link,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@wso2/oxygen-ui';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { DRILL_BY, type DrillBy, drillEntries, groupEntries, groupKey, resolveItem } from './drill';
import { FlowChart } from './FlowChart';
import type { FlowItem, MoneyFlow } from './flow';
import { transactionRows } from './model';
import { TransactionTable } from './pages/Transactions';
import { hrefFor, type Route } from './routes';
import { Amount, Empty } from './ui';

const BY_LABELS: Record<DrillBy, string> = { payee: 'Payee', month: 'Month', account: 'Account' };
const SHOWN = 30;

export function explore(query: Record<string, string> = {}): string {
  return hrefFor({ page: 'cash-flow', query });
}

function isDrillBy(value: string | undefined): value is DrillBy {
  return DRILL_BY.some((option) => option === value);
}

function counted(count: number): string {
  return count === 1 ? '1 transaction' : `${count} transactions`;
}

function Row({
  href,
  label,
  value,
  note,
  scale,
  currency,
  locale,
}: {
  href: string;
  label: string;
  value: number;
  note?: string;
  scale: number;
  currency: CurrencyCode;
  locale: string;
}) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
        <Link href={href} underline="hover" sx={{ overflowWrap: 'anywhere' }}>
          {label}
        </Link>
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          <Amount minor={value} currency={currency} locale={locale} />
          {note ? (
            <Typography component="span" variant="caption" color="text.secondary">
              {`  ${note}`}
            </Typography>
          ) : null}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={scale > 0 ? (Math.max(value, 0) / scale) * 100 : 0}
        sx={{ height: 6, borderRadius: 1, mt: 0.5 }}
      />
    </Box>
  );
}

function Trail({
  flow,
  item,
  level,
  group,
}: {
  flow: MoneyFlow;
  item?: FlowItem;
  level: string;
  group?: string;
}) {
  const parent = item
    ? [...flow.sources, ...flow.uses].find((entry) =>
        entry.folded.some((part) => part.key === item.key),
      )
    : undefined;
  return (
    <Breadcrumbs sx={{ mb: 2 }}>
      <Link href={explore()} underline="hover">
        Money flow
      </Link>
      {parent ? (
        <Link href={explore({ flow: parent.key })} underline="hover">
          {parent.label}
        </Link>
      ) : null}
      {group ? (
        <Link href={level} underline="hover">
          {item?.label}
        </Link>
      ) : (
        <Typography color="text.primary">{item?.label ?? 'Not found'}</Typography>
      )}
      {group ? <Typography color="text.primary">{group}</Typography> : null}
    </Breadcrumbs>
  );
}

export function FlowExplorer({
  ledger,
  range,
  route,
  flow,
}: {
  ledger: Ledger;
  range: DateRange;
  route: Route;
  flow: MoneyFlow;
}) {
  const { homeCurrency: home, locale } = ledger;
  const query = route.query ?? {};
  const item = query.flow ? resolveItem(flow, query.flow) : undefined;
  const by: DrillBy = item?.kind === 'savings' ? 'month' : isDrillBy(query.by) ? query.by : 'payee';
  const [all, setAll] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const names = useMemo(
    () => new Map(ledger.accounts.map((account) => [account.id, account.name])),
    [ledger],
  );
  const entries = useMemo(
    () => (item ? drillEntries(ledger, range, item) : []),
    [ledger, range, item],
  );
  const groups = useMemo(
    () => groupEntries(entries, by, names, locale),
    [entries, by, names, locale],
  );
  const rows = useMemo(() => (query.group ? transactionRows(ledger) : []), [ledger, query.group]);

  useEffect(() => {
    if (query.flow) box.current?.scrollIntoView?.({ block: 'nearest' });
  }, [query.flow]);

  if (!query.flow) {
    return (
      <FlowChart
        flow={flow}
        currency={home}
        locale={locale}
        linkTo={(entry) => explore({ flow: entry.key })}
      />
    );
  }
  if (!item) {
    return (
      <Box ref={box}>
        <Trail flow={flow} level={explore()} />
        <Empty>Nothing to show for this in the chosen range.</Empty>
      </Box>
    );
  }

  const level = explore(item.kind === 'category' ? { flow: item.key, by } : { flow: item.key });
  const group = query.group ? groups.find((entry) => entry.key === query.group) : undefined;
  const total = query.group
    ? (group?.value ?? 0)
    : entries.reduce((sum, entry) => sum + entry.value, 0);
  const count = query.group ? (group?.count ?? 0) : entries.length;

  let body: ReactNode;
  if (query.group && item.kind !== 'other') {
    const ids = new Set(
      entries
        .filter((entry) => groupKey(entry.transaction, by) === query.group)
        .map((entry) => entry.transaction.id),
    );
    const listed = rows.filter((row) => ids.has(row.id));
    body =
      listed.length === 0 ? (
        <Empty>Nothing to show for this in the chosen range.</Empty>
      ) : (
        <TransactionTable
          rows={listed}
          locale={locale}
          height={Math.min(640, 112 + listed.length * 37)}
        />
      );
  } else if (item.kind === 'other') {
    const scale = Math.max(0, ...item.folded.map((part) => part.value));
    body = (
      <Stack spacing={1.5}>
        {item.folded.map((part) => (
          <Row
            key={part.key}
            href={explore({ flow: part.key })}
            label={part.label}
            value={part.value}
            scale={scale}
            currency={home}
            locale={locale}
          />
        ))}
      </Stack>
    );
  } else {
    const scale = Math.max(0, ...groups.map((entry) => Math.abs(entry.value)));
    const shown = all ? groups : groups.slice(0, SHOWN);
    body = (
      <Stack spacing={1.5}>
        {shown.map((entry) => (
          <Row
            key={entry.key}
            href={explore({
              ...(item.kind === 'category' ? { by } : {}),
              flow: item.key,
              group: entry.key,
            })}
            label={entry.label}
            value={entry.value}
            note={counted(entry.count)}
            scale={scale}
            currency={home}
            locale={locale}
          />
        ))}
        {groups.length > shown.length ? (
          <Box>
            <Button size="small" onClick={() => setAll(true)}>
              {`Show all ${groups.length}`}
            </Button>
          </Box>
        ) : null}
        {groups.length === 0 ? <Empty>Nothing to show for this in the chosen range.</Empty> : null}
      </Stack>
    );
  }

  return (
    <Box ref={box}>
      <Trail flow={flow} item={item} level={level} group={group?.label ?? query.group} />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1, mb: 2 }}
      >
        <Typography variant="body2" color="text.secondary">
          <Typography component="span" variant="h6" color="text.primary" sx={{ mr: 1 }}>
            <Amount
              minor={item.kind === 'other' ? item.value : total}
              currency={home}
              locale={locale}
            />
          </Typography>
          {item.kind === 'other' ? `${item.folded.length} categories` : counted(count)}
        </Typography>
        <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
          {item.kind === 'category' && item.category ? (
            <Link
              variant="body2"
              href={hrefFor({
                page: 'transactions',
                query: {
                  category: item.category,
                  ...(item.origin ? { origin: item.origin } : {}),
                  from: range.from,
                  to: range.to,
                },
              })}
            >
              Open in Transactions
            </Link>
          ) : null}
          {item.kind === 'category' && !query.group ? (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={by}
              onChange={(_event, next: DrillBy | null) => {
                if (next) window.location.hash = explore({ flow: item.key, by: next });
              }}
              aria-label="Group by"
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5 } }}
            >
              {DRILL_BY.map((option) => (
                <ToggleButton key={option} value={option}>
                  {BY_LABELS[option]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          ) : null}
        </Stack>
      </Stack>
      {body}
    </Box>
  );
}
