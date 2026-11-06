# Adding a bank

Kanakku knows a bank through a plug-in. A plug-in teaches two things: how to read the bank's statement files, and what the bank's wording means. Everything else is shared by all banks: accounts, cards, fixed deposits, currencies, transfers and valuation.

## Layout

```
packages/core/src/banks/<id>/
  index.ts             the BankPlugin
  <format>.ts          one file per statement format
  wording.ts           wording rules
packages/core/test/fixtures/<id>/   made-up sample files
packages/core/test/<id>.test.ts
```

Add the plug-in to `bankPlugins` in `packages/core/src/banks/registry.ts`.

## The plug-in

```ts
export const mybank: BankPlugin = {
  id: 'mybank',               // used in config and ids
  name: 'My Bank PLC',
  shortName: 'MyBank',        // used in folder and file names
  country: 'LK',
  formats: [mybankAccountCsv],
  wording: mybankWording,
  transferFees: { LKR: ['25'] }, // usual transfer fees, in normal units
};
```

## A statement format

- `detect(file)` returns a confidence from 0 to 1, read from the file's content. Return `null` when the file is not yours. Be strict: when two formats claim a file equally, Kanakku cannot read it.
- `parse(file)` returns the rows as the bank wrote them, in file order. Each row has a date (`YYYY-MM-DD`), the description, the amount as a decimal string (positive is money in), the running balance when the file has one, and a reference when there is one. Also return what the file says about the account (number, masked number, currency, type), the period, the closing balance, when the file was generated, and the bank's own totals.
- A row that cannot be read gets a `bad-row` warning with its line, and parsing goes on. When more than a fifth of the rows fail, the file is marked unreadable.
- Do not match, merge or classify rows. The engine does that for every bank.

## Wording rules

- Each rule is a pattern and what it means: `interest`, `tax`, `fee`, `cash`, `purchase`, `opening-deposit`, `card-payment`, `transfer-hint`, or a fixed-deposit event (`deposit-placement`, `deposit-return`, `deposit-interest`, `deposit-closure`).
- Use the named group `deposit` for a deposit number and `counterparty` for the other party's name.
- Use `direction` and `accountTypes` to keep a rule precise. Put specific rules before general ones.
- Write rules from description patterns only. Never put names or account numbers in a rule.

## Fixtures and tests

- Use made-up files only. Copy the bank's layout, not your data: names like `A PERERA`, numbers like `0012345678`.
- The pre-commit hook blocks statement files outside `fixtures/`, and any line listed in your local, git-ignored `.private-strings` file. List your own account numbers and name there.
- Test detection (including that the format does not claim other banks' files), the header fields, the rows, a bad row, and every wording rule.

## Try it on your own files

```
kanakku report --data <your data folder>
```

The report runs the whole engine and prints accounts, coverage, net worth, cash flow, transfers, conversions, cards, Needs you and tidy-up suggestions. It reads `<data folder>/kanakku/config.yaml`; see `config.example.yaml`.
