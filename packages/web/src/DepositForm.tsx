import { type AccountEdit, type IsoDate, type Ledger, maturityOf, minorUnits } from '@kanakku/core';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { useState } from 'react';
import { saveAccount } from './api';
import { shortDate } from './format';
import { SaveNote, useSave } from './Saving';
import type { DepositRow } from './tables';

function normalUnits(minor: number, currency: string): string {
  return String(minor / 10 ** minorUnits(currency));
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ htmlInput: { 'aria-label': label, inputMode: 'decimal' } }}
    />
  );
}

export function DepositForm({
  ledger,
  row,
  returnedOn,
  onClose,
}: {
  ledger: Ledger;
  row: DepositRow;
  returnedOn?: IsoDate;
  onClose: () => void;
}) {
  const { account } = row;
  const { locale } = ledger;
  const askPrincipal = !row.placed && account.number !== undefined;
  const [start, setStart] = useState(row.start ?? '');
  const [months, setMonths] = useState(account.deposit?.months?.toString() ?? '');
  const [rate, setRate] = useState(account.deposit?.rate?.toString() ?? '');
  const [principal, setPrincipal] = useState(
    row.principal === undefined ? '' : normalUnits(row.principal, account.currency),
  );
  const save = useSave();

  const monthCount = Number(months);
  const monthsOk = /^\d+$/.test(months.trim()) && monthCount > 0;
  const rateValue = Number(rate);
  const rateOk = rate.trim() === '' || (Number.isFinite(rateValue) && rateValue >= 0);
  const principalValue = Number(principal);
  const principalOk =
    !askPrincipal ||
    (principal.trim() !== '' && Number.isFinite(principalValue) && principalValue > 0);
  const startOk = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const tooLate = returnedOn !== undefined && startOk && start > returnedOn;
  const maturity = startOk && monthsOk ? maturityOf({ start, months: monthCount }) : undefined;
  const problems = [
    months.trim() !== '' && !monthsOk ? 'Months must be a whole number above 0.' : '',
    rateOk ? '' : 'The rate must be 0 or more.',
    askPrincipal && principal.trim() !== '' && !principalOk ? 'The principal must be above 0.' : '',
    tooLate && returnedOn ? `The start must be on or before ${shortDate(returnedOn, locale)}.` : '',
  ].filter(Boolean);
  const ready =
    startOk && monthsOk && rateOk && principalOk && !tooLate && !save.saving && !save.done;

  const submit = () =>
    save.run(async () => {
      const deposit: NonNullable<AccountEdit['deposit']> = {
        start,
        months: monthCount,
        ...(rate.trim() !== '' && { rate: rateValue }),
        ...(askPrincipal && { principal: principalValue }),
      };
      await saveAccount(
        account.discovered
          ? {
              id: account.id,
              name: account.name,
              bank: account.bank,
              type: account.type,
              currency: account.currency,
              ...(account.number !== undefined && { number: account.number }),
              deposit,
            }
          : { id: account.id, deposit },
      );
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{`Term of ${account.name}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            size="small"
            type="date"
            label="Start"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            slotProps={{ htmlInput: { 'aria-label': 'Start' }, inputLabel: { shrink: true } }}
          />
          <NumberField label="Months" value={months} onChange={setMonths} />
          <NumberField label="Yearly rate" value={rate} onChange={setRate} />
          {askPrincipal ? (
            <NumberField label="Principal" value={principal} onChange={setPrincipal} />
          ) : null}
          {!row.placed && account.number === undefined ? (
            <Typography variant="body2" color="text.secondary">
              Add this deposit's number to config.yaml first.
            </Typography>
          ) : null}
          {maturity ? (
            <Typography variant="body2">{`Matures on ${shortDate(maturity, locale)}`}</Typography>
          ) : null}
          {problems.map((problem) => (
            <Typography key={problem} variant="body2" color="error.main">
              {problem}
            </Typography>
          ))}
          <SaveNote error={save.error} done={save.done} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{save.done ? 'Close' : 'Cancel'}</Button>
        <Button variant="contained" disabled={!ready} onClick={() => void submit()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
