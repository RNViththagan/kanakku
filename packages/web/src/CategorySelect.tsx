import type { Ledger } from '@kanakku/core';
import { TextField } from '@wso2/oxygen-ui';

export function kindOfCategory(
  ledger: Ledger,
  category: string,
): 'income' | 'spending' | undefined {
  if (ledger.categories.income.includes(category)) return 'income';
  if (ledger.categories.spending.includes(category)) return 'spending';
  return undefined;
}

export function CategorySelect({
  ledger,
  value,
  onChange,
  label = 'Category',
  none = 'No category',
}: {
  ledger: Ledger;
  value: string;
  onChange: (category: string) => void;
  label?: string;
  none?: string;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        select: { native: true },
        htmlInput: { 'aria-label': label },
        inputLabel: { shrink: true },
      }}
      sx={{ minWidth: 220 }}
    >
      <option value="">{none}</option>
      <optgroup label="Income">
        {ledger.categories.income.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Spending">
        {ledger.categories.spending.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </optgroup>
    </TextField>
  );
}
