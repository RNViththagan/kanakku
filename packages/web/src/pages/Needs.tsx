import type { Ledger, NeedsItem } from '@kanakku/core';
import { Box, Button, Chip, Link, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState } from 'react';
import { saveAnswers } from '../api';
import { DepositForm } from '../DepositForm';
import { money, plainAmount, shortDate } from '../format';
import { needsByType } from '../model';
import { hrefFor } from '../routes';
import { SaveNote, useSave } from '../Saving';
import { TransferAnswer } from '../TransferAnswer';
import { type DepositRow, depositRows, isPool } from '../tables';
import { Empty, Section, Title } from '../ui';
import { YourAnswers } from '../YourAnswers';
import { SEVERITY_COLORS } from './Overview';
import type { PageProps } from './types';

const SHOWN = 20;
const KEEPS_COMING_BACK = new Set(['uncategorised', 'tidy', 'bad-rows']);
const TRANSFER_QUESTIONS = new Set(['possible-transfer', 'ambiguous-transfer']);

function TransferQuestion({ ledger, need }: { ledger: Ledger; need: NeedsItem }) {
  const id = need.refs.txns?.[0];
  const row = id ? ledger.transactions.find((item) => item.id === id) : undefined;
  if (!row) return null;
  const account = ledger.accounts.find((item) => item.id === row.account)?.name ?? row.account;
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {`${shortDate(row.date, ledger.locale)}, ${account}, ${row.description.replace(/\s+/g, ' ').trim()}, ${money(row.amount, row.currency, ledger.locale)}`}
      </Typography>
      <TransferAnswer ledger={ledger} txnId={row.id} />
    </Stack>
  );
}

function CounterpartyQuestion({ ledger, need }: { ledger: Ledger; need: NeedsItem }) {
  const text = typeof need.data?.text === 'string' ? need.data.text : '';
  const [account, setAccount] = useState('');
  const save = useSave();
  const choices = ledger.accounts.filter((item) => item.type !== 'fixed-deposit');
  if (!text) return null;
  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Which account"
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          slotProps={{
            select: { native: true },
            htmlInput: { 'aria-label': `Which account is ${text}` },
            inputLabel: { shrink: true },
          }}
          sx={{ minWidth: 200 }}
        >
          <option value="">Choose an account</option>
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </TextField>
        <Button
          size="small"
          variant="outlined"
          disabled={!account || save.saving}
          onClick={() =>
            void save.run(() => saveAnswers([{ type: 'counterparty', text, mine: true, account }]))
          }
        >
          Mine
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={save.saving}
          onClick={() =>
            void save.run(() => saveAnswers([{ type: 'counterparty', text, mine: false }]))
          }
        >
          Not mine
        </Button>
      </Stack>
      <SaveNote error={save.error} done={save.done} />
    </Stack>
  );
}

function PrincipalQuestion({ need }: { need: NeedsItem }) {
  const deposit = need.refs.account ?? '';
  const [principal, setPrincipal] = useState('');
  const save = useSave();
  const decimal = plainAmount(principal);
  const valid = /^\d+(\.\d+)?$/.test(decimal) && Number(decimal) > 0;
  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Principal"
          value={principal}
          onChange={(event) => setPrincipal(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': `Principal of ${deposit}`, inputMode: 'decimal' },
          }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={!valid || save.saving}
          onClick={() =>
            void save.run(() =>
              saveAnswers([{ type: 'fd-principal', deposit, principal: decimal }]),
            )
          }
        >
          Add principal
        </Button>
      </Stack>
      <SaveNote error={save.error} done={save.done} />
    </Stack>
  );
}

function NeedActions({
  ledger,
  need,
  deposits,
  onTerm,
}: {
  ledger: Ledger;
  need: NeedsItem;
  deposits: DepositRow[];
  onTerm: (row: DepositRow, returnedOn?: string) => void;
}) {
  const dismiss = useSave();
  const deposit = deposits.find(
    (row) => row.account.id === need.refs.account && !isPool(row.account),
  );
  const account = ledger.accounts.find((item) => item.id === need.refs.account);
  return (
    <Stack spacing={1}>
      {TRANSFER_QUESTIONS.has(need.type) ? <TransferQuestion ledger={ledger} need={need} /> : null}
      {need.type === 'counterparty' ? <CounterpartyQuestion ledger={ledger} need={need} /> : null}
      {need.type === 'deposit-principal' ? <PrincipalQuestion need={need} /> : null}
      <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {need.type === 'deposit-details' && deposit ? (
          <Button size="small" sx={{ px: 0 }} onClick={() => onTerm(deposit)}>
            Set the term
          </Button>
        ) : null}
        {need.type === 'deposit-before-statements' && deposit ? (
          <Button size="small" sx={{ px: 0 }} onClick={() => onTerm(deposit, need.refs.date)}>
            Add start and principal
          </Button>
        ) : null}
        {need.type === 'uncategorised' ? (
          <Link
            variant="body2"
            href={hrefFor({ page: 'cash-flow', query: { flow: 'spending:Uncategorised' } })}
          >
            Sort them in Cash flow
          </Link>
        ) : null}
        {account ? (
          <Link variant="body2" href={hrefFor({ page: 'account', param: account.id })}>
            Show
          </Link>
        ) : null}
        {need.refs.file || need.type === 'tidy' ? (
          <Link variant="body2" href={hrefFor({ page: 'statements' })}>
            Statements
          </Link>
        ) : null}
        {KEEPS_COMING_BACK.has(need.type) ? null : (
          <Button
            size="small"
            sx={{ px: 0 }}
            disabled={dismiss.saving || dismiss.done !== undefined}
            onClick={() =>
              void dismiss.run(() => saveAnswers([{ type: 'dismiss', item: need.id }]), 'Hidden.')
            }
          >
            Dismiss
          </Button>
        )}
      </Stack>
      <SaveNote error={dismiss.error} done={dismiss.done} />
    </Stack>
  );
}

export function Needs({ ledger }: PageProps) {
  const groups = useMemo(() => needsByType(ledger), [ledger]);
  const deposits = useMemo(() => depositRows(ledger), [ledger]);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [term, setTerm] = useState<{ row: DepositRow; returnedOn?: string }>();
  return (
    <>
      <Title
        title="Needs you"
        subtitle={
          ledger.needs.length === 1
            ? '1 thing to check.'
            : `${ledger.needs.length} things to check.`
        }
      />
      {groups.length === 0 ? <Empty>Nothing needs you.</Empty> : null}
      {groups.map((group) => {
        const all = opened.has(group.type);
        const shown = all ? group.items : group.items.slice(0, SHOWN);
        return (
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
            <Stack spacing={2}>
              {shown.map((need) => (
                <Box key={need.id}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {need.message}
                  </Typography>
                  <NeedActions
                    ledger={ledger}
                    need={need}
                    deposits={deposits}
                    onTerm={(row, returnedOn) =>
                      setTerm(returnedOn ? { row, returnedOn } : { row })
                    }
                  />
                </Box>
              ))}
              {group.items.length > shown.length ? (
                <Box>
                  <Button
                    size="small"
                    onClick={() => setOpened((current) => new Set([...current, group.type]))}
                  >
                    {`Show all ${group.items.length}`}
                  </Button>
                </Box>
              ) : null}
            </Stack>
          </Section>
        );
      })}
      <YourAnswers ledger={ledger} />
      {term ? (
        <DepositForm
          ledger={ledger}
          row={term.row}
          onClose={() => setTerm(undefined)}
          {...(term.returnedOn ? { returnedOn: term.returnedOn } : {})}
        />
      ) : null}
    </>
  );
}
