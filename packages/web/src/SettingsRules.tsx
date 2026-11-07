import {
  type Config,
  type Decision,
  ENGINE_CATEGORIES,
  type Ledger,
  type UserRule,
} from '@kanakku/core';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState } from 'react';
import { ruleSorts } from './answers';
import { fetchAnswers } from './api';
import {
  saveCategory,
  saveCategoryRemoval,
  saveRuleMove,
  saveRuleRemoval,
  withReload,
} from './config';
import { counted, RuleForm } from './RuleForm';
import { SaveNote, useSave } from './Saving';
import { Empty, Section } from './ui';

const KINDS: Record<string, string> = { income: 'Income', spending: 'Spending', other: 'Other' };

function sentence(rule: UserRule): string {
  const what =
    'text' in rule.match ? `Text contains ${rule.match.text}` : `Pattern ${rule.match.regex}`;
  const way =
    rule.direction === 'out' ? ', money out' : rule.direction === 'in' ? ', money in' : '';
  const to = rule.category ?? (rule.kind ? KINDS[rule.kind] : '');
  const extra =
    rule.account !== undefined || rule.min !== undefined || rule.max !== undefined
      ? ', and other conditions set in config.yaml'
      : '';
  return `${what}${way}: ${to}${extra}`;
}

export function SettingsRules({
  ledger,
  config,
  reload,
}: {
  ledger: Ledger;
  config: Config;
  reload: () => Promise<void>;
}) {
  const [form, setForm] = useState<{ rule?: UserRule; index?: number }>();
  const [asking, setAsking] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'income' | 'spending'>('spending');
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState<Decision[]>([]);
  const change = useSave();

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new ledger means the answers file may have changed.
  useEffect(() => {
    let alive = true;
    fetchAnswers().then(
      (loaded) => {
        if (alive) setAnswers(loaded.decisions);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [ledger]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    await change.run(() =>
      withReload(reload, async () => {
        await action();
        await reload();
      }),
    );
    setBusy(false);
  };

  const inUse = (category: string) =>
    ENGINE_CATEGORIES.includes(category) ||
    config.rules.some((rule) => rule.category === category) ||
    answers.some((answer) => answer.type === 'set' && answer.category === category);

  return (
    <Section
      title="Categories and rules"
      action={
        <Button size="small" variant="outlined" onClick={() => setForm({})}>
          Add a rule
        </Button>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rules put transactions in a category by their text. The first rule that matches wins.
      </Typography>
      <SaveNote error={change.error} done={undefined} />
      {config.rules.length === 0 ? <Empty>No rules yet.</Empty> : null}
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {config.rules.map((rule, index) => {
          const number = index + 1;
          return (
            <Box key={`${index}-${sentence(rule)}`}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ justifyContent: 'space-between', gap: 1 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {sentence(rule)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {`Sorts ${counted(ruleSorts(ledger, index), 'transaction', 'transactions')}`}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ gap: 0.5, flexShrink: 0 }}>
                  <Button
                    size="small"
                    disabled={busy}
                    aria-label={`Edit rule ${number}`}
                    onClick={() => setForm({ rule, index })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    disabled={busy || index === 0}
                    aria-label={`Move rule ${number} up`}
                    onClick={() => void run(() => saveRuleMove(index, rule, index - 1))}
                  >
                    Up
                  </Button>
                  <Button
                    size="small"
                    disabled={busy || index === config.rules.length - 1}
                    aria-label={`Move rule ${number} down`}
                    onClick={() => void run(() => saveRuleMove(index, rule, index + 1))}
                  >
                    Down
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    aria-label={`Remove rule ${number}`}
                    onClick={() => setAsking(index)}
                  >
                    Remove
                  </Button>
                </Stack>
              </Stack>
              {asking === index ? (
                <Alert
                  severity="warning"
                  sx={{ mt: 1 }}
                  action={
                    <Stack direction="row">
                      <Button
                        size="small"
                        color="inherit"
                        disabled={busy}
                        onClick={() => {
                          setAsking(undefined);
                          void run(() => saveRuleRemoval(index, rule));
                        }}
                      >
                        Remove it
                      </Button>
                      <Button size="small" color="inherit" onClick={() => setAsking(undefined)}>
                        Keep it
                      </Button>
                    </Stack>
                  }
                >
                  The transactions it sorts go back to how Kanakku sorts them by itself.
                </Alert>
              ) : null}
            </Box>
          );
        })}
      </Stack>

      <Typography variant="subtitle2" component="h3" sx={{ mt: 3, mb: 1 }}>
        Categories
      </Typography>
      {(['income', 'spending'] as const).map((group) => (
        <Stack key={group} direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ width: 72 }}>
            {KINDS[group]}
          </Typography>
          {config.categories[group].map((category) =>
            inUse(category) ? (
              <Chip key={category} size="small" label={category} />
            ) : (
              <Chip
                key={category}
                size="small"
                label={category}
                onDelete={() => void run(() => saveCategoryRemoval(category))}
                deleteIcon={
                  <IconButton size="small" aria-label={`Remove ${category}`} disabled={busy}>
                    <X size={12} />
                  </IconButton>
                }
              />
            ),
          )}
        </Stack>
      ))}
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' } }}>
        <TextField
          select
          size="small"
          label="Kind of category"
          value={kind}
          onChange={(event) => setKind(event.target.value as 'income' | 'spending')}
          slotProps={{
            select: { native: true },
            htmlInput: { 'aria-label': 'Kind of category' },
            inputLabel: { shrink: true },
          }}
        >
          <option value="spending">Spending</option>
          <option value="income">Income</option>
        </TextField>
        <TextField
          size="small"
          label="New category"
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'New category' } }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={busy || name.trim() === ''}
          onClick={() =>
            void run(async () => {
              await saveCategory(kind, name.trim());
              setName('');
            })
          }
        >
          Add a category
        </Button>
      </Stack>
      {form ? (
        <RuleForm
          ledger={ledger}
          reload={reload}
          onClose={() => setForm(undefined)}
          {...(form.rule ? { rule: form.rule } : {})}
          {...(form.index !== undefined ? { index: form.index } : {})}
        />
      ) : null}
    </Section>
  );
}
