import type { DecisionContent, Ledger } from '@kanakku/core';
import {
  Alert,
  Box,
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
import { coversDate, otherAccounts, transferCandidates } from './answers';
import { saveAnswers } from './api';
import { CategorySelect, kindOfCategory } from './CategorySelect';
import { money, shortDate } from './format';

type Open = 'none' | 'not' | 'to';

export function notTransfer(ledger: Ledger, txn: string, category: string): DecisionContent[] {
  const kind = kindOfCategory(ledger, category);
  return kind
    ? [
        { type: 'not-transfer', txn },
        { type: 'set', txn, kind, category },
      ]
    : [{ type: 'not-transfer', txn }];
}

export function TransferAnswer({ ledger, txnId }: { ledger: Ledger; txnId: string }) {
  const [open, setOpen] = useState<Open>('none');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const row = ledger.transactions.find((item) => item.id === txnId);
  if (!row) return null;
  const { locale } = ledger;
  const accounts = otherAccounts(ledger, txnId);
  const target = accounts.find((account) => account.id === accountId);
  const candidates = target ? transferCandidates(ledger, txnId, target.id) : [];
  const summary = `${row.description.replace(/\s+/g, ' ').trim()}, ${money(row.amount, row.currency, locale)} on ${shortDate(row.date, locale)}`;

  const close = () => {
    setOpen('none');
    setError(undefined);
  };
  const save = async (contents: DecisionContent[]) => {
    setSaving(true);
    setError(undefined);
    try {
      await saveAnswers(contents);
      setSaved(true);
      setOpen('none');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" disabled={saving} onClick={() => setOpen('not')}>
          Not a transfer
        </Button>
        <Button size="small" variant="outlined" disabled={saving} onClick={() => setOpen('to')}>
          Transfer to…
        </Button>
      </Stack>
      {saved ? (
        <Alert severity="success" sx={{ mt: 1 }}>
          Saved. Kanakku is updating.
        </Alert>
      ) : null}

      <Dialog open={open === 'not'} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle>Not a transfer</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {summary}
          </Typography>
          <CategorySelect ledger={ledger} value={category} onChange={setCategory} />
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={() => void save(notTransfer(ledger, row.id, category))}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open === 'to'} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>Transfer to one of your accounts</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {summary}
          </Typography>
          <TextField
            select
            size="small"
            label="Account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            slotProps={{
              select: { native: true },
              htmlInput: { 'aria-label': 'Account' },
              inputLabel: { shrink: true },
            }}
            sx={{ minWidth: 260 }}
          >
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </TextField>
          {target ? (
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {candidates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {`${target.name} has no line that looks like the other side.`}
                </Typography>
              ) : (
                candidates.map((candidate) => (
                  <Stack
                    key={candidate.id}
                    direction="row"
                    sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
                  >
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {`${shortDate(candidate.date, locale)}, ${candidate.description.replace(/\s+/g, ' ').trim()}, ${money(candidate.amount, candidate.currency, locale)}`}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={saving}
                      onClick={() =>
                        void save([
                          row.amount < 0
                            ? { type: 'pair', out: row.id, in: candidate.id }
                            : { type: 'pair', out: candidate.id, in: row.id },
                        ])
                      }
                    >
                      Pair
                    </Button>
                  </Stack>
                ))
              )}
              {coversDate(ledger, target.id, row.date) ? (
                <Alert severity="warning">
                  {`${target.name}'s statement covers this date but has no matching line. Its side will still count as income or spending.`}
                </Alert>
              ) : null}
              <Box>
                <Button
                  disabled={saving}
                  onClick={() => void save([{ type: 'transfer', txn: row.id, account: target.id }])}
                >
                  {`No matching line. Count it as a transfer to ${target.name}.`}
                </Button>
              </Box>
            </Stack>
          ) : null}
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
