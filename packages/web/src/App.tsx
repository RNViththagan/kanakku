import {
  Alert,
  AlertTitle,
  AppShell,
  Box,
  Chip,
  CircularProgress,
  ColorSchemeToggle,
  Header,
  MenuItem,
  PageContent,
  Select,
  Sidebar,
  Typography,
} from '@wso2/oxygen-ui';
import {
  ArrowLeftRight,
  BellRing,
  ChartArea,
  ChartColumn,
  ChartPie,
  FileText,
  Landmark,
  LayoutDashboard,
  List,
  Repeat,
  Wallet,
} from '@wso2/oxygen-ui-icons-react';
import { type ReactNode, useEffect, useState } from 'react';
import { type Status, useLedger } from './api';
import { RANGE_PRESETS, type RangePreset, rangeFor } from './model';
import { PageView } from './PageView';
import { PAGE_TITLES, PAGES } from './pages';
import { hrefFor, type PageId, parseHash, type Route } from './routes';

const RANGE_KEY = 'kanakku-range';

const NAV: Array<{ id: PageId; icon: ReactNode }> = [
  { id: 'overview', icon: <LayoutDashboard size={18} /> },
  { id: 'net-worth', icon: <ChartArea size={18} /> },
  { id: 'cash-flow', icon: <ChartColumn size={18} /> },
  { id: 'spending', icon: <ChartPie size={18} /> },
  { id: 'transfers', icon: <ArrowLeftRight size={18} /> },
  { id: 'conversions', icon: <Repeat size={18} /> },
  { id: 'accounts', icon: <Landmark size={18} /> },
  { id: 'transactions', icon: <List size={18} /> },
  { id: 'statements', icon: <FileText size={18} /> },
  { id: 'needs', icon: <BellRing size={18} /> },
];

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

function useRangePreset(): [RangePreset, (preset: RangePreset) => void] {
  const [preset, setPreset] = useState<RangePreset>(() => {
    try {
      const saved = localStorage.getItem(RANGE_KEY);
      return RANGE_PRESETS.some((option) => option.id === saved) ? (saved as RangePreset) : '12m';
    } catch {
      return '12m';
    }
  });
  const choose = (next: RangePreset) => {
    setPreset(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      return;
    }
  };
  return [preset, choose];
}

function go(route: Route): void {
  window.location.hash = hrefFor(route);
}

function StatusBanner({ status }: { status: Status }) {
  const problems = [
    ...status.configErrors.map(
      (error) => `config.yaml${error.line ? ` line ${error.line}` : ''}: ${error.message}`,
    ),
    ...status.decisionErrors.map(
      (error) => `decisions.yaml${error.line ? ` line ${error.line}` : ''}: ${error.message}`,
    ),
    ...(status.error ? [status.error] : []),
  ];
  if (problems.length === 0) return null;
  return (
    <Alert severity={status.stale ? 'warning' : 'error'} sx={{ mb: 3 }}>
      <AlertTitle>
        {status.stale
          ? 'Kanakku could not read your latest changes. You are seeing the last good data.'
          : 'Kanakku cannot read your data folder.'}
      </AlertTitle>
      {problems.map((problem) => (
        <Typography key={problem} variant="body2">
          {problem}
        </Typography>
      ))}
    </Alert>
  );
}

export function App() {
  const route = useRoute();
  const [preset, setPreset] = useRangePreset();
  const { ledger, status, tidy, loading, error } = useLedger();
  const needs = ledger?.needs.length ?? 0;
  const foreign = ledger
    ? new Set(ledger.accounts.map((account) => account.currency)).size > 1
    : false;
  const page = route.page === 'conversions' && !foreign ? 'overview' : route.page;
  const active = page === 'account' ? 'accounts' : page;

  useEffect(() => {
    document.title = `${PAGE_TITLES[page]} · Kanakku`;
  }, [page]);

  let content: ReactNode;
  if (loading) {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  } else if (!ledger || !status) {
    content = (
      <Alert severity="error">
        <AlertTitle>Kanakku has nothing to show yet.</AlertTitle>
        {error ??
          (status
            ? `Fix ${status.configPath} and this page updates by itself.`
            : 'The Kanakku server did not answer.')}
      </Alert>
    );
  } else {
    const range = rangeFor(preset, ledger.today, ledger);
    const rangeLabel = RANGE_PRESETS.find((option) => option.id === preset)?.label ?? '';
    content = (
      <PageView
        pages={PAGES}
        ledger={ledger}
        status={status}
        tidy={tidy}
        route={{ ...route, page }}
        range={range}
        rangeLabel={rangeLabel}
      />
    );
  }

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle />
          <Header.Brand onClick={() => go({ page: 'overview' })}>
            <Header.BrandLogo>
              <Wallet size={22} />
            </Header.BrandLogo>
            <Header.BrandTitle>Kanakku</Header.BrandTitle>
          </Header.Brand>
          <Header.Spacer />
          <Header.Actions>
            <Select
              size="small"
              value={preset}
              onChange={(event) => setPreset(event.target.value as RangePreset)}
              inputProps={{ 'aria-label': 'Date range' }}
            >
              {RANGE_PRESETS.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <Chip
              icon={<BellRing size={16} />}
              label={needs === 1 ? '1 needs you' : `${needs} need you`}
              color={needs > 0 ? 'warning' : 'default'}
              variant="outlined"
              onClick={() => go({ page: 'needs' })}
            />
            <ColorSchemeToggle />
          </Header.Actions>
        </Header>
      </AppShell.Navbar>
      <AppShell.Sidebar>
        <Sidebar activeItem={active} onSelect={(id) => go({ page: id as PageId })}>
          <Sidebar.Nav>
            <Sidebar.Category>
              {NAV.filter((item) => item.id !== 'conversions' || foreign).map((item) => (
                <Sidebar.Item key={item.id} id={item.id}>
                  <Sidebar.ItemIcon>{item.icon}</Sidebar.ItemIcon>
                  <Sidebar.ItemLabel>{PAGE_TITLES[item.id]}</Sidebar.ItemLabel>
                  {item.id === 'needs' && needs > 0 ? (
                    <Sidebar.ItemBadge color="warning">{needs}</Sidebar.ItemBadge>
                  ) : null}
                </Sidebar.Item>
              ))}
            </Sidebar.Category>
          </Sidebar.Nav>
        </Sidebar>
      </AppShell.Sidebar>
      <AppShell.Main>
        <PageContent>
          {status ? <StatusBanner status={status} /> : null}
          {content}
        </PageContent>
      </AppShell.Main>
    </AppShell>
  );
}
