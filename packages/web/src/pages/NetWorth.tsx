import type { Account } from '@kanakku/core';
import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { Fragment, useMemo } from 'react';
import { money, monthLabel, shortDate, toMajor } from '../format';
import { hrefFor } from '../routes';
import { netWorthPoints } from '../series';
import { type DepositRow, depositRows } from '../tables';
import { Amount, Empty, MoneyArea, Section, Title } from '../ui';
import type { PageProps } from './types';

function shortName(account: Account): string {
  return account.number ? `…${account.number.slice(-4)}` : account.name;
}

function Linked({ label, accounts }: { label: string; accounts: Account[] | undefined }) {
  if (!accounts) return null;
  return (
    <Typography variant="caption" color="text.secondary" component="div">
      {`${label} `}
      {accounts.map((account, index) => (
        <Fragment key={account.id}>
          {index > 0 ? ', ' : ''}
          <Link href={hrefFor({ page: 'account', param: account.id })}>{shortName(account)}</Link>
        </Fragment>
      ))}
    </Typography>
  );
}

function ending(row: DepositRow): string {
  if (row.ended === 'early') return 'Broken early';
  if (row.ended !== 'matured') return '';
  if (!row.months) return 'Matured';
  return `Matured after ${row.months} ${row.months === 1 ? 'month' : 'months'}`;
}

export function NetWorth({ ledger, range, rangeLabel }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const points = useMemo(() => netWorthPoints(ledger, range), [ledger, range]);
  const deposits = useMemo(() => depositRows(ledger), [ledger]);
  const active = deposits
    .filter((row) => row.status === 'active')
    .sort(
      (a, b) =>
        (a.maturity ?? '9999').localeCompare(b.maturity ?? '9999') ||
        (a.start ?? '').localeCompare(b.start ?? ''),
    );
  const withdrawn = deposits
    .filter((row) => row.status === 'withdrawn')
    .sort((a, b) => (b.closed ?? '').localeCompare(a.closed ?? ''));
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
      {deposits.length === 0 ? (
        <Section title="Fixed deposits">
          <Empty>No fixed deposits.</Empty>
        </Section>
      ) : (
        <>
          <Section title="Active fixed deposits">
            {active.length === 0 ? (
              <Empty>No active deposits.</Empty>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Deposit</TableCell>
                    <TableCell align="right">Principal</TableCell>
                    <TableCell>Opened</TableCell>
                    <TableCell>Matures</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Days left</TableCell>
                    <TableCell align="right">Interest so far</TableCell>
                    <TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {active.map((row) => (
                    <TableRow key={row.account.id} hover>
                      <TableCell>
                        <Link href={hrefFor({ page: 'account', param: row.account.id })}>
                          {row.account.name}
                        </Link>
                        <Linked label="Replaced" accounts={row.replaced} />
                      </TableCell>
                      <TableCell align="right">
                        {row.principal === undefined
                          ? ''
                          : money(row.principal, row.account.currency, locale)}
                      </TableCell>
                      <TableCell>{row.start ? shortDate(row.start, locale) : ''}</TableCell>
                      <TableCell>
                        {row.maturity ? (
                          shortDate(row.maturity, locale)
                        ) : row.earliest ? (
                          <>
                            {`${shortDate(row.earliest, locale)} at the earliest`}
                            <Typography variant="caption" component="div">
                              <Link href={hrefFor({ page: 'needs' })}>Set the term</Link>
                            </Typography>
                          </>
                        ) : (
                          <Link href={hrefFor({ page: 'needs' })}>Term not set</Link>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {row.rate === undefined ? '' : `${row.rate}%`}
                      </TableCell>
                      <TableCell align="right">{row.daysLeft ?? ''}</TableCell>
                      <TableCell align="right">
                        {row.interest === 0 ? (
                          ''
                        ) : (
                          <Amount
                            minor={row.interest}
                            currency={row.account.currency}
                            locale={locale}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Amount
                          minor={row.balance}
                          currency={row.account.currency}
                          locale={locale}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
          {withdrawn.length > 0 ? (
            <Section title="Withdrawn fixed deposits">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Deposit</TableCell>
                    <TableCell align="right">Principal</TableCell>
                    <TableCell>Opened</TableCell>
                    <TableCell>Withdrawn</TableCell>
                    <TableCell>How it ended</TableCell>
                    <TableCell align="right">Days held</TableCell>
                    <TableCell align="right">Interest</TableCell>
                    <TableCell align="right">Yearly rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {withdrawn.map((row) => (
                    <TableRow key={row.account.id} hover>
                      <TableCell>
                        <Link href={hrefFor({ page: 'account', param: row.account.id })}>
                          {row.account.name}
                        </Link>
                        <Linked label="Re-placed as" accounts={row.replacedBy} />
                      </TableCell>
                      <TableCell align="right">
                        {row.principal === undefined
                          ? ''
                          : money(row.principal, row.account.currency, locale)}
                      </TableCell>
                      <TableCell>{row.start ? shortDate(row.start, locale) : ''}</TableCell>
                      <TableCell>{row.closed ? shortDate(row.closed, locale) : ''}</TableCell>
                      <TableCell>{ending(row)}</TableCell>
                      <TableCell align="right">{row.held ?? ''}</TableCell>
                      <TableCell align="right">
                        {row.returned === undefined && row.interest === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            No payout line
                          </Typography>
                        ) : (
                          <Amount
                            minor={row.interest}
                            currency={row.account.currency}
                            locale={locale}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {row.yearlyRate === undefined ? '' : `${row.yearlyRate.toFixed(2)}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}
