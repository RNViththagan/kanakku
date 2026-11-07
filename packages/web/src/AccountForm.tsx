import { type Account, type AccountEdit, minorUnits } from '@kanakku/core';
import {
  Alert,
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
import { SaveNote, useSave } from './Saving';

function Field({
  label,
  value,
  onChange,
  type = 'text',
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
  note?: string;
}) {
  return (
    <TextField
      size="small"
      type={type}
      label={label}
      value={value}
      helperText={note}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        htmlInput: { 'aria-label': label },
        ...(type === 'date' && { inputLabel: { shrink: true } }),
      }}
    />
  );
}

const isDay = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 31;

export function AccountForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const card = account.type === 'credit-card';
  const shownLimit =
    account.card?.limit === undefined
      ? ''
      : String(account.card.limit / 10 ** minorUnits(account.currency));
  const [name, setName] = useState(account.name);
  const [number, setNumber] = useState(account.number ?? '');
  const [opened, setOpened] = useState(account.opened ?? '');
  const [closed, setClosed] = useState(account.closed ?? '');
  const [statementDay, setStatementDay] = useState(
    account.card ? String(account.card.statementDay) : '',
  );
  const [dueDay, setDueDay] = useState(account.card ? String(account.card.dueDay) : '');
  const [limit, setLimit] = useState(shownLimit);
  const [confirming, setConfirming] = useState(false);
  const save = useSave();

  const problems = [
    name.trim() === '' ? 'The name must not be empty.' : '',
    opened && closed && closed < opened
      ? 'The closed date must be on or after the opened date.'
      : '',
    card && !isDay(statementDay) ? 'The statement day must be from 1 to 31.' : '',
    card && !isDay(dueDay) ? 'The due day must be from 1 to 31.' : '',
    card && limit.trim() !== '' && !(Number.isFinite(Number(limit)) && Number(limit) >= 0)
      ? 'The limit must be 0 or more.'
      : '',
  ].filter(Boolean);

  const edit: AccountEdit = { id: account.id };
  if (name.trim() !== account.name) edit.name = name.trim();
  if (number.trim() !== (account.number ?? '')) edit.number = number.trim() || null;
  if (opened !== (account.opened ?? '')) edit.opened = opened || null;
  if (closed !== (account.closed ?? '')) edit.closed = closed || null;
  if (card) {
    const changes: NonNullable<AccountEdit['card']> = {};
    if (statementDay !== String(account.card?.statementDay ?? '')) {
      changes.statementDay = Number(statementDay);
    }
    if (dueDay !== String(account.card?.dueDay ?? '')) changes.dueDay = Number(dueDay);
    if (limit.trim() !== shownLimit) changes.limit = limit.trim() === '' ? null : Number(limit);
    if (Object.keys(changes).length > 0) edit.card = changes;
  }
  const clearsNumber = account.number !== undefined && number.trim() === '';
  const ready = problems.length === 0 && Object.keys(edit).length > 1 && !save.saving && !save.done;
  const submit = () => void save.run(() => saveAccount(edit));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{`Edit ${account.name}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Field label="Name" value={name} onChange={setName} />
          <Field
            label="Number"
            value={number}
            onChange={setNumber}
            note="Kanakku matches statements by this number."
          />
          <Field label="Opened" type="date" value={opened} onChange={setOpened} />
          <Field label="Closed" type="date" value={closed} onChange={setClosed} />
          {card ? (
            <>
              <Field label="Statement day" value={statementDay} onChange={setStatementDay} />
              <Field label="Due day" value={dueDay} onChange={setDueDay} />
              <Field label="Limit" value={limit} onChange={setLimit} />
            </>
          ) : null}
          {problems.map((problem) => (
            <Typography key={problem} variant="body2" color="error.main">
              {problem}
            </Typography>
          ))}
          {confirming ? (
            <Alert severity="warning">
              Without a number, Kanakku cannot match this account's statements to it.
            </Alert>
          ) : null}
          <SaveNote error={save.error} done={save.done} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{save.done ? 'Close' : 'Cancel'}</Button>
        {confirming ? (
          <Button variant="contained" color="warning" disabled={!ready} onClick={submit}>
            Clear the number
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!ready}
            onClick={() => (clearsNumber ? setConfirming(true) : submit())}
          >
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
