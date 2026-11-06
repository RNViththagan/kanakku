import {
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { money, shortDate } from '../format';
import { conversionSummary } from '../tables';
import { Empty, Section, Title } from '../ui';
import type { PageProps } from './types';

function rate(micro: number): string {
  return (micro / 1_000_000).toFixed(4);
}

export function Conversions({ ledger }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const summaries = useMemo(() => conversionSummary(ledger), [ledger]);
  const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));
  const conversions = [...ledger.conversions].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <Title title="Conversions" subtitle={`Money changed between ${home} and other currencies`} />
      <Grid container spacing={3}>
        {summaries.map((summary) => (
          <Grid key={summary.currency} size={{ xs: 12, md: 6 }}>
            <Section title={summary.currency}>
              <Typography variant="body2">
                {`Held now: ${money(summary.held, summary.currency, locale)}`}
              </Typography>
              <Typography variant="body2">
                {summary.heldValue === undefined
                  ? 'No exchange rate to value it.'
                  : `Worth ${money(summary.heldValue, home, locale)} today`}
              </Typography>
              {summary.rate ? (
                <Typography variant="body2" color="text.secondary">
                  {`Rate ${rate(summary.rate.micro)} from ${summary.rate.source}, ${shortDate(summary.rate.date, locale)}`}
                </Typography>
              ) : null}
              <Typography variant="body2" sx={{ mt: 1 }}>
                {summary.averageMicro === undefined
                  ? 'No conversions yet.'
                  : `Your average rate: ${rate(summary.averageMicro)} over ${summary.conversions} ${summary.conversions === 1 ? 'conversion' : 'conversions'}`}
              </Typography>
            </Section>
          </Grid>
        ))}
      </Grid>
      <Section title="Your conversions">
        {conversions.length === 0 ? (
          <Empty>No conversions yet.</Empty>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell align="right">Out</TableCell>
                <TableCell align="right">In</TableCell>
                <TableCell align="right">Rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {conversions.map((conversion) => (
                <TableRow key={conversion.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {shortDate(conversion.date, locale)}
                  </TableCell>
                  <TableCell>{names.get(conversion.from) ?? conversion.from}</TableCell>
                  <TableCell>{names.get(conversion.to) ?? conversion.to}</TableCell>
                  <TableCell align="right">
                    {money(conversion.amountOut, conversion.currencyOut, locale)}
                  </TableCell>
                  <TableCell align="right">
                    {money(conversion.amountIn, conversion.currencyIn, locale)}
                  </TableCell>
                  <TableCell align="right">{rate(conversion.micro)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
