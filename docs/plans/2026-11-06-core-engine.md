# Kanakku core engine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@kanakku/core`: the pure engine that turns statement files, a config and saved answers into one ledger, plus the views, tidy-up planner and rate parsers the server and web app will use.

**Architecture:** A pnpm workspace with one package in this plan, `packages/core`. Pure TypeScript with no Node or browser APIs, tested with Vitest against synthetic fixtures. `buildLedger(input)` runs the whole pipeline: detect, parse, assign, order, merge, coverage, classify, deposits, transfers, cards, valuation, Needs you. A dev-only report script runs the engine on a real data folder.

**Tech Stack:** TypeScript 7.0.2, Vitest 5.0.5, Biome 2.6.4, yaml 2.9.1, zod 4.6.7, tsx 4.23.15 (scripts only), simple-git-hooks 2.14.0, pnpm 10.28.1, Node 22.

**Spec:** `docs/specs/2026-11-06-kanakku-design.md`. Later plans cover the server (`packages/server`) and the web app (`packages/web`).

## Global Constraints

- Core uses no Node or browser APIs. JavaScript built-ins (`Date.UTC`, `Intl`, `BigInt`) are fine.
- Money is an integer number of minor units with a currency. Never a float. Config amounts are written in normal units and converted on load.
- Dates are `YYYY-MM-DD` strings with no time zone.
- No bank names, countries, currencies or people outside `src/banks/<id>/` and test fixtures. The only currency table in core is ISO 4217 minor units.
- Every `package.json` dependency uses an exact version (no `^` or `~`).
- No code comments unless the reason is non-obvious, and then one short line.
- Only synthetic data in the repository. Fixtures use made-up names and numbers.
- Commit messages: `<Verb> <description>`, sentence case, no prefix, no AI attribution.

## Review Focus

1. **A CSV re-saved by a spreadsheet app** (dates rewritten as `M/D/YYYY`, quotes dropped): impossible dates must make rows fail loudly, and a file where most rows fail must become unreadable, never silently mis-dated. Test in Task 5 (`rejects impossible dates and marks the file unreadable`).
2. **A statement with no transactions** (an HNB month with only the closing row): coverage and balances still work. Test in Task 7 and Task 13.
3. **Two accounts the file could belong to** (same masked digits, or two cards with no numbers): ask, never pick one. Test in Task 10 (`asks when a masked number fits two accounts`).
4. **Negative balances** (overdrafts, a card in credit): parsing, ordering and the chain work below zero. Test in Task 11 (`orders rows through a negative balance`).
5. **A same-day reversal** (a debit and a credit of the same amount on one account): both rows stay, and they never pair as a transfer. Test in Task 12 and Task 15.

## File structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, biome.json, vitest.config.ts, .nvmrc
.github/workflows/ci.yml
scripts/check-private.mjs                pre-commit guard
scripts/check-private.test.ts
config.example.yaml
docs/adding-a-bank.md
packages/core/
  package.json, tsconfig.json
  scripts/report.ts                      dev-only, uses Node fs
  src/index.ts                           public exports
  src/model/types.ts                     shared types
  src/model/money.ts                     amounts and minor units
  src/model/dates.ts                     calendar dates
  src/model/hash.ts                      stable ids
  src/parse/csv.ts                       CSV reader
  src/banks/types.ts                     plug-in contract
  src/banks/registry.ts                  included plug-ins
  src/banks/wording.ts                   matchWording
  src/banks/boc/{index,account-csv,wording}.ts
  src/banks/combank/{index,account-csv,card-csv,wording}.ts
  src/banks/hnb/{index,account-csv,wording}.ts
  src/config/{schema,load,defaults}.ts
  src/decisions/load.ts
  src/ledger/{detect,checks,assign,order,merge,coverage,classify,transfers,deposits,cards,valuation,needs,build,types}.ts
  src/views/{balances,net-worth,cash-flow,spending,transfers}.ts
  src/tidy/{names,plan}.ts
  src/rates/{types,hnb,numbers-lk,registry}.ts
  test/fixtures/{boc,combank,hnb,ledger,rates}/...
  test/*.test.ts
```

---

### Task 1: Workspace, tooling and the privacy guard

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.nvmrc`, `.github/workflows/ci.yml`, `scripts/check-private.mjs`, `scripts/check-private.test.ts`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Modify: `.gitignore` (add `.private-strings`, allow `!demo/**/*.csv` and `!demo/**/config.yaml`)

**Interfaces:**
- Produces: root scripts `pnpm test`, `pnpm check` (type check all packages), `pnpm lint` (Biome). `findViolations(files: Array<{ path: string; content: string }>, privateStrings: string[]): Array<{ path: string; line?: number; reason: string }>` exported from `scripts/check-private.mjs`.

- [ ] **Step 1: Write the failing tests** in `scripts/check-private.test.ts`:
  - `blocks statement files outside fixtures`: `{ path: 'data/a.csv' }` gives reason `statement file outside fixtures`.
  - `allows fixtures and demo data`: `packages/core/test/fixtures/boc/a.csv` and `demo/data/Bank/BOC/a.csv` give nothing.
  - `blocks config.yaml outside demo`: `config.yaml` blocked, `config.example.yaml` and `demo/data/kanakku/config.yaml` allowed.
  - `blocks private strings without printing them`: content `"x\n0099\n"` with private string `0099` gives `{ path, line: 2, reason: 'contains a private string' }`, and the reason does not contain `0099`.
  - `ignores blank and comment lines in the private list`.
- [ ] **Step 2: Run** `pnpm vitest run scripts/check-private.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement** `findViolations` and a `main()` that reads staged paths from `git diff --cached --name-only --diff-filter=ACMR`, staged content from `git show :<path>`, private strings from `.private-strings` when present, prints each violation and exits 1. Statement extensions: `.csv .xls .xlsx .pdf .ofx .qif`. Allowed when a path segment is `fixtures` or the path starts with `demo/`. Wire it as the `simple-git-hooks` pre-commit hook in root `package.json`.
- [ ] **Step 4: Run** `pnpm vitest run scripts/check-private.test.ts`, `pnpm check`, `pnpm lint`. Expected: all pass.
- [ ] **Step 5: Add CI**: `.github/workflows/ci.yml` on push and pull request: checkout, pnpm 10.28.1, Node 22 with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check`, `pnpm test`.
- [ ] **Step 6: Commit** `Add workspace, tooling and private data guard`.

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
  - `majorToMinor(major: number, currency: CurrencyCode): number` for config values.
  - `formatAmount(minor: number, currency: CurrencyCode, locale: string): string` (grouped, fixed places, no symbol).
  - `parseYmd`, `parseDmy` (`DD/MM/YYYY`), `parseDmyDash` (`DD-MM-YYYY`), `parseMdyShort` (`M/D/YY`), `parseDayMonthName` (`06 Nov 2026`): each `(text: string) => IsoDate | undefined`.
  - `addDays(d: IsoDate, n: number): IsoDate`, `diffDays(a: IsoDate, b: IsoDate): number` (b minus a), `daysInMonth(year: number, month: number): number`, `clampDate(year: number, month: number, day: number): IsoDate`, `monthKey(d: IsoDate): string`, `startOfMonth(d)`, `endOfMonth(d)`.
  - `hashText(text: string): string`: 64-bit FNV-1a, 16 lowercase hex characters.

- [ ] **Step 1: Write the failing tests**:
  - `normalizeAmount('"1,397,855.95"') === '1397855.95'`, `('25') === '25'`, `('') === undefined`, `('(12.50)') === '-12.50'`, `('-1,000.00') === '-1000.00'`, `('abc') === undefined`, `('—') === undefined`.
  - `decimalToMinor('1397855.95','LKR') === 139785595`, `('25','LKR') === 2500`, `('0.385','USD') === 39`, `('1500','JPY') === 1500`, `('-12.5','USD') === -1250`.
  - `minorToDecimal(-1250,'USD') === '-12.50'`, `majorToMinor(300000,'LKR') === 30000000`, `formatAmount(139785595,'LKR','en-US') === '1,397,855.95'`.
  - `parseDmy('07/10/2026') === '2026-10-07'`, `parseDmy('31/02/2026') === undefined`, `parseDmy('13/25/2026') === undefined`, `parseDmyDash('06-11-2026') === '2026-11-06'`, `parseMdyShort('11/6/26') === '2026-11-06'`, `parseDayMonthName('06 Nov 2026') === '2026-11-06'`.
  - `addDays('2026-02-28',1) === '2026-03-01'`, `diffDays('2026-10-30','2026-11-02') === 3`, `daysInMonth(2028,2) === 29`, `clampDate(2026,2,30) === '2026-02-28'`.
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

- [ ] **Step 1: Write the failing tests**: `parseCsv('a,b\n1,"2,3"\n')` gives `[['a','b'],['1','2,3']]`; `'x,"l1\nl2",y'` gives `[['x','l1\nl2','y']]`; `'"he said ""hi""",z'` gives `[['he said "hi"','z']]`; `'﻿a,b\r\n1,2'` gives `[['a','b'],['1','2']]`; `',,'` gives `[['','','']]`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/csv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** a single-pass state machine.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add CSV reader`.

### Task 4: Plug-in contract, wording matcher and detection

**Files:**
- Create: `packages/core/src/banks/types.ts`, `packages/core/src/banks/wording.ts`, `packages/core/src/banks/registry.ts`, `packages/core/src/ledger/detect.ts`, `packages/core/test/detect.test.ts`, `packages/core/test/wording.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces (in `banks/types.ts`): `FileInput { path: string; name: string; text: string }`, `ParsedRow { line: number; date: IsoDate; description: string; amount: string; balance?: string; reference?: string; raw: string[] }` (amounts are `normalizeAmount` strings, converted once the currency is known), `Period { from: IsoDate; to: IsoDate }`, `ParsedStatement { account: { number?: string; masked?: string; numberHint?: string; currency?: CurrencyCode; type?: AccountType }; period?: Period & { inferred?: boolean }; closing?: { date: IsoDate; balance: string }; generatedAt?: IsoDate; rows: ParsedRow[]; checks?: { credits?: string; debits?: string; creditCount?: number; debitCount?: number }; issues: Issue[] }`, `Issue { level: 'info' | 'warning' | 'error'; code: string; message: string; file?: string; line?: number; account?: string; date?: IsoDate }`, `StatementFormat { id; fileTypes: string[]; accountTypes: AccountType[]; detect(file: FileInput): number | null; parse(file: FileInput): ParsedStatement }`, `WordingTag = 'interest' | 'tax' | 'fee' | 'cash' | 'purchase' | 'opening-deposit' | 'card-payment' | 'transfer-hint' | 'deposit-placement' | 'deposit-return' | 'deposit-interest' | 'deposit-closure'`, `WordingRule { tag: WordingTag; pattern: RegExp; direction?: 'in' | 'out' }` (a named group `deposit` captures a deposit number), `BankPlugin { id; name; shortName; country?: string; formats: StatementFormat[]; wording: WordingRule[]; transferFees?: Partial<Record<CurrencyCode, string[]>> }`.
- Produces: `matchWording(description: string, amountSign: 'in' | 'out', rules: WordingRule[]): { tags: WordingTag[]; deposit?: string }`; `bankPlugins: BankPlugin[]`, `findBank(id: string): BankPlugin | undefined`; `detectFormat(file: FileInput, plugins: BankPlugin[]): { plugin: BankPlugin; format: StatementFormat; confidence: number } | { unreadable: 'no-match' | 'tie' }`.

- [ ] **Step 1: Write the failing tests** with fake plug-ins: highest confidence wins; best below 0.5 gives `no-match`; equal best gives `tie`; a `detect` that throws counts as `null`; `matchWording` returns every matching tag in rule order, respects `direction`, and returns the `deposit` group.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/detect.test.ts packages/core/test/wording.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `bankPlugins` starts empty and gains one line per bank in Tasks 5 to 7.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `Add bank plug-in contract and format detection`.

### Task 5: Bank of Ceylon plug-in

**Files:**
- Create: `packages/core/src/banks/boc/{index,account-csv,wording}.ts`, `packages/core/src/ledger/checks.ts`, `packages/core/test/fixtures/boc/account.csv`, `packages/core/test/fixtures/boc/resaved.csv`, `packages/core/test/boc.test.ts`

**Interfaces:**
- Produces: `boc: BankPlugin` (`id 'boc'`, `shortName 'BOC'`, `country 'LK'`, format `boc-account-csv` for `savings` and `current`), `verifyChecks(parsed: ParsedStatement, currency: CurrencyCode): Issue[]` (code `totals-mismatch`), `UNREADABLE_SHARE = 0.2`: a parse where more than this share of data rows fail becomes an `error` issue with code `unreadable`.

- [ ] **Step 1: Write the fixture** `account.csv` in the Appendix A.1 layout: account `0012345678`, LKR, period 2026-01-01 to 2026-03-31, 12 rows newest first with true running balances, summary totals matching the rows, using made-up merchants.
- [ ] **Step 2: Write the failing tests**:
  - `detects its own file`: confidence ≥ 0.9; `null` for an HNB-layout string.
  - `reads the header`: number `0012345678`, currency `LKR`, period `{ from: '2026-01-01', to: '2026-03-31' }`, `generatedAt` from `Generated On`.
  - `reads rows in file order`: first row's date, `amount` (credit minus debit) and `balance` as decimal strings.
  - `checks totals`: `verifyChecks` is empty for the fixture and returns `totals-mismatch` when one amount is edited.
  - `rejects impossible dates and marks the file unreadable`: `resaved.csv` with `M/D/YYYY` dates such as `3/30/2026` produces an `unreadable` error and no rows with wrong dates.
  - Wording: `INTEREST WITHHELD` out gives `tax` (not `interest`), `INTEREST` in gives `interest`, `ATM SERVICE CHARGE` gives `fee`, `ATMCASHWDL...` gives `cash`, `POS ...` and `ECOMMERCE ...` give `purchase`, `CEFT...` gives `transfer-hint`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/boc.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Find the table by its header row, read key-value lines above it, read summary totals into `checks`. Add `boc` to `bankPlugins`. Extend wording with patterns seen in local real files (descriptions only, no real names or numbers).
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add Bank of Ceylon statement plug-in`.

### Task 6: Commercial Bank plug-in

**Files:**
- Create: `packages/core/src/banks/combank/{index,account-csv,card-csv,wording}.ts`, `packages/core/test/fixtures/combank/transaction_history_0087654321_20260401.csv`, `packages/core/test/fixtures/combank/transactions_history_current_period.csv`, `packages/core/test/combank.test.ts`

**Interfaces:**
- Produces: `combank: BankPlugin` (`id 'combank'`, `shortName 'ComBank'`, `country 'LK'`, formats `combank-account-csv` for `savings` and `current`, `combank-card-csv` for `credit-card`).

- [ ] **Step 1: Write the fixtures** in the Appendix A.2 layouts, including the footer with the multi-line quoted address. Card rows out of date order, each with a 12-digit reference.
- [ ] **Step 2: Write the failing tests**:
  - Each format detects its own file at ≥ 0.9, and the account format scores the card file lower than the card format does.
  - Account: currency `LKR` from rows, `generatedAt '2026-04-01'` from `Generated at 4/1/26 9:15 AM`, `numberHint '0087654321'` from the file name, `period { from: <first row date>, to: '2026-04-01', inferred: true }`, footer lines not read as rows.
  - Card: `type 'credit-card'`, `reference` is the 12-digit part, debit gives a negative amount, rows kept in file order.
  - Wording: `ADVANCE INCOME TAX` gives `tax`; `TRF TO: 003012345678 / ...` out gives `deposit-placement` with deposit `003012345678`; `IB Time Redemption Deposit` and `Principal from eFD` give `deposit-return`; `Interest from eFD` gives `deposit-interest`; `INITIAL DEP` gives `opening-deposit`; `CEFT` and `IBT` give `transfer-hint`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/combank.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Locate columns by header names, not positions. Stop data rows at the first row whose date cell does not parse. Add `combank` to `bankPlugins`.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add Commercial Bank statement plug-ins`.

### Task 7: Hatton National Bank plug-in

**Files:**
- Create: `packages/core/src/banks/hnb/{index,account-csv,wording}.ts`, `packages/core/test/fixtures/hnb/{lkr-2026-03,usd-2026-03,empty-2026-04}.csv`, `packages/core/test/hnb.test.ts`

**Interfaces:**
- Produces: `hnb: BankPlugin` (`id 'hnb'`, `shortName 'HNB'`, `country 'LK'`, format `hnb-account-csv` for `savings` and `current`, `transferFees: { LKR: ['25'] }`).

- [ ] **Step 1: Write the fixtures** in the Appendix A.3 layout, without a final newline. The LKR and USD files share one `Ref.No` on a conversion (USD out, LKR in). The empty month has only the header and the closing row.
- [ ] **Step 2: Write the failing tests**:
  - Detects at ≥ 0.9; `null` for the BOC fixture.
  - `masked '12345XXXXX67'` from the interest row; `closing { date: '2026-03-31', balance: '1203.04' }`; rows oldest first with `reference`.
  - `period { from: '2026-03-01', to: '2026-03-31', inferred: true }` when every row is in the closing month; no inferred period when a row falls outside it.
  - Empty month: no rows, `period { from: '2026-04-01', to: '2026-04-30', inferred: true }`, closing balance kept.
  - Wording: `Dr. Tran for funding A/c 123456789012` gives `deposit-placement` with deposit `123456789012`; `123456789012 : Closure Proceeds` gives `deposit-closure` with the deposit; `<masked>:Int.Pd:` gives `interest`; `Finacle Alert Charges`, `MB/IB FEE`, `Bi Annual Fee`, `COUNTER WITHDRAWAL CHGS` give `fee`; `MB:` gives `transfer-hint`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/hnb.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** and add `hnb` to `bankPlugins`.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add Hatton National Bank statement plug-in`.

### Task 8: Config

**Files:**
- Create: `packages/core/src/config/{schema,load,defaults}.ts`, `packages/core/test/config.test.ts`, `config.example.yaml`

**Interfaces:**
- Consumes: `findBank`, `majorToMinor`.
- Produces: `Account { id; name; bank; type: AccountType; currency; number?: string; opened?: IsoDate; closed?: IsoDate; card?: { statementDay: number; dueDay: number; limit?: number; openingOwed: number }; deposit?: { principal?: number; start?: IsoDate; months?: number; rate?: number; maturity?: IsoDate }; discovered?: boolean }` (minor units), `UserRule { match: { text: string } | { regex: string }; account?: string; direction?: 'in' | 'out'; min?: number; max?: number; kind?: Kind; category?: string }`, `Config { version: 1; homeCurrency; locale; folders: Array<{ path: string; bank: string }>; accounts: Account[]; you: { names: string[] }; transfers: { windowDays: number; fees: Record<CurrencyCode, number[]> }; rates: { source: string; options: Record<string, string>; manual: Record<CurrencyCode, number> }; categories: { income: string[]; spending: string[] }; rules: UserRule[] }`, `ConfigError { line?: number; path: string; message: string }`, `loadConfig(text: string, banks?: BankPlugin[]): { config?: Config; errors: ConfigError[] }`, `DEFAULT_CATEGORIES`.
- Defaults: `locale 'en-US'`, `windowDays 3`, `fees {}` merged with each plug-in's `transferFees`, `rates.source 'off'`, `you.names []`, categories from the spec.

- [ ] **Step 1: Write the failing tests**: `config.example.yaml` loads with no errors; card `limit: 300000` becomes `30000000`; an unknown bank gives an error naming its line; `currency: LK` gives `accounts[1].currency must be a 3-letter code` with the right line; duplicate account ids give an error; a YAML syntax error gives its line; a missing `version` gives an error; `statementDay: 32` gives an error.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/config.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `yaml` (`parseDocument` plus `LineCounter` for lines) and zod for shape. Map each zod issue path to the YAML node's line.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add config loading and validation`.

### Task 9: Saved answers

**Files:**
- Create: `packages/core/src/decisions/load.ts`, `packages/core/test/decisions.test.ts`

**Interfaces:**
- Produces: `Decision` as a union on `type`: `file-account { file: string; account: string }`, `pair { out: string; in: string }`, `not-transfer { txn: string; with?: string }`, `set { txn: string; kind?: Kind; category?: string }`, `counterparty { text: string; account?: string; mine: boolean }`, `fd-principal { deposit: string; principal: string }`, `dismiss { item: string }`; every decision also has `id: string` and `at: string`. `loadDecisions(text: string): { decisions: Decision[]; errors: ConfigError[] }`, `serializeDecisions(decisions: Decision[]): string`.

- [ ] **Step 1: Write the failing tests**: each type round-trips through serialize and load; an unknown type gives an error with its line; an empty file gives no decisions.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/decisions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add saved answers format`.

### Task 10: Assign files to accounts

**Files:**
- Create: `packages/core/src/ledger/assign.ts`, `packages/core/src/tidy/names.ts` (parsing half only), `packages/core/test/assign.test.ts`

**Interfaces:**
- Produces: `maskFits(masked: string, number: string): boolean`; `parseTidyName(name: string): { bank: string; label: string; currency?: CurrencyCode; from: IsoDate; to: IsoDate; partial: boolean } | undefined`; `assignAccount(input: { parsed: ParsedStatement; file: FileInput; plugin: BankPlugin; format: StatementFormat; accounts: Account[]; decisions: Decision[]; fileHash: string }): { account: Account; via: 'number' | 'masked' | 'file-name' | 'tidy-name' | 'answer' | 'only-account' } | { ask: 'pick-account'; candidates: string[] } | { ask: 'new-account'; proposal: Partial<Account> }`.

- [ ] **Step 1: Write the failing tests**, one per rule in spec 9.3 and in that order of precedence, plus:
  - `asks when a masked number fits two accounts`.
  - `asks when two cards at the bank have no numbers`.
  - `proposes a new account` with bank, number, currency and type from the file.
  - `parseTidyName('HNB_12345XXXXX67_USD_2026-03-01_to_2026-03-31.csv')` gives bank `HNB`, label `12345XXXXX67`, currency `USD`; `'ComBank_CreditCard_2026-10-06_to_2026-11-05_partial.csv'` gives `partial: true`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/assign.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add statement to account assignment`.

### Task 11: Time order

**Files:**
- Create: `packages/core/src/ledger/order.ts`, `packages/core/test/order.test.ts`

**Interfaces:**
- Produces: `MoneyRow = Omit<ParsedRow, 'amount' | 'balance'> & { amount: number; balance?: number; file: string }`, `toMoneyRows(rows: ParsedRow[], currency: CurrencyCode, file: string): MoneyRow[]`, `toChronological(rows: MoneyRow[]): { rows: MoneyRow[]; direction: 'oldest-first' | 'newest-first' | 'unknown'; issues: Issue[] }`.

- [ ] **Step 1: Write the failing tests** (minor units):
  - Newest first `[{03-02,-500,9500},{03-02,-1000,10000},{03-01,+11000,11000}]` becomes `+11000, -1000, -500`.
  - Oldest first stays as is.
  - A day whose rows only satisfy the chain in one order is put in that order.
  - `orders rows through a negative balance`: balances `500, -300, 200`.
  - Without balances: stable sort by date.
  - A chain that no order fixes keeps date order and returns a `chain-break` issue.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/order.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Majority vote on neighbour pairs for direction. Inside a broken day, try permutations when the day has at most 7 rows, otherwise a greedy walk that picks the row continuing the chain.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add statement row ordering by running balance`.

### Task 12: Merge overlapping statements

**Files:**
- Create: `packages/core/src/ledger/merge.ts`, `packages/core/test/merge.test.ts`

**Interfaces:**
- Consumes: `MoneyRow`, `toChronological`, `hashText`.
- Produces: `Transaction { id: string; account: string; date: IsoDate; amount: number; currency: CurrencyCode; balance?: number; description: string; reference?: string; sources: Array<{ file: string; line: number }>; kind: Kind; category: string; tags: WordingTag[]; deposit?: string; decidedBy?: 'answer' | 'rule' | 'wording' | 'match' | 'default'; parts: Part[]; transfer?: string; flag?: 'waiting' | 'possible' | 'ambiguous' }`, `Part { kind: Kind; category: string; amount: number }`, `mergeAccountFiles(account: string, currency: CurrencyCode, files: Array<{ path: string; generatedAt?: IsoDate; rows: MoneyRow[] }>): { transactions: Transaction[]; issues: Issue[] }`.
- New transactions start with `kind` and `category` empty, `tags []`, `parts []`.

- [ ] **Step 1: Write the failing tests**:
  - Overlapping files (Jan to Feb, Feb to Mar) give each February row once, with both sources.
  - Two identical purchases on one day in one file stay two; the same pair in both files still gives two, not four.
  - Card rows (no balance) merge by reference.
  - Ids stay the same when the files are passed in a different order.
  - `keeps a same-day reversal`: a debit and a credit of 1,000 on one day both stay.
  - Each kept row takes its balance from the newest file that has it (latest `generatedAt`, else latest period end).
  - `flags files that disagree inside their overlap`: a row only the older file has gives one `chain-break` issue naming both files and the dates on both sides, and the later rows are not duplicated.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/merge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Key: `date|amount|r:<reference>|d:<lowercased, single-spaced description>`, with the reference part empty when the row has none. The running balance is never part of the key. Keep the largest count per key across files. Order the union by date, then fix each day with the chain as in Task 11. Never drop a row to repair the chain.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add merging of overlapping statements`.

### Task 13: Coverage

**Files:**
- Create: `packages/core/src/ledger/coverage.ts`, `packages/core/test/coverage.test.ts`

**Interfaces:**
- Produces: `filePeriod(parsed: ParsedStatement, fileName: string, rows: MoneyRow[]): (Period & { source: 'stated' | 'tidy-name' | 'inferred' | 'rows' }) | undefined`, `CoverageSegment { from: IsoDate; to: IsoDate; state: 'covered' | 'quiet' | 'missing' }`, `accountCoverage(input: { account: Account; files: Array<{ path: string; period: Period; closing?: { date: IsoDate; balance: number } }>; transactions: Transaction[]; today: IsoDate }): { segments: CoverageSegment[]; lastCovered?: IsoDate; behindDays?: number }`. `BEHIND_DAYS = 7`.

- [ ] **Step 1: Write the failing tests**:
  - Period source order: stated, then tidy name, then inferred, then rows.
  - Overlapping and touching periods join.
  - Hole with matching balances (closing 1,000.00 before, opening 1,000.00 after) is `quiet`; with different balances it is `missing`.
  - A month with no rows but a closing balance counts as covered.
  - `opened` before the first file with a zero opening balance is `quiet`, otherwise `missing`.
  - `behindDays` is 9 when the last covered day is 2026-10-28 and today is 2026-11-06.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/coverage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Cards are not handled here (Task 17).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add statement coverage and missing periods`.

### Task 14: Classify

**Files:**
- Create: `packages/core/src/ledger/classify.ts`, `packages/core/test/classify.test.ts`

**Interfaces:**
- Produces: `classify(txns: Transaction[], ctx: { accounts: Account[]; banks: BankPlugin[]; rules: UserRule[]; decisions: Decision[]; categories: Config['categories'] }): Transaction[]` (sets `tags`, `deposit`, and `kind`, `category`, `decidedBy`, `parts` for rows it settles) and `applyDefaults(txns: Transaction[]): Transaction[]`.
- Tag meanings: `interest` and `deposit-interest` give income, Interest; `tax` gives spending, Tax; `fee` gives spending, Fees; `cash` gives spending, Cash; `opening-deposit` gives other. `purchase`, `card-payment`, `transfer-hint` and the deposit tags settle nothing here.

- [ ] **Step 1: Write the failing tests**: a `set` answer beats a matching rule; a rule beats wording; text rules are case-insensitive substring matches and regex rules are case-insensitive; `account`, `direction`, `min` and `max` filter; a rule with only a category takes its kind from the category lists; wording tags map as above; transfer hints stay unsettled; `applyDefaults` gives income, Other income and spending, Uncategorised; settled rows get one part equal to the whole amount.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/classify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add transaction classification`.

### Task 15: Transfers between own accounts

**Files:**
- Create: `packages/core/src/ledger/transfers.ts`, `packages/core/test/transfers.test.ts`

**Interfaces:**
- Produces: `Transfer { id: string; out?: string; in?: string; from: string; to: string; date: IsoDate; amountOut: number; currencyOut: CurrencyCode; amountIn?: number; currencyIn?: CurrencyCode; fee: number; rule: 'reference' | 'exact' | 'fee' | 'answer' | 'wording' | 'deposit'; status: 'matched' | 'confirmed' | 'one-sided' }`, `matchTransfers(txns: Transaction[], ctx: { accounts: Account[]; windowDays: number; fees: Record<CurrencyCode, number[]>; youNames: string[]; coverageEnd: Record<string, IsoDate | undefined>; coverageStart: Record<string, IsoDate | undefined>; decisions: Decision[] }): { transfers: Transfer[]; txns: Transaction[] }`. Matched rows get `kind 'transfer'`, `decidedBy 'match'`, `transfer`, and `parts`; a fee becomes a second part (spending, Fees). Unmatched hint rows get `flag`.
- Score: reference +1000, exact +100, fee +50, minus 10 per day apart, +5 when in is on or after out, +3 for a hint on either row, +3 for one of `youNames` in either description.

- [ ] **Step 1: Write the failing tests** (amounts in normal units here, minor units in code):
  - Exact: out 40,000 on 2026-10-12, in 40,000 on 2026-10-14 in another account: matched, fee 0.
  - Fee on the sender: out 40,025, in 40,000, LKR fees [25]: matched, out row parts are transfer −40,000 and Fees −25.
  - Fee off the receiver: out 8,000, in 7,975: matched, fee 25.
  - Four days apart: no match.
  - Different currencies with the same reference (USD 600.00 out, LKR 180,000.00 in): matched with rule `reference`; different references: no match.
  - Tie: one out of 1,000 and two ins of 1,000 the same day in two accounts: nothing matched, all three flagged `ambiguous`.
  - Waiting: a hint row out of 10,000 on 2026-11-05 while another account's coverage ends 2026-11-03: `waiting`.
  - Possible: the same row with every other account covered past 2026-11-08: `possible`.
  - A `pair` answer gives `confirmed`; a `not-transfer` answer blocks the automatic pair.
  - `never pairs a same-day reversal`: a debit and credit of 1,000 on one account do not match.
  - Outflows of credit-card accounts and rows tagged `purchase` never match automatically.
  - One-sided: a bank out row tagged `card-payment`, with the only card's statements starting later: one-sided transfer to the card.
  - A `counterparty` answer with `mine: true` and an account turns unmatched rows containing its text into one-sided transfers to that account; with `mine: false` the rows are left alone and never flagged `possible`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/transfers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Build all candidate pairs, sort by score, accept best first. A pair is a tie when another candidate with the same score shares one of its rows and both of that candidate's rows are still free; then neither is accepted and the rows are flagged.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add transfer matching between own accounts`.

### Task 16: Fixed deposits

**Files:**
- Create: `packages/core/src/ledger/deposits.ts`, `packages/core/test/deposits.test.ts`

**Interfaces:**
- Produces: `trackDeposits(txns: Transaction[], ctx: { accounts: Account[]; decisions: Decision[] }): { txns: Transaction[]; accounts: Account[]; transfers: Transfer[]; needs: NeedDraft[] }` where discovered deposits get `id 'deposit-<bank>-<number>'` and pools `id 'deposit-<bank>-<currency>-pool'`; `NeedDraft { type: string; key: string; message: string; refs: { file?: string; account?: string; txns?: string[]; date?: IsoDate } }`.

- [ ] **Step 1: Write the failing tests**:
  - A placement with a number creates a discovered deposit in the paying account's bank and currency, and a one-sided transfer with rule `deposit`.
  - A closure of USD 2,021.30 after a placement of 2,000.00 gives parts transfer 2,000.00 and income, Interest 21.30.
  - A closure with no known placement counts whole as principal and adds a `deposit-principal` need; an `fd-principal` answer of 2,000.00 splits it.
  - A return with no number goes to the open deposit at the same bank with the same principal, else to the pool.
  - A config deposit with `principal` and `start` gives an opening balance only when no placement row for it exists, and then no `deposit-principal` need is raised for it.
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
- Produces: `cycleFor(date: IsoDate, statementDay: number): Period`, `dueDateFor(statementDate: IsoDate, statementDay: number, dueDay: number): IsoDate`, `CardCycle { from; to; statementDate; dueDate; charges: number; credits: number; billed: number; paid: number; status: 'open' | 'paid' | 'part-paid' | 'unpaid' | 'overdue'; coverage: 'full' | 'partial' | 'missing' }`, `cardCycles(account: Account, txns: Transaction[], filePeriods: Period[], today: IsoDate): CardCycle[]`, `owedOn(account: Account, txns: Transaction[], date: IsoDate): number`.

- [ ] **Step 1: Write the failing tests**:
  - `cycleFor('2026-10-08',5)` and `cycleFor('2026-11-05',5)` give 2026-10-06 to 2026-11-05; `cycleFor('2026-11-06',5)` gives 2026-11-06 to 2026-12-05; `cycleFor('2026-02-15',31)` gives 2026-02-01 to 2026-02-28.
  - `dueDateFor('2026-11-05',5,26) === '2026-11-26'`; `dueDateFor('2026-11-25',25,10) === '2026-12-10'`.
  - Charges of 10,000.00 and 2,500.00 in the cycle: on 2026-11-06 billed 12,500.00, due 2026-11-26, `unpaid`; with a payment of 12,500.00 on 2026-11-20, `paid`; with 5,000.00, `part-paid`; on 2026-11-27 with nothing paid, `overdue`; on 2026-11-01, `open`.
  - A refund lowers the billed amount; `owedOn` adds `openingOwed`.
  - A cycle with no file is `missing`; a file ending before the cycle closes makes it `partial`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/cards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add credit card cycles and amounts owed`.

### Task 18: Valuation and conversions

**Files:**
- Create: `packages/core/src/ledger/valuation.ts`, `packages/core/src/rates/types.ts`, `packages/core/test/valuation.test.ts`

**Interfaces:**
- Produces: `RateQuote { currency: CurrencyCode; date: IsoDate; buying: number; selling?: number; source: string }`, `Conversion { id: string; transfer: string; date: IsoDate; from: string; to: string; amountOut: number; currencyOut: CurrencyCode; amountIn: number; currencyIn: CurrencyCode; rate: number; reference?: string }`, `buildConversions(transfers: Transfer[], txns: Map<string, Transaction>): Conversion[]`, `RateUse { rate: number; date: IsoDate; source: string }`, `makeRateBook(ctx: { home: CurrencyCode; source: string; stored: RateQuote[]; conversions: Conversion[]; manual: Record<CurrencyCode, number> }): { rateOn(currency: CurrencyCode, date: IsoDate): RateUse | undefined; toHome(minor: number, currency: CurrencyCode, date: IsoDate): { value: number; rate?: RateUse } | undefined }`.

- [ ] **Step 1: Write the failing tests**:
  - A conversion of USD 600.00 to LKR 180,000.00 has rate 300.
  - `rateOn` uses the selected source's rate on that day; then the nearest earlier stored rate; then the conversion nearest in days; then the manual rate; otherwise `undefined`.
  - `toHome(125000,'USD',d)` at 328.75 is `41093750`; `toHome` of a home-currency amount returns it unchanged with no rate.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/valuation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Round half away from zero to home minor units.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add currency valuation and conversion records`.

### Task 19: Build the ledger

**Files:**
- Create: `packages/core/src/ledger/{types,needs,build}.ts`, `packages/core/src/views/balances.ts`, `packages/core/test/fixtures/ledger/...`, `packages/core/test/ledger.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `LedgerInput { files: FileInput[]; config: Config; decisions: Decision[]; rates: RateQuote[]; today: IsoDate; plugins?: BankPlugin[] }`, `FileStatus { path: string; bank?: string; format?: string; account?: string; period?: Period; rows: number; status: 'ok' | 'duplicate' | 'unreadable' | 'unassigned' | 'wrong-folder'; issues: Issue[]; hash: string }`, `NeedsItem { id: string; type: string; message: string; severity: 'high' | 'normal' | 'low'; refs: NeedDraft['refs']; actions: string[] }`, `Ledger { today; homeCurrency; accounts: Account[]; files: FileStatus[]; transactions: Transaction[]; transfers: Transfer[]; conversions: Conversion[]; coverage: Record<string, ReturnType<typeof accountCoverage>>; cards: Record<string, CardCycle[]>; needs: NeedsItem[]; issues: Issue[]; rates: ReturnType<typeof makeRateBook> }`, `buildLedger(input: LedgerInput): Ledger`, `balanceOn(ledger: Ledger, account: string, date: IsoDate): number | undefined`.
- Pipeline order: detect, parse, assign, money rows, order, merge, coverage, classify, deposits, transfers, cards, applyDefaults, conversions, rate book, needs. A needs item's `id` is `hashText(type + '|' + key)`; `dismiss` answers remove it.

- [ ] **Step 1: Write the fixture world** in `test/fixtures/ledger/`: a config plus files for BOC (two overlapping files), ComBank savings and card, HNB LKR and USD, over two months. Include a fee transfer BOC to ComBank, a USD to LKR conversion with one reference, an HNB to ComBank transfer, an unpaid card cycle, a ComBank deposit placement, one unreadable file and one file in the wrong folder.
- [ ] **Step 2: Write the failing tests**: account count; end balance of each account (exact minor units); BOC overlap not double counted; transfer count and rules; one conversion at the expected rate; the card cycle `unpaid`; one discovered deposit; file statuses include `unreadable` and `wrong-folder`; needs include `unreadable-file` and `card-due` when today is within 7 days of the due date; a `dismiss` answer removes its item; `balanceOn` before an account's first known day is `undefined`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/ledger.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `build.ts` as the pipeline, `needs.ts` for every item in spec section 10, and `balanceOn` from running balances, statement closings, card owed amounts and deposit transfers. One-sided transfers never change the balance of an account that has statements; an account with no statements has no balance.
- [ ] **Step 5: Run** `pnpm test`. Expected: all PASS.
- [ ] **Step 6: Commit** `Add ledger pipeline and Needs you`.

### Task 20: Views

**Files:**
- Create: `packages/core/src/views/{net-worth,cash-flow,spending,transfers}.ts`, `packages/core/test/views.test.ts`

**Interfaces:**
- Produces: `netWorthSeries(ledger: Ledger, range: { from: IsoDate; to: IsoDate; step: 'day' | 'month' }): Array<{ date: IsoDate; total: number; byAccount: Record<string, number | undefined>; unknown: string[] }>`, `cashFlowByMonth(ledger, range: { from; to }): Array<{ month: string; income: number; spending: number; net: number; income_by: Record<string, number>; spending_by: Record<string, number> }>`, `spendingByCategory(ledger, range): Array<{ category: string; total: number; count: number }>`, `transferMatrix(ledger, range): Array<{ from: string; to: string; amount: number; count: number }>`. All amounts in home minor units, valued with `ledger.rates.toHome` on the transaction's date.

- [ ] **Step 1: Write the failing tests** on the Task 19 world: month-end net worth equals the sum of `balanceOn` values in home currency; cash flow leaves out transfers and counts transfer fees and deposit interest; spending categories add up to the cash flow spending; the matrix totals equal the sum of matched transfer amounts; an account not yet known is listed in `unknown`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Views sum `parts`, never `amount`, for income and spending.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add net worth, cash flow, spending and transfer views`.

### Task 21: Tidy-up planner

**Files:**
- Create: `packages/core/src/tidy/plan.ts`, `packages/core/test/tidy.test.ts`
- Modify: `packages/core/src/tidy/names.ts` (add `tidyName`)

**Interfaces:**
- Produces: `tidyName(input: { bankShort: string; account: Account; accountsAtBank: Account[]; period: Period; partial?: boolean; ext: string }): string`, `TidyProposal { file: string; action: 'rename' | 'move' | 'bin'; to?: string; reason: 'improper-name' | 'wrong-folder' | 'duplicate' }`, `planTidy(input: { ledger: Ledger; folders: Config['folders']; existing: Set<string> }): TidyProposal[]` (paths relative to the data folder).

- [ ] **Step 1: Write the failing tests**: `BOC_0012345678_2026-01-01_to_2026-03-31.csv`; `HNB_12345XXXXX67_USD_2026-03-01_to_2026-03-31.csv` when the bank holds two currencies, no currency part when it holds one; `ComBank_CreditCard_2026-10-06_to_2026-11-05.csv` and its `_partial` form; two cards give `ComBank_CreditCard-<id>_...`; a file already named with a period that covers its rows gets no proposal; a file in another bank's folder gets `move`; a fully duplicated file gets `bin`; a name collision gets `_2`.
- [ ] **Step 2: Run** `pnpm vitest run packages/core/test/tidy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add tidy-up planner`.

### Task 22: Rate sources

**Files:**
- Create: `packages/core/src/rates/{hnb,numbers-lk,registry}.ts`, `packages/core/test/fixtures/rates/{hnb-rates.json,hnb-date.json,numbers-lk.html}`, `packages/core/test/rates.test.ts`

**Interfaces:**
- Produces: `RateSource { id: string; name: string; quoteCurrency: CurrencyCode; currencies: CurrencyCode[] | 'any'; options?: Array<{ key: string; label: string; choices?: string[] }>; requests(options: Record<string, string>): string[]; parse(bodies: string[], options: Record<string, string>): RateQuote[] }`, `RateSourceError`, `rateSources: RateSource[]` (`hnb`, `numbers-lk`, `manual`, `off`), `findRateSource(id: string)`.

- [ ] **Step 1: Write the synthetic samples**: HNB JSON with USD buying 328.75 and a date body `[{"lastUpdatedDate":"2026-11-06"}]`; a small HTML page that copies the numbers.lk table structure (bank name and date inside the bank cell, display and full-precision values in the buying and selling cells, a `—` selling value) with made-up rates.
- [ ] **Step 2: Write the failing tests**: `hnb.requests({})` returns the two URLs from Appendix B.1; `hnb.parse` gives a USD quote with buying 328.75 on 2026-11-06 and source `hnb`; `numbers-lk.parse([html], { bank: 'HNB' })` gives the HNB row's buying rate with the row's own date and source `numbers-lk:HNB`; an unknown bank throws `RateSourceError`; a page without the table throws `RateSourceError('table not found')`; a `—` selling value gives `selling: undefined`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core/test/rates.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** numbers.lk: take the first `<table>` after the text `Telegraphic Transfer (TT)`, drop `<style>` and `<svg>` blocks, split rows and cells, and read each cell's text nodes.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `Add exchange rate sources`.

### Task 23: Report script and contributor docs

**Files:**
- Create: `packages/core/scripts/report.ts`, `docs/adding-a-bank.md`
- Modify: `packages/core/package.json` (script `report`), `README.md` (a short "Develop" section)

**Interfaces:**
- Consumes: `loadConfig`, `loadDecisions`, `buildLedger`, views.
- Produces: `pnpm --filter @kanakku/core report --data <folder> [--today YYYY-MM-DD]` prints accounts by bank with balances and coverage, transfers by status, conversions, card cycles, Needs you items and month-end net worth for the last 12 months. It reads `<data>/kanakku/config.yaml`, `decisions.yaml` and `rates/*.csv` when present, and every file in the configured folders.

- [ ] **Step 1: Run** the report on `packages/core/test/fixtures/ledger` with `--today 2026-03-10`. Expected: the balances asserted in Task 19.
- [ ] **Step 2: Write** `docs/adding-a-bank.md`: folder layout, the plug-in contract, detection rules, fixtures (synthetic only), wording rules, tests, registry line.
- [ ] **Step 3: Local only, not committed:** write the author's config in their own data folder, run the report on it, and compare with `.internal-works/kanakku-v1/real-data-notes.md`. Every mismatch becomes a failing synthetic test in the owning task before it is fixed.
- [ ] **Step 4: Run** `pnpm lint && pnpm check && pnpm test`. Expected: all pass.
- [ ] **Step 5: Commit** `Add ledger report script and bank plug-in guide`.
