import type { Ledger, UserRule } from '@kanakku/core';
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
import { matchCount, takenEarlier, transfersTaken } from './answers';
import { saveRule } from './api';
import { CategorySelect, kindOfCategory } from './CategorySelect';
import { saveRuleChange, withReload } from './config';
import { SaveNote, useSave } from './Saving';

type Direction = 'either' | 'out' | 'in';

const DIRECTIONS: Array<{ id: Direction; label: string }> = [
  { id: 'either', label: 'Money in or out' },
  { id: 'out', label: 'Money out' },
  { id: 'in', label: 'Money in' },
];

export function counted(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function RuleCounts({
  matches,
  earlier,
  taken,
}: {
  matches: number;
  earlier: number;
  taken: number;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary">
        {matches === 0
          ? 'Matches no transactions'
          : `Matches ${counted(matches, 'transaction', 'transactions')}`}
      </Typography>
      {earlier > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {earlier === 1
            ? '1 of them is already sorted by an earlier rule'
            : `${earlier} of them are already sorted by an earlier rule`}
        </Typography>
      ) : null}
      {taken > 0 ? (
        <Typography variant="body2" color="error.main">
          {`This would also take ${counted(taken, 'transfer', 'transfers')} between your accounts, which would then count as income or spending. Make the text more specific.`}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function RuleForm({
  ledger,
  rule,
  index,
  reload,
  onClose,
}: {
  ledger: Ledger;
  rule?: UserRule;
  index?: number;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const pattern = rule && 'regex' in rule.match ? rule.match.regex : undefined;
  const [text, setText] = useState(rule && 'text' in rule.match ? rule.match.text : '');
  const [direction, setDirection] = useState<Direction>(rule?.direction ?? 'either');
  const [category, setCategory] = useState(rule?.category ?? '');
  const save = useSave();
  const kind = kindOfCategory(ledger, category);
  const match = text.trim();
  const usable = pattern !== undefined || match.length >= 3;
  const limits = {
    ...(rule?.account !== undefined && { account: rule.account }),
    ...(rule?.min !== undefined && { min: rule.min }),
    ...(rule?.max !== undefined && { max: rule.max }),
  };
  const candidate: UserRule = {
    ...limits,
    match: pattern === undefined ? { text: match } : { regex: pattern },
    ...(direction !== 'either' && { direction }),
  };
  const matches = usable ? matchCount(ledger, candidate) : 0;
  const earlier = usable ? takenEarlier(ledger, candidate, index) : 0;
  const taken = usable ? transfersTaken(ledger, candidate) : 0;
  const ready =
    kind !== undefined && usable && matches > 0 && taken === 0 && !save.saving && !save.done;

  const submit = () =>
    void save.run(() =>
      withReload(reload, async () => {
        if (!kind) return;
        if (rule && index !== undefined) {
          await saveRuleChange(index, rule, {
            ...(pattern === undefined && { match }),
            kind,
            category,
            direction: direction === 'either' ? null : direction,
          });
        } else {
          await saveRule({ match, kind, category, ...(direction !== 'either' && { direction }) });
        }
      }),
    );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{rule ? 'Change a rule' : 'Add a rule'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {pattern === undefined ? (
            <TextField
              size="small"
              label="When the text contains"
              value={text}
              onChange={(event) => setText(event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'When the text contains' } }}
            />
          ) : (
            <Typography variant="body2">{`Pattern ${pattern}`}</Typography>
          )}
          <TextField
            select
            size="small"
            label="Money in or out"
            value={direction}
            onChange={(event) => setDirection(event.target.value as Direction)}
            slotProps={{
              select: { native: true },
              htmlInput: { 'aria-label': 'Money in or out' },
              inputLabel: { shrink: true },
            }}
          >
            {DIRECTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </TextField>
          <CategorySelect
            ledger={ledger}
            value={category}
            onChange={setCategory}
            none="Choose a category"
          />
          {usable ? <RuleCounts matches={matches} earlier={earlier} taken={taken} /> : null}
          <SaveNote error={save.error} done={save.done} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{save.done ? 'Close' : 'Cancel'}</Button>
        <Button variant="contained" disabled={!ready} onClick={submit}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
