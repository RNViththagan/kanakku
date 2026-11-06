# Kanakku core engine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@kanakku/core`: the pure engine that turns statement files, a config and saved answers into one ledger, plus the views, tidy-up planner and rate parsers the server and web app will use.

**Architecture:** A pnpm workspace with one package in this plan, `packages/core`. Pure TypeScript with no Node or browser APIs, tested with Vitest against synthetic fixtures. `buildLedger(input)` runs the whole pipeline: detect, parse, assign, order, merge, coverage, classify, pair answers, deposits, transfers, cards, defaults, conversions, Needs you. A dev-only report script runs the engine on a real data folder.

**Tech Stack:** TypeScript 7.0.2, Vitest 5.0.5, Biome 2.6.4, yaml 2.9.1, zod 4.6.7, tsx 4.23.15 (scripts only), simple-git-hooks 2.14.0, pnpm 10.28.1, Node 22.

**Spec:** `docs/specs/2026-11-06-kanakku-design.md`. Later plans cover the server (`packages/server`) and the web app (`packages/web`).

**Revision:** v2, after a Fable review. It fixes account assignment for new accounts, inferred periods, card refunds and interest, card sign in net worth, answer precedence, fixture configs, a JSON-safe ledger, merge newness, chain breaks, folder awareness, card cycles, failed rows, ordering, ties and integer rates.

## Global Constraints

- Core uses no Node or browser APIs. JavaScript built-ins (`Date.UTC`, `Intl`, `BigInt`) are fine. `packages/core/tsconfig.json` sets `types: []` so a Node API fails the type check.
- Money is an integer number of minor units with a currency. Never a float. Config amounts are written in normal units and converted on load.
- Rates are integers in millionths (`micro`). Multiplication uses `BigInt`. Rounding is half away from zero.
- Dates are `YYYY-MM-DD` strings with no time zone.
- No bank names, countries, currencies or people outside `src/banks/<id>/`, `src/rates/<id>.ts` and test fixtures. The only currency table in core is ISO 4217 minor units.
- `Ledger` is plain data: it must survive `JSON.stringify` and `JSON.parse` unchanged.
- Every `package.json` dependency uses an exact version (no `^` or `~`).
- No code comments unless the reason is non-obvious, and then one short line.
- Only synthetic data in the repository. Fixtures use made-up names and numbers.
- Commit messages: `<Verb> <description>`, sentence case, no prefix, no AI attribution. Commit at the end of each task and push.

## Review Focus

1. **A CSV re-saved by a spreadsheet app** (dates rewritten as `M/D/YYYY`, quotes dropped): impossible dates must fail loudly, and a file where most rows fail must become unreadable, never silently mis-dated. Test in Task 5 (`rejects impossible dates and marks the file unreadable`).
2. **A statement with no transactions** (an HNB month with only the closing row): coverage and balances still work. Tests in Task 7 and Task 13.
3. **A file that fits more than one account, or none** (same masked digits, two cards with no numbers, a second account at the same bank): ask, never pick one. Tests in Task 10.
4. **Negative balances** (overdrafts, a card in credit): parsing, ordering and the chain work below zero. Test in Task 11 (`orders rows through a negative balance`).
5. **A same-day reversal** (a debit and a credit of the same amount on one account): both rows stay, and they never pair as a transfer. Tests in Task 12 and Task 15.

## File structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.json, biome.json, vitest.config.ts, .nvmrc
.github/workflows/ci.yml
scripts/check-private.mjs, scripts/check-private.test.ts
config.example.yaml
docs/adding-a-bank.md
packages/core/
  package.json, tsconfig.json, tsconfig.test.json
  scripts/report.ts                      dev-only, uses Node fs
  src/index.ts                           public exports
  src/model/{types,money,dates,hash}.ts
  src/parse/csv.ts
  src/banks/{types,registry,wording}.ts
  src/banks/boc/{index,account-csv,wording}.ts
  src/banks/combank/{index,account-csv,card-csv,wording}.ts
  src/banks/hnb/{index,account-csv,wording}.ts
  src/config/{schema,load,defaults}.ts
  src/decisions/load.ts
  src/ledger/{detect,checks,assign,order,merge,coverage,classify,transfers,deposits,cards,valuation,needs,build,types}.ts
  src/views/{balances,net-worth,cash-flow,spending,transfers}.ts
  src/tidy/{names,plan}.ts
  src/rates/{types,csv,hnb,numbers-lk,registry}.ts
  test/fixtures/{boc,combank,hnb,ledger,rates}/...
  test/*.test.ts
```

---

### Task 1: Workspace, tooling and the privacy guard

Done in commit `893f0d8`: workspace, Biome, Vitest, TypeScript, CI, `scripts/check-private.mjs` as the pre-commit hook. Task 19 extends the guard to allow fixture configs.

### Task 2: Money, dates and ids

**Files:**
- Create: `packages/core/src/model/{types,money,dates,hash}.ts`, `packages/core/test/{money,dates,hash}.test.ts`

**Interfaces:**
- Produces:
  - `type IsoDate = string; type CurrencyCode = string; type AccountType = 'savings' | 'current' | 'credit-card' | 'fixed-deposit'; type Kind = 'income' | 'spending' | 'transfer' | 'other'`.
  - `minorUnits(currency: CurrencyCode): number` (ISO 4217; default 2).
  - `normalizeAmount(text: string): string | undefined` returns a plain signed decimal string.
  - `decimalToMinor(decimal: string, currency: CurrencyCode): number` (half away from zero beyond the currency's places).
  - `minorToDecimal(minor: number, currency: CurrencyCode): string`.
  - `majorToMinor(major: number, currency: CurrencyCode): number` for config values, through `String(major)` and `decimalToMinor`.
  - `formatAmount(minor: number, currency: CurrencyCode, locale: string): string` (grouped, fixed places, no symbol).
  - `parseYmd`, `parseDmy` (`DD/MM/YYYY`), `parseDmyDash` (`DD-MM-YYYY`), `parseMdyShort` (`M/D/YY`), `parseDayMonthName` (`06 Nov 2026`): each `(text: string) => IsoDate | undefined`, rejecting impossible dates.
  - `addDays(d: IsoDate, n: number): IsoDate`, `diffDays(a: IsoDate, b: IsoDate): number` (b minus a), `daysInMonth(year: number, month: number): number`, `clampDate(year: number, month: number, day: number): IsoDate`, `monthKey(d: IsoDate): string`, `startOfMonth(d: IsoDate): IsoDate`, `endOfMonth(d: IsoDate): IsoDate`, `addMonths(year: number, month: number, n: number): { year: number; month: number }`.
  - `hashText(text: string): string`: 64-bit FNV-1a, 16 lowercase hex characters.

- [ ] **Step 1: Write the failing tests**:
  - `normalizeAmount('"1,397,855.95"') === '1397855.95'`, `('25') === '25'`, `('') === undefined`, `('(12.50)') === '-12.50'`, `('-1,000.00') === '-1000.00'`, `('abc') === undefined`, `('—') === undefined`.
  - `decimalToMinor('1397855.95','LKR') === 139785595`, `('25','LKR') === 2500`, `('0.385','USD') === 39`, `('-0.385','USD') === -39`, `('1500','JPY') === 1500`, `('-12.5','USD') === -1250`.
  - `minorToDecimal(-1250,'USD') === '-12.50'`, `majorToMinor(300000,'LKR') === 30000000`, `majorToMinor(0.1,'USD') === 10`, `formatAmount(139785595,'LKR','en-US') === '1,397,855.95'`.
  - `parseDmy('07/10/2026') === '2026-10-07'`, `parseDmy('31/02/2026') === undefined`, `parseDmy('13/25/2026') === undefined`, `parseDmyDash('06-11-2026') === '2026-11-06'`, `parseMdyShort('11/6/26') === '2026-11-06'`, `parseDayMonthName('06 Nov 2026') === '2026-11-06'`.
  - `addDays('2026-02-28',1) === '2026-03-01'`, `diffDays('2026-10-30','2026-11-02') === 3`, `daysInMonth(2028,2) === 29`, `clampDate(2026,2,30) === '2026-02-28'`, `addMonths(2026,12,1)` is `{ year: 2027, month: 1 }`.
  - `hashText('a') !== hashText('b')`, matches `/^[0-9a-f]{16}$/`, same input gives the same output.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/money.test.ts packages/core/test/dates.test.ts packages/core/test/hash.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in the files above. Date math through `Date.UTC` day numbers. Decimal conversion by string arithmetic, never `parseFloat`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `Add money, date and id helpers`.

### Task 3: CSV reader

**Files:**
- Create: `packages/core/src/parse/csv.ts`, `packages/core/test/csv.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): string[][]`. Removes a byte order mark, accepts `\n`, `\r\n` and `\r`, handles quoted fields with commas, doubled quotes and newlines, keeps cells untrimmed, keeps a last row without a final newline, drops one trailing empty line.

- [ ] **Step 1: Write the failing tests**: `parseCsv('a,b\n1,"2,3"\n')` gives `[['a','b'],['1','2,3']]`; `'x,"l1\nl2",y'` gives `[['x','l1\nl2','y']]`; `'"he said ""hi""",z'` gives `[['he said "hi"','z']]`; `'﻿a,b\r\n1,2'` gives `[['a','b'],['1','2']]`; `',,'` gives `[['','','']]`; `'a\n\nb'` keeps the empty middle row as `['']`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/csv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** a single-pass state machine.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add CSV reader`.

### Task 4: Plug-in contract, wording matcher and detection

**Files:**
- Create: `packages/core/src/banks/{types,wording,registry}.ts`, `packages/core/src/ledger/detect.ts`, `packages/core/test/{detect,wording}.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces (in `banks/types.ts`):
  - `FileInput { path: string; name: string; text: string; folderBank?: string }`. `folderBank` is the bank id of the configured folder the server found the file in.
  - `ParsedRow { line: number; date: IsoDate; description: string; amount: string; balance?: string; reference?: string; raw: string[] }` (decimal strings from `normalizeAmount`, converted once the currency is known).
  - `Period { from: IsoDate; to: IsoDate }`.
  - `ParsedStatement { account: { number?: string; masked?: string; numberHint?: string; currency?: CurrencyCode; type?: AccountType }; period?: Period & { inferred?: boolean }; closing?: { date: IsoDate; balance: string }; generatedAt?: IsoDate; rows: ParsedRow[]; checks?: { credits?: string; debits?: string; creditCount?: number; debitCount?: number }; issues: Issue[] }`.
  - `Issue { level: 'info' | 'warning' | 'error'; code: string; message: string; file?: string; line?: number; account?: string; date?: IsoDate }`.
  - `StatementFormat { id: string; fileTypes: string[]; accountTypes: AccountType[]; detect(file: FileInput): number | null; parse(file: FileInput): ParsedStatement }`.
  - `WordingTag = 'interest' | 'tax' | 'fee' | 'cash' | 'purchase' | 'opening-deposit' | 'card-payment' | 'transfer-hint' | 'deposit-placement' | 'deposit-return' | 'deposit-interest' | 'deposit-closure'`.
  - `WordingRule { tag: WordingTag; pattern: RegExp; direction?: 'in' | 'out'; accountTypes?: AccountType[] }`. Named groups `deposit` and `counterparty` capture a deposit number and a counterparty text.
  - `BankPlugin { id: string; name: string; shortName: string; country?: string; formats: StatementFormat[]; wording: WordingRule[]; transferFees?: Partial<Record<CurrencyCode, string[]>> }` (fees as decimal strings in normal units).
- Produces: `matchWording(description: string, direction: 'in' | 'out', accountType: AccountType, rules: WordingRule[]): { tags: WordingTag[]; deposit?: string; counterparty?: string }`; `bankPlugins: BankPlugin[]`, `findBank(id: string): BankPlugin | undefined`; `detectFormat(file: FileInput, plugins: BankPlugin[]): { plugin: BankPlugin; format: StatementFormat; confidence: number } | { unreadable: 'no-match' | 'tie' }`.

- [ ] **Step 1: Write the failing tests** with fake plug-ins: highest confidence wins; best below 0.5 gives `no-match`; equal best gives `tie`; a `detect` that throws counts as `null`. `matchWording` returns every matching tag in rule order, respects `direction` and `accountTypes`, and returns the first `deposit` and `counterparty` groups.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/detect.test.ts packages/core/test/wording.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `bankPlugins` starts empty and gains one line per bank in Tasks 5 to 7.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `Add bank plug-in contract and format detection`.

### Task 5: Bank of Ceylon plug-in and parse checks

**Files:**
- Create: `packages/core/src/banks/boc/{index,account-csv,wording}.ts`, `packages/core/src/ledger/checks.ts`, `packages/core/test/fixtures/boc/{account,resaved}.csv`, `packages/core/test/boc.test.ts`

**Interfaces:**
- Produces: `boc: BankPlugin` (`id 'boc'`, `shortName 'BOC'`, `country 'LK'`, format `boc-account-csv` for `savings` and `current`).
- Produces in `checks.ts`: `verifyChecks(parsed: ParsedStatement, currency: CurrencyCode): Issue[]` (code `totals-mismatch`); `UNREADABLE_SHARE = 0.2`; `applyUnreadableShare(parsed: ParsedStatement): ParsedStatement`, which adds an `error` issue `unreadable` and empties `rows` when `bad-row` issues exceed that share of data rows.
- Parser rule for every plug-in: a data row that fails (bad date, bad amount) adds a `warning` issue `bad-row` with its line and is skipped. Parsers never stop at a bad row.

- [ ] **Step 1: Write the fixture** `account.csv` in the Appendix A.1 layout: account `0012345678`, LKR, period 2026-01-01 to 2026-03-31, 12 rows newest first with true running balances, summary totals matching the rows, made-up merchants. `resaved.csv` is the same table with dates rewritten as `M/D/YYYY`.
- [ ] **Step 2: Write the failing tests**:
  - `detects its own file`: confidence ≥ 0.9; `null` for an HNB-layout string.
  - `reads the header`: number `0012345678`, currency `LKR`, period `{ from: '2026-01-01', to: '2026-03-31' }`, `generatedAt` from `Generated On`.
  - `reads rows in file order`: first row's date, `amount` (credit minus debit) and `balance` as decimal strings.
  - `checks totals`: `verifyChecks` is empty for the fixture and returns `totals-mismatch` when one amount is edited.
  - `rejects impossible dates and marks the file unreadable`: after `applyUnreadableShare`, `resaved.csv` has an `unreadable` error and no rows; a file with one bad row in twelve keeps eleven rows and one `bad-row` warning.
  - Wording: `INTEREST WITHHELD` out gives `tax` and not `interest`; `INTEREST PAY SYS-GEN` in gives `interest`; `ATM SERVICE CHARGE`, `SMS ALERT MONTHLY` and `MINIMUM BALANCE CHARGE-SAVINGS` give `fee`; `ATMCASHWDL...` gives `cash`; `SAVINGS DEPOSIT` in gives `cash`; `POS ...` and `ECOMMERCE ...` give `purchase`; `Initial Deposit` gives `opening-deposit`; `CEFT...` gives `transfer-hint`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/boc.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Find the table by its header row, read key-value lines above it, read summary totals into `checks`. Add `boc` to `bankPlugins`. Wording comes from description patterns only, never from names or numbers.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add Bank of Ceylon statement plug-in`.

### Task 6: Commercial Bank plug-in

**Files:**
- Create: `packages/core/src/banks/combank/{index,account-csv,card-csv,wording}.ts`, `packages/core/test/fixtures/combank/transaction_history_0087654321_20260401.csv`, `packages/core/test/fixtures/combank/transactions_history_current_period.csv`, `packages/core/test/combank.test.ts`

**Interfaces:**
- Produces: `combank: BankPlugin` (`id 'combank'`, `shortName 'ComBank'`, `country 'LK'`, formats `combank-account-csv` for `savings` and `current`, `combank-card-csv` for `credit-card`).

- [ ] **Step 1: Write the fixtures** in the Appendix A.2 layouts with the footer, including the multi-line quoted address. Card rows out of date order, each with a 12-digit reference, footer `Generated at 2/6/26 2:57 PM`.
- [ ] **Step 2: Write the failing tests**:
  - Each format detects its own file at ≥ 0.9, and the account format scores the card file lower than the card format does.
  - Account: currency `LKR` from rows, `generatedAt '2026-04-01'` from `Generated at 4/1/26 9:15 AM`, `numberHint '0087654321'` from the file name, no `period`, footer lines not read as rows and not counted as bad rows.
  - Card: `type 'credit-card'`, `reference` is the 12-digit part, debit gives a negative amount, rows kept in file order, `generatedAt '2026-02-06'`.
  - A bad row in the middle of the table gives one `bad-row` warning and every other row is kept.
  - Wording: `ADVANCE INCOME TAX` gives `tax`; `IB CEFT CHGS` gives `fee`; `TRF TO: 003012345678 / ...` out gives `deposit-placement` with deposit `003012345678`; `IB Time Redemption Deposit` gives `deposit-return`; `Principal from eFD:003012345678` gives `deposit-return` with that deposit; `Interest from eFD:003012345678` gives `deposit-interest` with that deposit; `INITIAL DEP` gives `opening-deposit`; `CEFT` gives `transfer-hint`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/combank.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Locate columns by trimmed header names, not positions. The table ends at the row with a cell starting `Generated at`, or at an all-empty row. Add `combank` to `bankPlugins`.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add Commercial Bank statement plug-ins`.

### Task 7: Hatton National Bank plug-in

**Files:**
- Create: `packages/core/src/banks/hnb/{index,account-csv,wording}.ts`, `packages/core/test/fixtures/hnb/{lkr-2026-03,usd-2026-03,empty-2026-04,no-interest-2026-05}.csv`, `packages/core/test/hnb.test.ts`

**Interfaces:**
- Produces: `hnb: BankPlugin` (`id 'hnb'`, `shortName 'HNB'`, `country 'LK'`, format `hnb-account-csv` for `savings` and `current`, `transferFees: { LKR: ['25'] }`).

- [ ] **Step 1: Write the fixtures** in the Appendix A.3 layout, without a final newline. The LKR and USD files share one `Ref.No` on a conversion (USD out, LKR in). The empty month has only the header and the closing row. The no-interest month has rows but no interest row, and one row with an empty description.
- [ ] **Step 2: Write the failing tests**:
  - Detects at ≥ 0.9 with headers matched trimmed; `null` for the BOC fixture.
  - `masked '12345XXXXX67'` from the interest row; `closing { date: '2026-03-31', balance: '1203.04' }`; rows oldest first with `reference`.
  - `period { from: '2026-03-01', to: '2026-03-31', inferred: true }` when every row is in the closing month; no `period` when a row falls outside it.
  - Empty month: no rows, `period { from: '2026-04-01', to: '2026-04-30', inferred: true }`, closing balance kept.
  - No-interest month: no `masked`, the empty-description row is kept with description `''`.
  - Wording: `Dr. Tran for funding A/c 123456789012` gives `deposit-placement` with deposit `123456789012`; `123456789012 : Closure Proceeds` gives `deposit-closure` with that deposit; `<masked>:Int.Pd:` gives `interest`; `Finacle Alert Charges`, `MB/IB FEE`, `MB/IB Bi Annual Fee`, `COUNTER WITHDRAWAL CHGS` give `fee`; `MB:` and `CEFT-` give `transfer-hint`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/hnb.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** and add `hnb` to `bankPlugins`. The `BALANCE AS AT DATE` row ends the table.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add Hatton National Bank statement plug-in`.

### Task 8: Config

**Files:**
- Create: `packages/core/src/config/{schema,load,defaults}.ts`, `packages/core/test/config.test.ts`, `config.example.yaml`
- Modify: `packages/core/package.json` (dependencies `yaml 2.9.1`, `zod 4.6.7`)

**Interfaces:**
- Consumes: `findBank`, `majorToMinor`, `decimalToMinor`.
- Produces:
  - `Account { id: string; name: string; bank: string; type: AccountType; currency: CurrencyCode; number?: string; opened?: IsoDate; closed?: IsoDate; card?: { statementDay: number; dueDay: number; limit?: number; openingOwed: number }; deposit?: { principal?: number; start?: IsoDate; months?: number; rate?: number; maturity?: IsoDate }; discovered?: boolean }` (money in minor units).
  - `UserRule { match: { text: string } | { regex: string }; account?: string; direction?: 'in' | 'out'; min?: number; max?: number; kind?: 'income' | 'spending' | 'other'; category?: string }` (`min` and `max` in minor units of the row's currency).
  - `Config { version: 1; homeCurrency: CurrencyCode; locale: string; folders: Array<{ path: string; bank: string }>; accounts: Account[]; you: { names: string[] }; transfers: { windowDays: number; fees: Record<CurrencyCode, number[]> }; rates: { source: string; options: Record<string, string>; manual: Record<CurrencyCode, string> }; categories: { income: string[]; spending: string[] }; rules: UserRule[] }`.
  - `ConfigError { line?: number; path: string; message: string }`, `loadConfig(text: string, banks?: BankPlugin[]): { config?: Config; errors: ConfigError[] }`, `DEFAULT_CATEGORIES`.
- Defaults: `locale 'en-US'`, `windowDays 3`, `rates.source 'off'`, `you.names []`, categories from spec 12.2 (Refunds is a spending category). `transfers.fees` is the config list merged with every plug-in's `transferFees`, each converted with `decimalToMinor` in its currency. `rates.manual` values are kept as decimal strings (`String(n)` of the YAML number).

- [ ] **Step 1: Write the failing tests**: `config.example.yaml` loads with no errors; card `limit: 300000` becomes `30000000`; plug-in fee `'25'` for LKR appears as `2500` in `transfers.fees.LKR`; an unknown bank gives an error naming its line; `currency: LK` gives `accounts[1].currency must be a 3-letter code` with the right line; duplicate account ids give an error; a YAML syntax error gives its line; a missing `version` gives an error; `statementDay: 32` gives an error; a rule with `kind: transfer` gives an error.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/config.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `yaml` (`parseDocument` plus `LineCounter` for lines) and zod for shape. Map each zod issue path to the YAML node's line; fall back to the nearest parent node.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add config loading and validation`.

### Task 9: Saved answers

**Files:**
- Create: `packages/core/src/decisions/load.ts`, `packages/core/test/decisions.test.ts`

**Interfaces:**
- Produces: `Decision` as a union on `type`: `file-account { file: string; account: string }` (file is the content hash), `pair { out: string; in: string }`, `not-transfer { txn: string; with?: string }`, `set { txn: string; kind?: Kind; category?: string }`, `counterparty { text: string; mine: boolean; account?: string }`, `fd-principal { deposit: string; principal: string }` (deposit account id, principal as a decimal string in normal units), `dismiss { item: string }`. Every decision also has `id: string` and `at: string`. `loadDecisions(text: string): { decisions: Decision[]; errors: ConfigError[] }`, `serializeDecisions(decisions: Decision[]): string`.

- [ ] **Step 1: Write the failing tests**: each type round-trips through serialize and load; an unknown type gives an error with its line; an empty file gives no decisions.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/decisions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add saved answers format`.

### Task 10: Tidy names and assigning files to accounts

**Files:**
- Create: `packages/core/src/tidy/names.ts`, `packages/core/src/ledger/assign.ts`, `packages/core/test/{names,assign}.test.ts`

**Interfaces:**
- Produces in `tidy/names.ts`: `parseTidyName(name: string): { bank: string; label: string; currency?: CurrencyCode; from: IsoDate; to: IsoDate; partial: boolean } | undefined`; `tidyName(input: { bankShort: string; account: Account; accountsAtBank: Account[]; period: Period; partial?: boolean; ext: string }): string`.
  - Pattern: `{bank}_{label}[_{currency}]_{from}_to_{to}[_partial].{ext}`. `label` is the account number when known, else the type label (`Savings`, `Current`, `CreditCard`, `FixedDeposit`); when another account at the bank would get the same label, `{TypeLabel}-{id}`. `currency` appears when the bank's accounts use more than one currency.
- Produces in `ledger/assign.ts`: `maskFits(a: string, b: string): boolean` (equal length; `X` or `*` on either side matches any character); `assignAccount(input: { parsed: ParsedStatement; file: FileInput; plugin: BankPlugin; format: StatementFormat; accounts: Account[]; decisions: Decision[]; fileHash: string }): { account: Account; via: 'number' | 'masked' | 'file-name' | 'tidy-name' | 'answer' | 'only-account' } | { ask: 'pick-account'; candidates: string[] } | { ask: 'new-account'; proposal: Partial<Account> }`.
- Order: number, masked, answer, file name, tidy name, only account, ask. When the file states a number or masked number that fits no account, only the answer rule may still assign it; otherwise the result is `new-account`.

- [ ] **Step 1: Write the failing tests**:
  - Names: `BOC_0012345678_2026-01-01_to_2026-03-31.csv`; `HNB_12345XXXXX67_USD_2026-03-01_to_2026-03-31.csv` when the bank holds two currencies, no currency part when it holds one; `ComBank_CreditCard_2026-10-06_to_2026-11-05.csv` and its `_partial` form; two cards with no numbers give `ComBank_CreditCard-<id>_...`; `parseTidyName` reverses each of these.
  - One test per assignment rule, in order of precedence.
  - `a file with an unknown number is not given to the bank's only account`: it returns `new-account` with bank, number, currency and type filled in.
  - `asks when a masked number fits two accounts`.
  - `asks when two cards at the bank have no numbers`.
  - `maskFits('12345XXXXX67','12345XXXXX67')` and `maskFits('123456789067','12345XXXXX67')` are true; different lengths are false.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/names.test.ts packages/core/test/assign.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `Add tidy names and statement to account assignment`.

### Task 11: Time order

**Files:**
- Create: `packages/core/src/ledger/order.ts`, `packages/core/test/order.test.ts`

**Interfaces:**
- Produces: `MoneyRow = Omit<ParsedRow, 'amount' | 'balance'> & { amount: number; balance?: number; file: string }`, `toMoneyRows(rows: ParsedRow[], currency: CurrencyCode, file: string): MoneyRow[]`, `toChronological(rows: MoneyRow[]): { rows: MoneyRow[]; direction: 'oldest-first' | 'newest-first' | 'unknown'; issues: Issue[] }`.
- Algorithm: vote on neighbour pairs, skipping zero-amount rows (forward: `b.balance = a.balance + b.amount`; backward: `a.balance = b.balance + a.amount`). Reverse when newest first wins. Stable-sort by date. For each day whose links break, try orders of that day's rows anchored on the previous day's last balance and the next day's first opening (permutations up to 7 rows; above that a greedy walk). A day nothing fixes keeps file order and adds an `info` issue `order-unresolved`.

- [ ] **Step 1: Write the failing tests** (minor units):
  - Newest first `[{03-02,-500,9500},{03-02,-1000,10000},{03-01,+11000,11000}]` becomes `+11000, -1000, -500`.
  - Oldest first stays as is.
  - `fixes a file that is newest first across days but oldest first within a day`.
  - `anchors a same-day reversal on its neighbours`: `+1000` and `-1000` on one day between days with balances 5000 and 5000 keep the order that matches the following day.
  - `orders rows through a negative balance`: balances `500, -300, 200`.
  - Zero-amount rows do not change the vote.
  - Without balances: stable sort by date.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/order.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add statement row ordering by running balance`.

### Task 12: Merge overlapping statements

**Files:**
- Create: `packages/core/src/ledger/merge.ts`, `packages/core/test/merge.test.ts`

**Interfaces:**
- Consumes: `MoneyRow`, `toChronological`, `hashText`.
- Produces:
  - `Transaction { id: string; account: string; date: IsoDate; amount: number; currency: CurrencyCode; balance?: number; description: string; reference?: string; counterparty?: string; sources: Array<{ file: string; line: number }>; kind: Kind | ''; category: string; tags: WordingTag[]; deposit?: string; decidedBy?: 'answer' | 'rule' | 'wording' | 'match' | 'default'; parts: Part[]; transfer?: string; flag?: 'waiting' | 'possible' | 'ambiguous' }`, `Part { kind: Kind; category: string; amount: number }`.
  - `ChainBreak { account: string; before: { date: IsoDate; file: string; balance: number }; after: { date: IsoDate; file: string; amount: number; balance: number } }`.
  - `mergeAccountFiles(account: string, currency: CurrencyCode, files: Array<{ path: string; newness: IsoDate; rows: MoneyRow[] }>): { transactions: Transaction[]; breaks: ChainBreak[] }`.
- `newness` is computed by the caller as `generatedAt ?? period.to ?? last row date`. Ties break by path, so results never depend on input order.
- New transactions start with `kind ''`, `category ''`, `tags []`, `parts []`.

- [ ] **Step 1: Write the failing tests**:
  - Overlapping files (Jan to Feb, Feb to Mar) give each February row once, with both sources.
  - Two identical purchases on one day in one file stay two; the same pair in both files still gives two, not four.
  - Card rows (no balance) merge by reference.
  - Ids stay the same when the files are passed in a different order, and when a new overlapping file is added.
  - `keeps a same-day reversal`: a debit and a credit of 1,000 on one day both stay.
  - Each kept row takes its balance from the newest file that has it; equal newness picks by path.
  - `flags files that disagree inside their overlap`: a row only the older file has gives one `ChainBreak` naming the files and dates on both sides, and later rows are not duplicated.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/merge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Key: `date|amount|r:<reference>|d:<lowercased, single-spaced description>`, with the reference part empty when the row has none. The running balance is never part of the key. Keep the largest count per key across files. Order the union by date, then fix days as in Task 11. Never drop a row to repair the chain.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add merging of overlapping statements`.

### Task 13: Coverage

**Files:**
- Create: `packages/core/src/ledger/coverage.ts`, `packages/core/test/coverage.test.ts`

**Interfaces:**
- Consumes: `parseTidyName`, `ChainBreak`.
- Produces: `filePeriod(parsed: ParsedStatement, fileName: string, rows: MoneyRow[]): (Period & { source: 'stated' | 'tidy-name' | 'inferred' | 'rows' }) | undefined`; `CoverageSegment { from: IsoDate; to: IsoDate; state: 'covered' | 'quiet' | 'missing' }`; `AccountCoverage { segments: CoverageSegment[]; firstKnown?: IsoDate; lastCovered?: IsoDate; behindDays?: number; brokenChains: ChainBreak[] }`; `accountCoverage(input: { account: Account; files: Array<{ path: string; period: Period; closing?: { date: IsoDate; balance: number } }>; transactions: Transaction[]; breaks: ChainBreak[]; today: IsoDate }): AccountCoverage`. `BEHIND_DAYS = 7`, `GENERATED_GRACE_DAYS = 7`.
- `filePeriod` order: stated, tidy name, inferred, rows. With source `rows`, `to` moves to `generatedAt` when that is at most `GENERATED_GRACE_DAYS` after the last row.
- A break inside covered time goes to `brokenChains`. A break across a hole makes that hole `missing`. A hole whose chain holds is `quiet`. `firstKnown` is the start of the first covered segment. A closed account is never behind and has no holes after `closed`.

- [ ] **Step 1: Write the failing tests**:
  - Period source order; `to` moves to a generation day 2 days after the last row but not to one 200 days after.
  - Overlapping and touching periods join.
  - A hole with matching balances (closing 1,000.00 before, opening 1,000.00 after) is `quiet`; with a break across it, `missing`.
  - A break inside covered time lands in `brokenChains` and leaves segments `covered`.
  - A month with no rows but a closing balance counts as covered.
  - `opened` before the first file with a zero opening balance is `quiet`, otherwise `missing`.
  - `behindDays` is 9 when the last covered day is 2026-10-28 and today is 2026-11-06; a closed account has none.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/coverage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Cards are handled in Task 17.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add statement coverage and missing periods`.

### Task 14: Classify

**Files:**
- Create: `packages/core/src/ledger/classify.ts`, `packages/core/test/classify.test.ts`

**Interfaces:**
- Produces:
  - `classify(txns: Transaction[], ctx: { accounts: Account[]; banks: BankPlugin[]; rules: UserRule[]; decisions: Decision[]; categories: Config['categories'] }): Transaction[]`. Sets `tags`, `deposit` and `counterparty` on every row. Settles rows (sets `kind`, `category`, `decidedBy`, `parts` of one whole part) in this order: a `set` answer that has a `kind`; a user rule; a wording tag that settles; a zero amount (`other`, `decidedBy 'default'`).
  - `applyDefaults(txns: Transaction[], accounts: Account[]): Transaction[]` for rows still unsettled after matching: on a credit-card account money in is `spending`, Refunds (negative); elsewhere money in is `income`, Other income and money out is `spending`, Uncategorised.
  - `applyCategoryAnswers(txns: Transaction[], decisions: Decision[]): Transaction[]` for `set` answers with only a `category`: it sets the category of the row's non-transfer part and leaves the kind alone.
- Wording meanings: `interest` and `deposit-interest` in give income, Interest; `interest` out gives spending, Fees; `tax` gives spending, Tax; `fee` gives spending, Fees; `cash` out gives spending, Cash; `cash` in and `opening-deposit` give `other`. `purchase`, `card-payment`, `transfer-hint` and the other deposit tags settle nothing here.
- A user rule with only a category takes its kind from the category lists.

- [ ] **Step 1: Write the failing tests**: a `set` answer with a kind beats a matching rule; a rule beats wording; text rules are case-insensitive substring matches and regex rules case-insensitive; `account`, `direction`, `min` and `max` filter; a category-only rule takes its kind from the lists; each wording meaning above; transfer hints stay unsettled; card interest (money out) is spending, Fees; `applyDefaults` gives a card credit spending, Refunds with its negative amount; zero-amount rows are `other`; `applyCategoryAnswers` recategorises the fee part of a split row and keeps its transfer part.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/classify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add transaction classification`.

### Task 15: Transfers between own accounts

**Files:**
- Create: `packages/core/src/ledger/transfers.ts`, `packages/core/test/transfers.test.ts`

**Interfaces:**
- Produces:
  - `Transfer { id: string; out?: string; in?: string; from: string; to: string; date: IsoDate; amountOut: number; currencyOut: CurrencyCode; amountIn?: number; currencyIn?: CurrencyCode; fee: number; rule: 'reference' | 'exact' | 'fee' | 'answer' | 'wording' | 'deposit' | 'counterparty'; status: 'matched' | 'confirmed' | 'one-sided' }`. `amountOut` is the outgoing row's full amount; `amountIn` is what arrived.
  - `applyPairAnswers(txns: Transaction[], decisions: Decision[]): { txns: Transaction[]; transfers: Transfer[] }`, run before deposits so a `pair` answer always wins.
  - `matchTransfers(txns: Transaction[], ctx: { accounts: Account[]; windowDays: number; fees: Record<CurrencyCode, number[]>; youNames: string[]; coverage: Record<string, { firstKnown?: IsoDate; lastCovered?: IsoDate }>; decisions: Decision[] }): { txns: Transaction[]; transfers: Transfer[] }`.
- Candidates: rows with no `decidedBy`, a non-zero amount, not tagged `purchase`, and not the outflow of a credit-card account. Matched rows get `kind 'transfer'`, `decidedBy 'match'`, `transfer` and `parts`; a fee becomes a second part (spending, Fees).
- Score: reference +1000, exact +100, fee +50, minus 10 per day apart, +5 when in is on or after out, +3 for a hint on either row, +3 for one of `youNames` in either description.
- Selection, repeated until no free candidate is left: (1) when a free row has exactly one free candidate, accept the best such forced candidate; (2) otherwise take the best-scoring candidate; accept it when no other candidate with the same score shares one of its rows, or when all those candidates join the same two accounts on the same date with the same amount (interchangeable, paired in file order); (3) otherwise flag every row of the tied candidates `ambiguous`.
- Unmatched rows with a hint or a `youNames` hit become: one-sided when the wording or a `counterparty` answer names one of your accounts that has no statement for that date; `waiting` when the window reaches past `lastCovered` of another open account that has statements; `possible` otherwise. A `counterparty` answer with `mine: false` leaves its rows unflagged.

- [ ] **Step 1: Write the failing tests** (amounts in normal units here, minor units in code):
  - Exact: out 40,000 on 2026-10-12, in 40,000 on 2026-10-14 in another account: matched, fee 0.
  - Fee on the sender: out 40,025, in 40,000, LKR fees [25]: matched, out row parts are transfer −40,000 and Fees −25.
  - Fee off the receiver: out 8,000, in 7,975: matched, fee 25.
  - Four days apart: no match.
  - Different currencies with the same reference (USD 600.00 out, LKR 180,000.00 in): matched with rule `reference`; different references: no match.
  - Tie: one out of 1,000 and two ins of 1,000 the same day in two accounts: nothing matched, all three flagged `ambiguous`.
  - `resolves forced pairs before declaring a tie`: add a second out that can only reach one of the ins; both outs are matched.
  - `pairs interchangeable transfers`: two outs of 5,000 from A and two ins of 5,000 to B on one day give two transfers and no flags.
  - Waiting: a hint row out of 10,000 on 2026-11-05 while another account's coverage ends 2026-11-03: `waiting`; an account with no statements never causes waiting.
  - Possible: the same row with every other account covered past 2026-11-08: `possible`.
  - A `pair` answer gives `confirmed` and wins over a deposit wording; a `not-transfer` answer blocks the automatic pair; a `set` answer with a kind keeps the row out of matching.
  - `never pairs a same-day reversal` on one account.
  - Outflows of credit-card accounts and rows tagged `purchase` never match automatically.
  - One-sided: a bank out row tagged `card-payment`, with the only card's statements starting later: one-sided transfer to the card.
  - A `counterparty` answer with `mine: true` and an account turns unmatched rows containing its text into one-sided transfers; with `mine: false` the rows are never flagged.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/transfers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add transfer matching between own accounts`.

### Task 16: Fixed deposits

**Files:**
- Create: `packages/core/src/ledger/deposits.ts`, `packages/core/test/deposits.test.ts`

**Interfaces:**
- Produces: `NeedDraft { type: string; key: string; message: string; refs: { file?: string; account?: string; txns?: string[]; date?: IsoDate }; data?: Record<string, unknown> }`; `trackDeposits(txns: Transaction[], ctx: { accounts: Account[]; decisions: Decision[] }): { txns: Transaction[]; accounts: Account[]; transfers: Transfer[]; issues: Issue[]; needs: NeedDraft[] }`. Discovered deposits get `id 'deposit-<bank>-<number>'`; pools get `id 'deposit-<bank>-<currency lowercase>-pool'`.
- Rows already in a transfer (from `applyPairAnswers`) are skipped.

- [ ] **Step 1: Write the failing tests**:
  - A placement with a number creates a discovered deposit in the paying account's bank and currency, and a one-sided transfer with rule `deposit`.
  - A closure of USD 2,021.30 after a placement of 2,000.00 gives parts transfer 2,000.00 and income, Interest 21.30.
  - A closure with no known placement counts whole as principal and adds a `deposit-principal` need; an `fd-principal` answer of `2000.00` splits it.
  - A closure of a config-only deposit (principal 500,000, start 2025-12-01, no placement row) splits by the config principal, and its balance runs from `start`.
  - A return with no number goes to the oldest open deposit at the same bank with the same principal, else to the pool.
  - A config deposit gives an opening balance only when no placement row for it exists, and then no `deposit-principal` need is raised for it.
  - A placement that differs from the config principal keeps the statement amount and adds a `deposit-principal-mismatch` issue.
  - `never goes below zero`: a return of 2,000.00 into a pool that saw 500.00 placed leaves the pool at zero and adds a `deposit-before-statements` need.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/deposits.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add fixed deposit tracking`.

### Task 17: Credit cards

**Files:**
- Create: `packages/core/src/ledger/cards.ts`, `packages/core/test/cards.test.ts`

**Interfaces:**
- Produces: `statementDateIn(year: number, month: number, statementDay: number): IsoDate` (clamped), `cycleFor(date: IsoDate, statementDay: number): Period` (from the day after the previous statement date to the next statement date on or after `date`), `dueDateFor(statementDate: IsoDate, statementDay: number, dueDay: number): IsoDate`, `CardCycle { from: IsoDate; to: IsoDate; statementDate: IsoDate; dueDate: IsoDate; charges: number; credits: number; billed: number; paid: number; paidByDue: number; status: 'open' | 'paid' | 'part-paid' | 'unpaid' | 'overdue'; coverage: 'full' | 'partial' | 'missing' }`, `cardCycles(account: Account, txns: Transaction[], files: Array<{ period: Period; generatedAt?: IsoDate }>, today: IsoDate): CardCycle[]`, `owedOn(account: Account, txns: Transaction[], date: IsoDate): number`.
- `paid` counts credits after the statement date up to the next statement date (or today). Status: `open` until the statement date; `paid` when `billed <= 0` or `paid >= billed`; `overdue` when today is after the due date and `paid < billed`; `part-paid` when `0 < paid < billed`; `unpaid` otherwise.
- A cycle is `partial` when its file's `generatedAt` (else its last row date) is before the cycle's end, and `missing` when no file period touches it.

- [ ] **Step 1: Write the failing tests**:
  - `cycleFor('2026-10-08',5)` and `cycleFor('2026-11-05',5)` give 2026-10-06 to 2026-11-05; `cycleFor('2026-11-06',5)` gives 2026-11-06 to 2026-12-05; `cycleFor('2026-02-15',31)` gives 2026-02-01 to 2026-02-28; `cycleFor('2026-02-28',30)` gives 2026-01-31 to 2026-02-28; `cycleFor('2026-03-01',30)` gives 2026-03-01 to 2026-03-30.
  - `dueDateFor('2026-11-05',5,26) === '2026-11-26'`; `dueDateFor('2026-11-25',25,10) === '2026-12-10'`; `dueDateFor('2026-01-31',31,30) === '2026-02-28'`.
  - Charges of 10,000.00 and 2,500.00 in the 2026-10-06 to 2026-11-05 cycle: on 2026-11-01 `open`; on 2026-11-06 billed 12,500.00, due 2026-11-26, `unpaid`; a payment of 5,000.00 on 2026-11-20 gives `part-paid`; 12,500.00 gives `paid`; on 2026-11-27 with nothing paid, `overdue`; 12,500.00 paid on 2026-11-28 gives `paid` with `paidByDue` 0.
  - A refund lowers the billed amount; `owedOn` adds `openingOwed`.
  - Coverage: a file generated 2026-11-03 for that cycle is `partial`; generated 2026-11-06, `full`; a cycle no file touches, `missing`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add credit card cycles and amounts owed`.

### Task 18: Valuation, conversions and stored rates

**Files:**
- Create: `packages/core/src/ledger/valuation.ts`, `packages/core/src/rates/{types,csv}.ts`, `packages/core/test/{valuation,rates-csv}.test.ts`

**Interfaces:**
- Produces:
  - `RateQuote { currency: CurrencyCode; date: IsoDate; buying: string; selling?: string; source: string }` (decimal strings).
  - `decimalToMicro(decimal: string): number`.
  - `RateUse { micro: number; date: IsoDate; source: string }`.
  - `Conversion { id: string; transfer: string; date: IsoDate; from: string; to: string; amountOut: number; currencyOut: CurrencyCode; amountIn: number; currencyIn: CurrencyCode; micro: number; reference?: string }` (`micro` is units in per unit out).
  - `buildConversions(transfers: Transfer[], txns: Map<string, Transaction>): Conversion[]`.
  - `RateBook { rateOn(currency: CurrencyCode, date: IsoDate): RateUse | undefined; toHome(minor: number, currency: CurrencyCode, date: IsoDate): { value: number; rate?: RateUse } | undefined }`.
  - `makeRateBook(ctx: { home: CurrencyCode; source: string; stored: RateQuote[]; conversions: Conversion[]; manual: Record<CurrencyCode, string> }): RateBook`.
  - `parseRatesCsv(text: string, currency: CurrencyCode): RateQuote[]`, `serializeRatesCsv(quotes: RateQuote[]): string` (columns `date,buying,selling,source`).
- `toHome`: `round(minor × micro × 10^(homePlaces − foreignPlaces) / 10^6)` in `BigInt`, half away from zero.
- `rateOn` order: when `source` is `manual`, the manual rate first. Then the selected source's rate on that day; the nearest earlier stored rate from the selected source; the nearest earlier stored rate from any source; the conversion into home currency nearest in days; the manual rate; otherwise `undefined`. Only conversions into home currency feed the book.

- [ ] **Step 1: Write the failing tests**:
  - A conversion of USD 600.00 to LKR 180,000.00 has `micro` 300000000.
  - Each step of the `rateOn` order, including `manual` first when it is the source.
  - `toHome(125000,'USD',d)` at 328.75 is `41093750`; at `328.123456`, `toHome(100000,'USD',d)` is `32812346`; `toHome(-125000,'USD',d)` is `-41093750`; JPY 1500 at 2.05 is LKR `307500`; a home-currency amount comes back unchanged with no rate.
  - Rates CSV round-trips; an empty `selling` stays `undefined`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/valuation.test.ts packages/core/test/rates-csv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `Add currency valuation, conversions and stored rates`.

### Task 19: Build the ledger

**Files:**
- Create: `packages/core/src/ledger/{types,needs,build}.ts`, `packages/core/src/views/balances.ts`, `packages/core/test/fixtures/ledger/...`, `packages/core/test/ledger.test.ts`
- Modify: `packages/core/src/index.ts`, `.gitignore` (add `!**/fixtures/**/config.yaml`), `scripts/check-private.mjs` and its test (config files are allowed under `fixtures`)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `LedgerInput { files: FileInput[]; config: Config; decisions: Decision[]; rates: RateQuote[]; today: IsoDate; plugins?: BankPlugin[] }`.
  - `FileStatus { path: string; hash: string; bank?: string; format?: string; account?: string; period?: Period; generatedAt?: IsoDate; rows: number; status: 'ok' | 'unreadable' | 'unassigned'; problems: Array<'duplicate' | 'overlapping' | 'improper-name' | 'wrong-folder'>; tidyName?: string; issues: Issue[] }`.
  - `NeedsItem { id: string; type: string; message: string; severity: 'high' | 'normal' | 'low'; refs: NeedDraft['refs']; data?: Record<string, unknown>; actions: string[] }`.
  - `Ledger { today: IsoDate; homeCurrency: CurrencyCode; accounts: Account[]; files: FileStatus[]; transactions: Transaction[]; transfers: Transfer[]; conversions: Conversion[]; coverage: Record<string, AccountCoverage>; cards: Record<string, CardCycle[]>; needs: NeedsItem[]; issues: Issue[]; rates: { source: string; stored: RateQuote[]; manual: Record<CurrencyCode, string> }; unusedDecisions: string[] }`.
  - `buildLedger(input: LedgerInput): Ledger`; `rateBookFor(ledger: Ledger): RateBook`; `balanceOn(ledger: Ledger, account: string, date: IsoDate): number | undefined`.
- Pipeline: detect; parse with `applyUnreadableShare` and `verifyChecks`; assign; money rows; order; `filePeriod`; merge per account with `newness`; coverage; classify; `applyPairAnswers`; deposits; `matchTransfers`; cards; `applyDefaults`; `applyCategoryAnswers`; conversions; needs. A needs item's `id` is `hashText(type + '|' + key)`; `dismiss` answers remove it.
- File problems: `duplicate` when all its rows are in other files of the account and its period is inside theirs; `overlapping` when it shares days with another file of the account; `improper-name` when its name is not a tidy name whose period covers its rows; `wrong-folder` when `folderBank` differs from the detected bank.
- `balanceOn` is signed: savings and current give the running balance (or the last statement closing), cards give minus the amount owed, deposits give principal placed. It is `undefined` before the account's `firstKnown` day, and for accounts with no statements other than deposits. One-sided transfers never change an account with statements.
- `coverage` for a card comes from its cycles: missing cycles become `missing` segments, others `covered`.
- Needs: every item in spec section 10, including `broken-chain` from `brokenChains`, a counterparty item for each distinct `counterparty` text on two or more `possible` rows or containing one of `you.names`, and one `tidy` item when any file has a problem other than `overlapping`.

- [ ] **Step 1: Allow fixture configs.** Add test `allows config.yaml in fixtures` to `scripts/check-private.test.ts`, watch it fail, update `findViolations`, add `!**/fixtures/**/config.yaml` to `.gitignore`, watch it pass.
- [ ] **Step 2: Write the fixture world** in `test/fixtures/ledger/` (home LKR, today 2026-02-20): `kanakku/config.yaml` plus folders `boc`, `combank`, `hnb`. Accounts: BOC savings, ComBank savings, ComBank card (statement day 5, due day 26), HNB LKR and HNB USD. Files: two overlapping BOC statements; one ComBank account file; one ComBank card file for the 2026-01-06 to 2026-02-05 cycle; HNB LKR and USD January files, the USD one placed in the `boc` folder; one unreadable file. Events: BOC out 40,025.00 to ComBank in 40,000.00 two days later; HNB USD 500.00 out and HNB LKR 150,000.00 in with one reference; HNB LKR out 100,025.00 to ComBank in 100,000.00; a ComBank deposit placement of 120,000.00 with a number; card charges of 6,500.50 in the cycle, unpaid; a salary credit caught by a config rule; a few purchases and fees.
- [ ] **Step 3: Write the failing tests**: account count (five plus one discovered deposit); end balance of each account in exact minor units, with the card negative; the BOC overlap counted once; three transfers plus the deposit transfer, with their rules; one conversion at `micro` 300000000; the card cycle `unpaid` and a `card-due` need (due 2026-02-26 is within 7 days); file problems `wrong-folder` for the USD file and status `unreadable` for the junk file; a `dismiss` answer removes its need; `balanceOn` before an account's first known day is `undefined`; `JSON.parse(JSON.stringify(ledger))` equals the ledger.
- [ ] **Step 4: Run** `pnpm vitest run packages/core/test/ledger.test.ts`. Expected: FAIL.
- [ ] **Step 5: Implement** `build.ts`, `needs.ts` and `views/balances.ts`.
- [ ] **Step 6: Run** `pnpm test`. Expected: all PASS.
- [ ] **Step 7: Commit** `Add ledger pipeline and Needs you`.

### Task 20: Views

**Files:**
- Create: `packages/core/src/views/{net-worth,cash-flow,spending,transfers}.ts`, `packages/core/test/views.test.ts`

**Interfaces:**
- Produces: `netWorthSeries(ledger: Ledger, range: { from: IsoDate; to: IsoDate; step: 'day' | 'month' }): Array<{ date: IsoDate; total: number; byAccount: Record<string, number | undefined>; unknown: string[]; unvalued: CurrencyCode[] }>`, `cashFlowByMonth(ledger: Ledger, range: { from: IsoDate; to: IsoDate }): Array<{ month: string; income: number; spending: number; net: number; incomeBy: Record<string, number>; spendingBy: Record<string, number>; unvalued: CurrencyCode[] }>`, `spendingByCategory(ledger: Ledger, range: { from: IsoDate; to: IsoDate }): Array<{ category: string; total: number; count: number }>`, `transferMatrix(ledger: Ledger, range: { from: IsoDate; to: IsoDate }): Array<{ from: string; to: string; amount: number; count: number }>`.
- All amounts in home minor units, valued with `rateBookFor(ledger).toHome` on each row's own date. Values that cannot be valued are left out and their currency listed in `unvalued`. Every month in the range appears, empty ones included. Views sum `parts`, never `amount`. The matrix uses what arrived (`amountIn`), or the home-currency side of a conversion.

- [ ] **Step 1: Write the failing tests** on the Task 19 world: month-end net worth on 2026-01-31 equals a hand-computed number written in the test; the card lowers it; cash flow leaves out transfers and counts transfer fees and the salary; spending categories add up to cash flow spending; the matrix totals equal the transfers' arrived amounts; an account not yet known is listed in `unknown`; a range with an empty month includes it with zeros.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add net worth, cash flow, spending and transfer views`.

### Task 21: Tidy-up planner

**Files:**
- Create: `packages/core/src/tidy/plan.ts`, `packages/core/test/tidy.test.ts`

**Interfaces:**
- Consumes: `FileStatus`, `tidyName`.
- Produces: `TidyProposal { file: string; action: 'rename' | 'move' | 'bin'; to?: string; reason: 'improper-name' | 'wrong-folder' | 'duplicate' }`, `planTidy(input: { ledger: Ledger; folders: Config['folders']; existing: Set<string> }): TidyProposal[]` (paths relative to the data folder).

- [ ] **Step 1: Write the failing tests**: an improperly named file gets `rename` to its `tidyName` in its folder; a file in another bank's folder gets `move` to the right folder under its tidy name; a duplicate gets `bin`; a name collision gets `_2`; a file already named with a period covering its rows gets nothing; an unreadable or unassigned file gets nothing.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/tidy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add tidy-up planner`.

### Task 22: Rate sources

**Files:**
- Create: `packages/core/src/rates/{hnb,numbers-lk,registry}.ts`, `packages/core/test/fixtures/rates/{hnb-rates.json,hnb-date.json,numbers-lk.html}`, `packages/core/test/rates.test.ts`

**Interfaces:**
- Produces: `RateSource { id: string; name: string; quoteCurrency: CurrencyCode; currencies: CurrencyCode[] | 'any'; options?: Array<{ key: string; label: string; choices?: string[] }>; requests(options: Record<string, string>): string[]; parse(bodies: string[], options: Record<string, string>): RateQuote[] }`, `RateSourceError`, `rateSources: RateSource[]` (`hnb`, `numbers-lk`, `manual`, `off`), `findRateSource(id: string): RateSource | undefined`, `checkRateSource(config: Config): Issue | undefined` (unknown source, or a quote currency that is not the home currency).

- [ ] **Step 1: Write the synthetic samples**: HNB JSON with USD buying 328.75 and a date body `[{"lastUpdatedDate":"2026-11-06"}]`; a small HTML page that copies the numbers.lk table structure (bank name and date inside the bank cell, display and full-precision values in the buying and selling cells, a `—` selling value) with made-up rates.
- [ ] **Step 2: Write the failing tests**: `hnb.requests({})` returns the two URLs from Appendix B.1; `hnb.parse` gives a USD quote with buying `'328.75'` on 2026-11-06 and source `hnb`; `numbers-lk` gives the chosen bank's buying rate with that row's own date and source `numbers-lk:HNB`; an unknown bank throws `RateSourceError`; a page without the table throws `RateSourceError('table not found')`; a `—` selling value gives `selling: undefined`; `checkRateSource` flags `hnb` for a USD home currency.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/rates.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** numbers.lk: take the first `<table>` after the text `Telegraphic Transfer (TT)`, drop `<style>` and `<svg>` blocks, split rows and cells, and read each cell's text nodes; prefer the full-precision value. HNB numbers become decimal strings through `String(n)`.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add exchange rate sources`.

### Task 23: Report script and contributor docs

**Files:**
- Create: `packages/core/scripts/report.ts`, `docs/adding-a-bank.md`
- Modify: `packages/core/package.json` (script `report`, devDependency `tsx 4.23.15`), `README.md` (a short "Develop" section)

**Interfaces:**
- Consumes: `loadConfig`, `loadDecisions`, `parseRatesCsv`, `buildLedger`, views, `planTidy`.
- Produces: `pnpm --filter @kanakku/core report --data <folder> [--today YYYY-MM-DD]` prints accounts by bank with balances and coverage, transfers by status, conversions, card cycles, Needs you items, tidy proposals and month-end net worth for the last 12 months. It reads `<data>/kanakku/config.yaml`, `decisions.yaml` and `rates/*.csv` when present, and every file in the configured folders, filling `folderBank` from the folder.

- [ ] **Step 1: Run** the report on `packages/core/test/fixtures/ledger` with `--today 2026-02-20`. Expected: the balances asserted in Task 19.
- [ ] **Step 2: Write** `docs/adding-a-bank.md`: folder layout, the plug-in contract, detection rules, failed rows, fixtures (synthetic only), wording rules, tests, registry line.
- [ ] **Step 3: Local only, not committed:** write the author's config in their own data folder, run the report on it, and compare with `.internal-works/kanakku-v1/real-data-notes.md`. Every mismatch becomes a failing synthetic test in the owning module before it is fixed.
- [ ] **Step 4: Run** `pnpm lint && pnpm check && pnpm test`. Expected: all pass.
- [ ] **Step 5: Commit** `Add ledger report script and bank plug-in guide`.
