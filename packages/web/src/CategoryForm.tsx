import type { DecisionContent, Ledger, Transaction, UserRule } from '@kanakku/core';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo, useState } from 'react';
import { ruleCount, ruleText, takenEarlier, transfersTaken } from './answers';
import { saveAnswers, saveRule } from './api';
import { CategorySelect, kindOfCategory } from './CategorySelect';
import { RuleCounts } from './RuleForm';
import { SaveNote, useSave } from './Saving';

const RULE_LABEL = 'Also for every transaction whose text contains';

function partToSort(row: Pick<Transaction, 'parts'>) {
  return row.parts.find((part) => part.kind === 'income' || part.kind === 'spending');
}

export function canCategorise(row: Pick<Transaction, 'kind' | 'parts'>): boolean {
  return row.kind !== 'transfer' || partToSort(row) !== undefined;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function CategoryForm({
  ledger,
  txns,
  onClose,
  rule: ruleFirst = txns.length > 1,
}: {
  ledger: Ledger;
  txns: Transaction[];
  onClose: () => void;
  rule?: boolean;
}) {
  const single = txns.length === 1 ? txns[0] : undefined;
  const transferRow = single?.kind === 'transfer';
  const part = single && transferRow ? partToSort(single) : undefined;
  const only = part?.kind === 'income' || part?.kind === 'spending' ? part.kind : undefined;
  const shared = useMemo(() => ruleText(txns.map((row) => row.description)), [txns]);
  const ruleAllowed = !transferRow && shared !== '';
  const [category, setCategory] = useState('');
  const [withRule, setWithRule] = useState(ruleFirst && ruleAllowed);
  const [text, setText] = useState(shared);
  const save = useSave();
  const kind = kindOfCategory(ledger, category);
  const direction = kind === 'spending' ? 'out' : kind === 'income' ? 'in' : undefined;
  const match = text.trim();
  const rule: UserRule = { match: { text: match }, ...(direction && { direction }) };
  const matches =
    withRule && match.length >= 3
      ? ruleCount(ledger, { match, ...(direction && { direction }) })
      : 0;
  const taken = withRule && match.length >= 3 ? transfersTaken(ledger, rule) : 0;
  const earlier = withRule && match.length >= 3 ? takenEarlier(ledger, rule) : 0;
  const ruleReady = !withRule || (match.length >= 3 && matches > 0 && taken === 0);
  const ready = kind !== undefined && ruleReady && !save.saving && !save.done;

  const submit = () =>
    save.run(async () => {
      if (!kind) return;
      const answers: DecisionContent[] = single
        ? [
            transferRow
              ? { type: 'set', txn: single.id, category }
              : { type: 'set', txn: single.id, kind, category },
          ]
        : withRule
          ? []
          : txns.map((row) => ({ type: 'set', txn: row.id, kind, category }));
      if (answers.length > 0) await saveAnswers(answers);
      if (withRule) {
        await saveRule({ match, kind, category, ...(direction && { direction }) });
      }
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {single
          ? 'Put this transaction in a category'
          : `Put ${txns.length} transactions in a category`}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {single ? (
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {single.description.replace(/\s+/g, ' ').trim()}
              {part ? ' Only its fee or interest goes in the category.' : ''}
            </Typography>
          ) : null}
          <CategorySelect
            ledger={ledger}
            value={category}
            onChange={setCategory}
            none="Choose a category"
            only={only}
          />
          {ruleAllowed ? (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={withRule}
                    onChange={(event) => setWithRule(event.target.checked)}
                    slotProps={{ input: { 'aria-label': RULE_LABEL } }}
                  />
                }
                label={RULE_LABEL}
              />
              {withRule ? (
                <Stack spacing={1}>
                  <TextField
                    size="small"
                    label="Text to match"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    slotProps={{ htmlInput: { 'aria-label': 'Text to match' } }}
                  />
                  <RuleCounts matches={matches} earlier={earlier} taken={taken} />
                </Stack>
              ) : null}
            </>
          ) : txns.length > 1 ? (
            <Typography variant="body2" color="text.secondary">
              These transactions share no text, so no rule can cover them all.
            </Typography>
          ) : null}
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
