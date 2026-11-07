import { DataGrid, IconButton, MenuItem, Stack, TextField } from '@wso2/oxygen-ui';
import { Tag } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState } from 'react';
import { CategoryForm, canCategorise } from '../CategoryForm';
import { money, shortDate } from '../format';
import { linkRange, type TransactionRow, transactionRows } from '../model';
import { categoryLabel, categoryOptions, filterTransactions } from '../tables';
import { Section, Title } from '../ui';
import type { PageProps } from './types';

const KINDS: Record<string, string> = {
  income: 'Income',
  spending: 'Spending',
  transfer: 'Transfer',
  other: 'Other',
  '': 'Not sorted',
};

export function TransactionTable({
  rows,
  locale,
  height = 640,
  onCategorise,
}: {
  rows: TransactionRow[];
  locale: string;
  height?: number;
  onCategorise?: (id: string) => void;
}) {
  const columns: DataGrid.GridColDef<TransactionRow>[] = [
    {
      field: 'date',
      headerName: 'Date',
      width: 120,
      valueFormatter: (value: string) => shortDate(value, locale),
    },
    { field: 'accountName', headerName: 'Account', width: 170 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 240 },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 170,
      type: 'number',
      valueFormatter: (_value: number, row) => money(row.amount, row.currency, locale),
    },
    {
      field: 'kind',
      headerName: 'Kind',
      width: 110,
      valueFormatter: (value: string) => KINDS[value] ?? value,
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 170,
      valueGetter: (_value: string, row) => categoryLabel(row, locale),
    },
    {
      field: 'transferWith',
      headerName: 'Transfer',
      width: 170,
      valueFormatter: (value: string | undefined, row) =>
        value ? `with ${value}` : row.flag ? `${row.flag}, no match yet` : '',
    },
    { field: 'files', headerName: 'From files', width: 260 },
  ];
  if (onCategorise) {
    columns.unshift({
      field: 'actions',
      headerName: '',
      width: 56,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) =>
        canCategorise(row) ? (
          <IconButton
            size="small"
            aria-label={`Categorise ${row.description}`}
            onClick={() => onCategorise(row.id)}
          >
            <Tag size={16} />
          </IconButton>
        ) : null,
    });
  }
  return (
    <div style={{ height, width: '100%' }}>
      <DataGrid.DataGrid
        rows={rows}
        columns={columns}
        density="compact"
        disableRowSelectionOnClick
        initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  );
}

export function Transactions({ ledger, route, range, rangeLabel }: PageProps) {
  const { locale } = ledger;
  const all = useMemo(() => transactionRows(ledger), [ledger]);
  const query = route.query ?? {};
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState(query.account ?? '');
  const [kind, setKind] = useState(query.kind ?? '');
  const [category, setCategory] = useState(query.category ?? '');
  const [origin, setOrigin] = useState(query.origin ?? '');
  const [sorting, setSorting] = useState<string>();
  const sorted = sorting ? ledger.transactions.find((row) => row.id === sorting) : undefined;
  const linked = linkRange(route.query, range);
  const { from, to } = linked;
  const categories = useMemo(() => categoryOptions(all), [all]);
  const rows = useMemo(
    () => filterTransactions(all, { search, account, kind, category, origin, from, to }),
    [all, search, account, kind, category, origin, from, to],
  );
  const period =
    linked === range ? rangeLabel : `${shortDate(from, locale)} to ${shortDate(to, locale)}`;

  return (
    <>
      <Title title="Transactions" subtitle={`${period}, ${rows.length} shown`} />
      <Section title="Filters">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            size="small"
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ minWidth: 240 }}
          />
          <TextField
            select
            size="small"
            label="Account"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All accounts</MenuItem>
            {ledger.accounts.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All kinds</MenuItem>
            {Object.entries(KINDS)
              .filter(([value]) => value !== '')
              .map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setOrigin('');
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All categories</MenuItem>
            {categories.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Section>
      <TransactionTable rows={rows} locale={locale} onCategorise={setSorting} />
      {sorted ? (
        <CategoryForm ledger={ledger} txns={[sorted]} onClose={() => setSorting(undefined)} />
      ) : null}
    </>
  );
}
