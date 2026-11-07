import type { Decision, Ledger } from '@kanakku/core';
import { Box, Button, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { useCallback, useEffect, useState } from 'react';
import { answerLabel } from './answers';
import { fetchAnswers, removeAnswer } from './api';
import { shortDate } from './format';
import { SaveNote, useSave } from './Saving';
import { Empty, Section } from './ui';

interface Answers {
  decisions: Decision[];
  unused: string[];
}

export function YourAnswers({ ledger }: { ledger: Ledger }) {
  const [answers, setAnswers] = useState<Answers>();
  const [problem, setProblem] = useState<string>();
  const undo = useSave();
  const load = useCallback(async () => {
    try {
      setAnswers(await fetchAnswers());
      setProblem(undefined);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new ledger means the answers file may have changed.
  useEffect(() => {
    void load();
  }, [ledger, load]);
  const unused = new Set(answers?.unused ?? []);
  const list = [...(answers?.decisions ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Section title="Your answers">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Undo an answer to bring back what Kanakku worked out by itself. An answer that no longer
        matches anything stays listed until you undo it.
      </Typography>
      <SaveNote error={problem ?? undo.error} done={undo.done} />
      {answers && list.length === 0 ? <Empty>You have not answered anything yet.</Empty> : null}
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {list.map((decision) => (
          <Stack
            key={decision.id}
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {answerLabel(decision, ledger, ledger.locale)}
              </Typography>
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {shortDate(decision.at.slice(0, 10), ledger.locale)}
                </Typography>
                {unused.has(decision.id) ? (
                  <Chip size="small" variant="outlined" label="No longer matches anything" />
                ) : null}
              </Stack>
            </Box>
            <Button
              size="small"
              disabled={undo.saving}
              onClick={() =>
                void undo.run(async () => {
                  await removeAnswer(decision.id);
                  await load();
                })
              }
            >
              Undo
            </Button>
          </Stack>
        ))}
      </Stack>
    </Section>
  );
}
