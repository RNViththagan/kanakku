import { Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { needsByType } from '../model';
import { Empty, Section, Title } from '../ui';
import { YourAnswers } from '../YourAnswers';
import { SEVERITY_COLORS } from './Overview';
import type { PageProps } from './types';

export function Needs({ ledger }: PageProps) {
  const groups = useMemo(() => needsByType(ledger), [ledger]);
  return (
    <>
      <Title
        title="Needs you"
        subtitle={`${ledger.needs.length} things to check. Answering them from here comes in a later version.`}
      />
      {groups.length === 0 ? <Empty>Nothing needs you.</Empty> : null}
      {groups.map((group) => (
        <Section
          key={group.type}
          title={group.label}
          action={
            <Chip
              size="small"
              variant="outlined"
              label={group.items.length}
              color={SEVERITY_COLORS[group.severity]}
            />
          }
        >
          <Stack spacing={1}>
            {group.items.map((need) => (
              <Typography key={need.id} variant="body2">
                {need.message}
              </Typography>
            ))}
          </Stack>
        </Section>
      ))}
      <YourAnswers ledger={ledger} />
    </>
  );
}
