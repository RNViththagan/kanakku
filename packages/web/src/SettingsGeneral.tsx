import { type Config, type Ledger, rateSources } from '@kanakku/core';
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
import { useState } from 'react';
import { saveGeneral, saveNames, saveRates, withReload } from './config';
import { money, shortDate } from './format';
import { counted } from './RuleForm';
import { SaveNote, useSave } from './Saving';
import { Section } from './ui';

const LOCALES = ['en-LK', 'en-GB', 'en-US', 'en-IN', 'ta-LK', 'si-LK'];

function mentions(ledger: Ledger, name: string): number {
  const text = name.trim().toLowerCase();
  return ledger.transactions.filter((row) => row.description.toLowerCase().includes(text)).length;
}

function sample(home: string, locale: string): string {
  return `${money(123456789, home, locale)}, ${shortDate('2026-01-31', locale)}`;
}

function useChange(reload: () => Promise<void>) {
  const save = useSave();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    await save.run(() =>
      withReload(reload, async () => {
        await action();
        await reload();
      }),
    );
    setBusy(false);
  };
  return { ...save, busy, run };
}

function YourNames({
  ledger,
  config,
  reload,
}: {
  ledger: Ledger;
  config: Config;
  reload: () => Promise<void>;
}) {
  const names = config.you.names;
  const [draft, setDraft] = useState('');
  const change = useChange(reload);
  const wanted = draft.trim();
  const short = wanted.length > 0 && wanted.length < 3;
  return (
    <Section title="Your names">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        How your name appears in bank text. Kanakku uses these to spot money you send yourself.
      </Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {names.map((name) => (
          <Chip
            key={name}
            label={`${name}, in ${counted(mentions(ledger, name), 'transaction', 'transactions')}`}
            onDelete={() =>
              void change.run(() => saveNames(names.filter((other) => other !== name)))
            }
            deleteIcon={
              <IconButton size="small" aria-label={`Remove ${name}`} disabled={change.busy}>
                <X size={12} />
              </IconButton>
            }
          />
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' } }}>
        <TextField
          size="small"
          label="Add a name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Add a name' } }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={change.busy || wanted.length < 3}
          onClick={() =>
            void change.run(async () => {
              await saveNames([...names, wanted]);
              setDraft('');
            })
          }
        >
          Add the name
        </Button>
        {wanted.length >= 3 ? (
          <Typography variant="body2" color="text.secondary">
            {`In ${counted(mentions(ledger, wanted), 'transaction', 'transactions')}`}
          </Typography>
        ) : null}
        {short ? (
          <Typography variant="body2" color="error.main">
            A name needs at least 3 characters.
          </Typography>
        ) : null}
      </Stack>
      <Box sx={{ mt: 1 }}>
        <SaveNote error={change.error} done={undefined} />
      </Box>
    </Section>
  );
}

function CurrencyAndLocale({
  ledger,
  config,
  reload,
}: {
  ledger: Ledger;
  config: Config;
  reload: () => Promise<void>;
}) {
  const home = config.homeCurrency;
  const [pending, setPending] = useState<string>();
  const change = useChange(reload);
  const currencies = [...new Set([home, ...config.accounts.map((account) => account.currency)])];
  const manualRates = Object.keys(config.rates.manual).length > 0;
  return (
    <Section title="Currency and locale">
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 2, alignItems: { sm: 'center' } }}
        >
          <TextField
            select
            size="small"
            label="Home currency"
            value={pending ?? home}
            disabled={manualRates || change.busy}
            onChange={(event) =>
              setPending(event.target.value === home ? undefined : event.target.value)
            }
            slotProps={{
              select: { native: true },
              htmlInput: { 'aria-label': 'Home currency' },
              inputLabel: { shrink: true },
            }}
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </TextField>
          {manualRates ? (
            <Typography variant="body2" color="text.secondary">
              {`Clear the manual rates first, as they are in ${home}.`}
            </Typography>
          ) : null}
        </Stack>
        {pending ? (
          <Alert
            severity="warning"
            action={
              <Stack direction="row">
                <Button
                  size="small"
                  color="inherit"
                  disabled={change.busy}
                  onClick={() =>
                    void change.run(async () => {
                      await saveGeneral({ homeCurrency: pending });
                      setPending(undefined);
                    })
                  }
                >
                  Change it
                </Button>
                <Button size="small" color="inherit" onClick={() => setPending(undefined)}>
                  {`Keep ${home}`}
                </Button>
              </Stack>
            }
          >
            {`Every amount will be valued in ${pending}. Change it?`}
          </Alert>
        ) : null}
        <TextField
          select
          size="small"
          label="Locale"
          value={LOCALES.includes(config.locale) ? config.locale : ''}
          disabled={change.busy}
          onChange={(event) => void change.run(() => saveGeneral({ locale: event.target.value }))}
          slotProps={{
            select: { native: true },
            htmlInput: { 'aria-label': 'Locale' },
            inputLabel: { shrink: true },
          }}
          sx={{ maxWidth: 420 }}
        >
          {LOCALES.includes(config.locale) ? null : (
            <option value="">{`${config.locale}, set in config.yaml`}</option>
          )}
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {`${locale}: ${sample(home, locale)}`}
            </option>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {`Amounts and dates look like this: ${sample(home, ledger.locale)}`}
        </Typography>
        <SaveNote error={change.error} done={undefined} />
      </Stack>
    </Section>
  );
}

function ExchangeRates({ config, reload }: { config: Config; reload: () => Promise<void> }) {
  const home = config.homeCurrency;
  const foreign = [
    ...new Set(config.accounts.map((account) => account.currency).filter((code) => code !== home)),
  ];
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(foreign.map((code) => [code, config.rates.manual[code] ?? ''])),
  );
  const change = useChange(reload);
  const source =
    rateSources.find((item) => item.id === config.rates.source)?.name ?? config.rates.source;
  return (
    <Section title="Exchange rates">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {`Rate source: ${source}. Online rates come in a later version.`}
      </Typography>
      {foreign.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {`All your accounts are in ${home}.`}
        </Typography>
      ) : null}
      <Stack spacing={1.5}>
        {foreign.map((code) => (
          <Stack key={code} direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">{`1 ${code} =`}</Typography>
            <TextField
              size="small"
              value={drafts[code] ?? ''}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [code]: event.target.value }))
              }
              slotProps={{ htmlInput: { 'aria-label': `Rate for ${code}`, inputMode: 'decimal' } }}
              sx={{ width: 140 }}
            />
            <Typography variant="body2">{home}</Typography>
            <Button
              size="small"
              variant="outlined"
              disabled={change.busy}
              aria-label={`Save the ${code} rate`}
              onClick={() =>
                void change.run(() =>
                  saveRates({
                    [code]: (drafts[code] ?? '').trim() === '' ? null : (drafts[code] ?? '').trim(),
                  }),
                )
              }
            >
              Save rate
            </Button>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ mt: 1 }}>
        <SaveNote error={change.error} done={undefined} />
      </Box>
    </Section>
  );
}

export function SettingsGeneral({
  ledger,
  config,
  reload,
}: {
  ledger: Ledger;
  config: Config;
  reload: () => Promise<void>;
}) {
  return (
    <>
      <YourNames ledger={ledger} config={config} reload={reload} />
      <CurrencyAndLocale ledger={ledger} config={config} reload={reload} />
      <ExchangeRates config={config} reload={reload} />
    </>
  );
}
