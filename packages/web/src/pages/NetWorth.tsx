import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { money, monthLabel, shortDate, toMajor } from '../format';
import { hrefFor } from '../routes';
import { netWorthPoints } from '../series';
import { depositRows } from '../tables';
import { Amount, Empty, MoneyArea, Section, Title } from '../ui';
import type { PageProps } from './types';

export function NetWorth({ ledger, range, rangeLabel }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const points = useMemo(() => netWorthPoints(ledger, range), [ledger, range]);
  const deposits = useMemo(() => depositRows(ledger), [ledger]);
  const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));

  return (
    <>
      <Title title="Net worth" subtitle={`${rangeLabel}, valued in ${home} at each month end`} />
      <Section title="Over time">
        {points.length === 0 ? (
          <Empty>No statements in this range.</Empty>
        ) : (
          <MoneyArea
            data={points.map((point) => ({
              label: monthLabel(point.month, locale),
              value: toMajor(point.total, home),
            }))}
            series={[{ key: 'value', name: 'Net worth' }]}
            currency={home}
            locale={locale}
            height={320}
          />
        )}
      </Section>
      <Section title="Month ends">
        {points.length === 0 ? (
          <Empty>No statements in this range.</Empty>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Net worth</TableCell>
                <TableCell align="right">Change</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...points].reverse().map((point, index, list) => {
                const before = list[index + 1];
                return (
                  <TableRow key={point.date}>
                    <TableCell>{shortDate(point.date, locale)}</TableCell>
                    <TableCell align="right">
                      <Amount minor={point.total} currency={home} locale={locale} />
                    </TableCell>
                    <TableCell align="right">
                      {before ? (
                        <Amount
                          minor={point.total - before.total}
                          currency={home}
                          locale={locale}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {[
                          point.unknown.length > 0
                            ? `Not known yet: ${point.unknown.map((id) => names.get(id) ?? id).join(', ')}`
                            : '',
                          point.unvalued.length > 0 ? `No rate: ${point.unvalued.join(', ')}` : '',
                        ]
                          .filter(Boolean)
                          .join('. ')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Fixed deposits">
        {deposits.length === 0 ? (
          <Empty>No fixed deposits.</Empty>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Deposit</TableCell>
                <TableCell align="right">Principal</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>Maturity</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Days left</TableCell>
                <TableCell align="right">Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deposits.map((row) => (
                <TableRow key={row.account.id} hover>
                  <TableCell>
                    <Link href={hrefFor({ page: 'account', param: row.account.id })}>
                      {row.account.name}
                    </Link>
                  </TableCell>
                  <TableCell align="right">
                    {row.principal === undefined
                      ? ''
                      : money(row.principal, row.account.currency, locale)}
                  </TableCell>
                  <TableCell>{row.start ? shortDate(row.start, locale) : ''}</TableCell>
                  <TableCell>
                    {row.maturity ? shortDate(row.maturity, locale) : 'Not set'}
                  </TableCell>
                  <TableCell align="right">
                    {row.rate === undefined ? '' : `${row.rate}%`}
                  </TableCell>
                  <TableCell align="right">{row.daysLeft ?? ''}</TableCell>
                  <TableCell align="right">
                    <Amount minor={row.balance} currency={row.account.currency} locale={locale} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
