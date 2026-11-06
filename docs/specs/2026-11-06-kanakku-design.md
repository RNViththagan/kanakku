# Kanakku design

- Date: 2026-11-06
- Status: agreed in conversation. Building has started.

## 1. Purpose

Most people keep money in more than one place: a few bank accounts, a credit card, fixed deposits, sometimes a foreign-currency account. Each bank sends its own statements. Nobody shows the whole picture.

Adding statements up by hand is also misleading. Money moved between your own accounts looks like spending in one statement and income in another. Statements overlap, and some periods go missing without anyone noticing.

Kanakku reads the statement files people already download and joins them into one ledger. It shows what you have, what came in, what went out, and how money moved between your own accounts. It runs on your own computer.

Kanakku is generic. Its core knows nothing about any one person, bank or country. Bank knowledge lives in bank plug-ins. Exchange-rate knowledge lives in rate-source plug-ins. Personal facts live in each user's own config.

## 2. Who it is for

- Anyone who downloads statement files from their banks and wants one private view of all of them.
- People with several banks, cards, fixed deposits or currencies.
- Contributors who add a plug-in for their own bank.

## 3. Goals

1. **One system.** All accounts, at any bank, in any currency, shown together: by account, by bank and as a whole.
2. **True income and spending.** Transfers between your own accounts are recognised and kept out of income and spending. This includes fees and currency conversions.
3. **Trustworthy history.** Overlapping statements are merged without double counting. Missing periods are found and shown.
4. **Little upkeep.** You drop files into folders. Kanakku detects what each file is, suggests proper names and places, and imports new files for you.
5. **Plug-in banks.** Supporting a new bank means adding one plug-in. Nothing else changes.
6. **Your settings in your folder.** You choose the data folder and the bank folders. Settings live in a plain config file inside the data folder, editable by hand or from the app.
7. **Several currencies.** You pick a home currency. Foreign money is valued at a current bank rate. Every conversion you made keeps the rate you actually got.
8. **Cards and fixed deposits.** Card billing cycles, due dates and amounts owed. Fixed deposits placed, returned and earning interest.
9. **Analysis.** Pages with charts and trends for net worth, cash flow, spending and transfers.

## 4. Not in the first version

- Budgets and savings goals.
- PDF statements, payslips and receipts.
- A phone app.
- Shared or household use by several people.
- Downloading statements from banks automatically.
- Investments other than fixed deposits.
- Tax reports and exports to accounting tools.
- Sync between computers.
- Languages other than English.

## 5. Kanakku never

- Sends your statements or numbers anywhere. The only network requests are for public exchange rates, and you can turn them off.
- Asks for bank logins. It only reads files you download yourself.
- Moves, renames or deletes a statement file without your OK. Every move can be undone.
- Guesses quietly. Anything it is unsure about appears in "Needs you", and every automatic match can be undone.
- Locks your data in. Your settings and answers are plain text files in your data folder.
- Ships anyone's real statements. The repository holds made-up sample files only.

## 6. Constraints

- **Local only.** One command starts a local server on 127.0.0.1 and opens the browser. No sign-up and no cloud.
- **Files are the source of truth.** Statement files, your config and your saved answers are everything. Anything Kanakku computes can be rebuilt from them. There is no database.
- **Statement files are read-only to the engine.** Only the tidy-up and import tools write to bank folders, and only with your OK.
- **Generic core.** No bank names, countries, currencies, merchants or people appear in the core.
- **TypeScript** for all code. Runs on macOS, Linux and Windows with Node 22 or later.
- **Oxygen UI** for the interface: `@wso2/oxygen-ui`, `@wso2/oxygen-ui-icons-react` and `@wso2/oxygen-ui-charts-react`, version 0.21. It builds on MUI 7 and needs React 19.2.3. Follow its rules:
  - import components from `@wso2/oxygen-ui`, never from `@mui/material`;
  - wrap the app in `OxygenUIThemeProvider`;
  - take icons from `@wso2/oxygen-ui-icons-react`;
  - style with theme tokens through `sx`;
  - use MUI X components through their namespaces (`DataGrid.DataGrid`, `DatePickers.*`).
- **Public repository.** Only synthetic test files go in it, with guards against committing real statements.

## 7. The model

Every bank, account type and currency fits into this model the same way.

### 7.1 Building blocks

| Block | What it is | Key fields |
|---|---|---|
| Bank | An institution that holds accounts. Known through a bank plug-in. | `id`, `name`, `shortName` |
| Account | A place where money sits. Belongs to one bank. | `id`, `name`, `bank`, `type`, `currency`, `number`, `opened`, `closed`, type settings |
| Account type | `savings`, `current`, `credit-card` or `fixed-deposit`. Any bank can hold any type. | |
| Currency | An ISO 4217 code. Any account can be in any currency. | code, minor units |
| Statement file | A file in a bank folder that a plug-in can read. | path, format, account, period, rows |
| Transaction | One real money movement on one account, after duplicates across files are merged. | id, account, date, amount, balance, description, reference, kind, category, sources |
| Transfer | Money leaving one of your accounts and arriving in another. | outgoing row, incoming row, fee, rule, status |
| Conversion | A transfer between accounts in different currencies. | amount out, amount in, rate |
| Rate | The value of a foreign currency in your home currency on a day. | currency, date, buying, selling, source |

Rules that hold everywhere:

- An account's behaviour comes from its type and currency, never from its bank. A credit card at any bank has billing cycles. A USD account at any bank is valued with USD rates.
- A bank plug-in only reads its bank's files and explains its bank's wording. It cannot change how types, currencies, transfers or valuation work.
- Money is an integer number of minor units (cents) with a currency. Never a floating point number.
- Dates are calendar dates (`YYYY-MM-DD`) with no time zone.

### 7.2 Kinds and categories

Every transaction has one **kind**, which decides how it is counted:

| Kind | Meaning | Counted in |
|---|---|---|
| `income` | Money in from outside you | Cash flow, in |
| `spending` | Money out to outside you. Refunds are negative spending. | Cash flow, out |
| `transfer` | Money between two of your own accounts, including cards, fixed deposits and other currencies | Neither |
| `other` | Your own money that is neither, such as depositing cash you already had | Neither |

A **category** adds detail inside a kind: Salary, Interest, Groceries, Fees, Tax, Cash and so on. Categories are a list you can edit. Kanakku starts with a short default list.

One row can hold more than one kind. A transfer that lost a fee (40,025 sent, 40,000 received) or a deposit closure that pays principal and interest is one transaction with **parts**. Each part has a kind, a category and an amount, and the parts add up to the row. The 40,025 row has a transfer part of 40,000 and a spending part of 25 in Fees. Views add up parts. A transaction's own kind is its main part, used for display. An answer that sets a category on a split row changes its non-transfer part.

### 7.3 Account types

- **savings and current:** the balance comes from the statement's running balance, or from adding up rows when a format has none.
- **credit-card:** the balance is what you owe. It counts as a negative in net worth. Each card has a statement day, a due day and an optional limit in config. Purchases are spending on the day you buy. Paying the bill is a transfer from a bank account to the card.
- **fixed-deposit:** the balance is the principal still placed. Placing money is a transfer into the deposit. Getting principal back is a transfer out of it. Interest is income. Deposits come from config (principal, start, term, rate) or are discovered from statement wording.

## 8. Bank plug-ins

### 8.1 What a plug-in provides

```ts
interface BankPlugin {
  id: string;              // "boc"
  name: string;            // "Bank of Ceylon"
  shortName: string;       // "BOC", used in folder and file names
  country?: string;        // ISO 3166 code, for grouping in Settings
  formats: StatementFormat[];
  wording: WordingRule[];
  transferFees?: Partial<Record<CurrencyCode, number[]>>; // usual fees, minor units
}

interface StatementFormat {
  id: string;              // "boc-account-csv"
  fileTypes: string[];     // [".csv"]
  accountTypes: AccountType[];
  detect(file: FileInput): Detection | null;
  parse(file: FileInput): ParsedStatement;
}

interface ParsedStatement {
  account: { number?: string; masked?: string; currency?: string; type?: AccountType };
  period?: { from: string; to: string };   // only when the file states it
  closingBalance?: number;                 // only when the file states it
  generatedAt?: string;
  rows: ParsedRow[];                        // in file order
  checks?: { credits?: number; debits?: number; creditCount?: number; debitCount?: number };
  issues: Issue[];
}

interface ParsedRow {
  line: number;
  date: string;
  description: string;
  amount: number;          // minor units, positive is money in
  balance?: number;        // running balance after this row
  reference?: string;
  raw: string[];
}
```

- `detect` reads the file content and returns a confidence from 0 to 1. The file name is only a weak hint. The folder is never used, because people drop files into the wrong folder.
- `parse` returns rows as the bank wrote them, plus what the file says about the account and period. It does no matching, merging or classifying.
- `wording` rules explain the bank's descriptions to the shared engine: interest, tax on interest, fees, cash withdrawals, card payments, fixed-deposit placements and returns (with the deposit number when the wording has it), and hints that a row is a transfer between banks. Each rule is a pattern plus what it means. Wording rules start from descriptions seen in real files and grow as people report new ones.

### 8.2 Adding a bank

A new bank is one folder, `packages/core/src/banks/<id>/`, holding the plug-in, its formats, its wording rules, synthetic fixture files and tests, plus one line in the plug-in registry. `docs/adding-a-bank.md` explains how.

### 8.3 Included plug-ins

Bank of Ceylon, Commercial Bank and Hatton National Bank. Their file layouts and wording are in Appendix A.

## 9. From files to one ledger

The engine is one pure function: `buildLedger(files, config, decisions, rates) → Ledger`. It runs in full after every change. Personal data is small (thousands of rows), so there is no incremental update.

### 9.1 Find files

Scan every configured bank folder, including subfolders, for files of a type some plug-in reads. Skip hidden files and Kanakku's own folder. Read text as UTF-8, remove a byte order mark, and accept any line ending.

### 9.2 Detect and parse

Run every format's `detect` on each file. The highest confidence above 0.5 wins. A tie or no match makes the file "unreadable", which goes to Needs you. A file whose bank differs from its folder's bank is still read, and tidy-up suggests moving it.

When the totals a bank printed (`checks`) disagree with the rows, record an issue.

### 9.3 Assign the account

In this order:

1. A full account number in the file that matches an account in config.
2. A masked number in the file that fits exactly one account (all shown digits match).
3. An account number in the file name: the bank's own download name, or Kanakku's tidy name.
4. A saved answer for this file, keyed by a hash of its content.
5. The only account in config with the same bank and a type the format can hold.
6. Otherwise ask in Needs you. When the number is new, offer to add the account with bank, number, currency and type filled in.

A file that states an account number (full or masked) that fits no account never reaches rules 3 and 5. Opening a second account at the same bank must not pour its rows into the first. It goes to rule 6, unless you already answered for that file.

### 9.4 Put rows in time order

Banks list rows newest first or oldest first, and order same-day rows in different ways. When a format has a running balance, use it. For each pair of neighbouring rows, check which direction makes `balance = previous balance + amount` hold, and take the majority. Then, inside any day where the chain still breaks, try the orders of that day's rows and keep one that holds. Without a running balance, sort by date and keep file order within a day.

### 9.5 Merge overlapping statements

Files for one account often overlap. For each account:

- Give every row a key: date, amount, reference (when the row has one) and description with spaces and case normalised. The running balance is not part of the key, so one disagreement between files cannot make every later row look new.
- Count how often each key appears in each file. Keep the largest count across files, not the sum. Two identical purchases on one day stay two. One purchase seen in two files becomes one.
- Each kept row takes its running balance from the newest file that has it: the latest generation date, else the latest period end.
- Each kept transaction lists every file and line it was seen in.
- The transaction id is a hash of account id, key and occurrence number. It does not change when files are added, renamed or removed, so saved answers keep working.

After merging, order the rows (9.4) and check the balance chain. A break means rows are missing, or two files disagree inside their overlap (a row one has and the other lacks). Kanakku does not choose between files. The break goes to Needs you with the dates on both sides and the files involved.

### 9.6 Coverage and missing periods

Each file covers a period. Use the period stated in the file. Otherwise use the dates in Kanakku's tidy file name. Otherwise use the period the plug-in infers (a whole month for HNB). Otherwise use the first to the last row date, or to the closing-balance date when the file states one. When the file says when it was generated, and that day is at most 7 days after its last row, the period runs to the generation day. A file downloaded months after its range never claims those months.

For each account:

- **Covered:** the union of its files' periods.
- **Quiet:** a hole between covered periods where the balance chain still holds. Nothing is missing, there was just no activity. Shown in a lighter shade, not as a problem.
- **Missing:** a hole where the chain breaks, or any hole in an account without a running balance (cards follow 9.10). Goes to Needs you.
- **Behind:** the last covered day is more than 7 days ago. Shown on Accounts ("statements end 6 Nov"). Not a problem.

### 9.7 Classify

Each step only settles what the earlier steps left open:

1. **Your answers** about a transaction (9.12).
2. **Your rules** from config: text or pattern, with optional account, direction and amount range. A rule sets kind, category or both.
3. **Wording rules** from the bank plug-in: interest, tax, fees, cash, fixed-deposit events. Card-payment and transfer hints are passed on to matching.
4. **Transfer matching** (9.8) and **fixed deposits** (9.9).
5. **Defaults:** money in is `income` in "Other income". Money out is `spending` in "Uncategorised".

### 9.8 Transfers between your own accounts

An outgoing row in account A and an incoming row in account B match when all of these hold:

- A and B are different accounts, both yours: in config, or deposits Kanakku discovered (9.9).
- Neither row is already in a transfer.
- The dates are at most `transfers.windowDays` apart (default 3).
- The amounts fit:
  - **Same currency:** equal, or the outgoing amount is larger by a usual fee (from the plug-ins or `transfers.fees` in config). The difference is spending in Fees, dated on the outgoing side.
  - **Different currencies:** only when both rows carry the same bank reference (some banks put one reference on both sides of an internal transfer), or by your answer. The result is a conversion (9.11).

Candidates are scored, best first: same reference, exact amount, fee-adjusted amount, fewer days apart, incoming on or after outgoing, transfer hints or your names (`you.names`) in either description. Pairs are taken best first. When two candidates tie for best, nothing is matched and Needs you asks which one.

Rows with a transfer hint but no match become one of:

- **Waiting:** the matching window reaches past the last statement of another of your accounts. The other side is probably in a file not added yet. Listed on Transfers, not counted as a problem.
- **One-sided:** the wording names one of your accounts (a card payment, a deposit number), and that account has no statement for that date. Counted as a transfer to that account.
- **Possible transfer:** anything else. The row keeps its default kind and goes to the Needs you list on the Transfers page, where you pick the account or say it is not a transfer.

Every automatic match can be undone, and any two rows can be paired by hand.

A one-sided transfer keeps the row out of income and spending. It never changes the balance of an account that has statements, because statements are the source of that balance. Only deposits get their balance from transfers (9.9).

### 9.9 Fixed deposits

- Wording rules recognise placements, principal returns, interest and closure proceeds, with the deposit number when the wording has one.
- A deposit number not in config becomes a "discovered" fixed-deposit account. You can name it and add term, rate and maturity.
- A placement is a transfer from the paying account to the deposit. A principal return is a transfer back. Interest is income in Interest.
- Closure proceeds that mix principal and interest are split using the placed principal. When the placement is older than your statements, Needs you asks for the principal. Until you answer, the whole amount counts as principal.
- A return that names no deposit goes to an open deposit at the same bank with the same principal. Otherwise it goes to that bank's pool of unnamed deposits, which is a discovered deposit account too.
- **Statements win.** A deposit's balance is built from its placements and returns. A config deposit with `principal` and `start` counts from `start` only when no placement for it appears in statements, and then Kanakku does not ask for its principal. When a placement appears and differs from the config principal, the statement wins and an issue is recorded.
- **Never below zero.** A return larger than what Kanakku saw placed means the deposit is older than your statements. The excess counts as money from before your statements, the balance stays at zero, and Needs you asks you to add the deposit to config.
- Net worth counts principal still placed. Interest counts when paid, not as it builds up.
- With a maturity date, Needs you reminds you 7 days before.

### 9.10 Credit cards

- Charges are spending on the purchase date. Credits are payments when matched to money leaving a bank account or worded as a payment. Other credits are refunds: negative spending in Refunds. Interest the card charges is spending in Fees.
- Owed on a day = opening owed (config, default 0 at the first statement) + charges − credits up to that day. In net worth a card counts as minus what is owed.
- **Billing cycles** come from the card's statement day S and due day D. The statement date is day S of each month, or the month's last day when the month is shorter. A cycle runs from the day after the previous statement date to the statement date. The due date is day D (clamped the same way) of the statement's month when D > S, otherwise of the next month.
- For each cycle: charges, credits, amount billed (owed on the statement date), amount paid (card credits after the statement date, up to the next statement date) and status:
  - open until the statement date;
  - paid when nothing is owed or the payments cover the bill, even if late;
  - overdue after the due date while payments are short;
  - part paid when some is paid and the due date has not passed;
  - unpaid otherwise.
- Needs you shows the next bill 7 days before it is due, and any overdue bill.
- Card coverage is by cycle. A cycle with no file is missing. A file generated before its cycle closed is "partial".

### 9.11 Currencies and valuation

- **Home currency:** chosen at first run, any ISO code. All totals use it.
- **Conversions:** every transfer between accounts in different currencies becomes a conversion record: date, amount and currency out, amount and currency in, the rate achieved (home units per foreign unit) and the reference. From that day the money counts at the amount you actually got. The record never changes when rates change.
- **Holdings:** foreign money still held, in accounts and fixed deposits, is valued at `balance × rate(currency, day)`.
- **Income and spending** in a foreign currency are valued at the rate of their own day.
- **Rate for a day,** in this order: the selected source's rate for that day; the nearest earlier stored rate; the rate of your nearest conversion in that currency; your manual rate; otherwise "no rate", which shows the value as unknown and adds a Needs you item.
- Rates are the bank's **buying** rate, which is what the bank pays for your foreign money.
- Rates are kept as whole numbers of millionths, and valuation multiplies with exact integers, so no rounding error creeps in.
- **Rate sources are plug-ins:**

```ts
interface RateSource {
  id: string;                         // "hnb"
  name: string;
  quoteCurrency: CurrencyCode;        // rates are in this currency
  currencies: CurrencyCode[] | "any";
  options?: OptionSpec[];             // for example, which bank
  requests(options: Record<string, string>): string[];               // URLs to fetch
  parse(bodies: string[], options: Record<string, string>): RateQuote[];  // pure
}
```

- A source applies only when its quote currency is your home currency.
- Included sources: HNB, numbers.lk, manual and off (Appendix B).
- The server fetches the selected source at most once a day, and on "Refresh now". Results are stored in `kanakku/rates/<CURRENCY>.csv` with date, buying, selling and source. Anywhere a valued amount appears, you can see the rate, its source and its day.
- Requests carry no personal data: a plain GET with a `kanakku/<version>` user agent and no cookies.
- The included online sources are unofficial. When one fails or changes, Kanakku keeps using stored rates and shows the error in Settings.

### 9.12 Your answers

Answers you give in the app are saved in `kanakku/decisions.yaml`. Each answer has a type, the ids it refers to and when it was made:

| Type | Meaning |
|---|---|
| `file-account` | This file (by content hash) belongs to this account. |
| `pair` | These two transactions are a transfer. |
| `not-transfer` | This transaction is not a transfer, or this automatic pair is wrong. |
| `set` | This transaction's kind, category or both. |
| `counterparty` | This name or number in descriptions is one of my accounts, or is not. |
| `fd-principal` | The principal of this deposit. |
| `dismiss` | Hide this Needs you item. |

Answers that point at transactions no longer present are kept and listed in Settings as unused. Removing an answer brings back the automatic result.

"Mine" on a counterparty opens the add-account form, filled in from the description, and saves the account to config. Rows naming it become one-sided transfers to it. Until you add its statements it has no known balance, so it adds nothing to net worth. "Not mine" stops the question and the rows stay income or spending.

Accounts, rules, card settings and deposits belong in config, not in answers.

### 9.13 Views

Core also computes what the pages show:

- **Net worth on a day:** the sum over accounts of their balance that day in home currency. An account adds nothing before its first known day. The chart shades any stretch where some account is not yet known and names those accounts.
- **Cash flow per month:** income and spending kinds only. Transfers never count. Transfer fees count as spending.
- **Spending per category per month,** with card and bank spending together.
- **Transfers for a range:** a matrix and a flow list between accounts, with totals and counts.

## 10. Needs you

One list of things only you can settle. Each item has a type, a short message, links to its data and one or two actions.

| Item | Actions |
|---|---|
| New account found in a file | Add account (filled in) |
| File whose account is unclear | Pick account |
| File no plug-in can read | Show file, Ignore |
| Missing period or broken balance chain | Show, Add statement, Ignore |
| Possible transfer with no match | Pick account, Not a transfer |
| Two equally good matches | Choose one |
| A name or number that may be one of your accounts | Mine, Not mine |
| Spending without a category | Categorise |
| Fixed deposit without principal or maturity | Add details |
| Card bill due within 7 days, or overdue | Show cycle |
| Foreign currency without a rate | Set a rate |
| Files with improper names or in the wrong folder | Tidy up |
| Bank totals that disagree with a file's rows | Show file |

Items close by themselves once the data no longer calls for them. Waiting transfers are listed apart and are not problems. Overview shows the most important items, and a single line for groups ("12 possible transfers to check").

## 11. Statement tools

### 11.1 Tidy-up

Suggests a name and a folder for every statement file. Nothing happens without your OK.

- **Name:** `{bank}_{label}[_{currency}]_{from}_to_{to}[_partial].{ext}`.
  - `bank` is the plug-in's short name.
  - `label` is the account number as known (full or masked). Without a number it is the type (`CreditCard`, `FixedDeposit`). When that is still ambiguous, the account id is added.
  - `currency` appears when you have accounts at that bank in more than one currency.
  - `from` and `to` are the period from 9.6. For cards, they are the billing cycle or cycles the rows fall in.
  - `_partial` marks a card cycle that has not closed.
- **Folder:** the configured folder for the file's bank.
- **Duplicates:** a file whose rows all appear in other files of the same account, and whose period is inside theirs, is suggested for the system bin (Trash or Recycle Bin). Never deleted outright.
- **Never overwrite.** When the target name exists, add `_2`.
- Moves are applied as a batch and written to `kanakku/moves.log`, one JSON line per move: time, batch, from, to and reason. Undo reverses a batch, if nothing has changed since.

### 11.2 Import

- On the Statements page, drop files or pick them. The server reads each one and shows its bank, account, period, how many rows are new, and where it will go.
- A file with nothing new is marked "already have all of this".
- On OK, files are written to their bank folders under tidy names and logged in `moves.log`. Undo moves an imported file to the system bin.

## 12. Folders, config and saved state

### 12.1 Layout

```
<data folder>/                  chosen at first run
  kanakku/
    config.yaml                 settings, accounts, folders, rules
    decisions.yaml              your answers
    rates/USD.csv               stored rates, one file per currency
    moves.log                   every move made by tidy-up and import
    backups/                    config and answers before each save
  Bank/<shortName>/             bank folders, created at first run; any path works
```

Kanakku finds the data folder from, in order: the `--data` option, the `KANAKKU_DATA` environment variable, then an app file in the user's config folder (`~/.config/kanakku/app.yaml` on macOS and Linux, `%APPDATA%\kanakku\app.yaml` on Windows). First run writes the app file.

### 12.2 config.yaml

```yaml
version: 1
homeCurrency: LKR
locale: en-LK
folders:
  - path: Bank/BOC            # relative to the data folder, or absolute
    bank: boc
  - path: Bank/ComBank
    bank: combank
accounts:
  - id: main
    name: Main account
    bank: boc
    type: savings
    currency: LKR
    number: "0012345678"
    opened: 2024-01-15
  - id: card
    name: Credit card
    bank: combank
    type: credit-card
    currency: LKR
    card: { statementDay: 5, dueDay: 26, limit: 300000, openingOwed: 0 }
  - id: deposit-1
    name: One-year deposit
    bank: combank
    type: fixed-deposit
    currency: LKR
    number: "003012345678"
    deposit: { principal: 500000, start: 2026-01-10, months: 12, rate: 9.0 }
you:
  names: ["A PERERA", "PERERA A"]   # how your name appears in descriptions
transfers:
  windowDays: 3
  fees: { LKR: [25, 50] }
rates:
  source: hnb                  # hnb, numbers-lk, manual or off
  options: {}
  manual: { USD: 330.00 }
categories:
  income: [Salary, Interest, Other income]
  spending: [Groceries, Food and dining, Shopping, Transport, Bills, Rent, Health, Education, Entertainment, Travel, Gifts, To people, Cash, Fees, Tax, Refunds, Uncategorised]
rules:
  - match: "SALARY"
    kind: income
    category: Salary
  - match: { regex: "SUPERMARKET|GROCER" }
    category: Groceries
```

- Amounts in config use normal units (300000), not minor units.
- The file is validated on load. Errors name the line: `config.yaml line 14: accounts[1].currency must be a 3-letter code`. With errors, the app opens Settings and shows them.
- Settings writes the file with a YAML library that keeps comments and order. A copy goes to `backups/` before each save, keeping the newest 20. Writes are atomic: write a temporary file, then rename it.
- The repository ships `config.example.yaml` with made-up values.

### 12.3 Watching

The server watches the data folder and the bank folders. Half a second after changes stop, it rebuilds the ledger and tells open pages to refresh.

## 13. Pages

Built with Oxygen UI: `AppShell` with `Sidebar` and `Header`, `PageContent`, `StatCard`, charts from `@wso2/oxygen-ui-charts-react`, the flow map with Recharts `Sankey`, and tables with `DataGrid`. Light and dark themes. Amounts follow the locale, and large numbers shorten on cards (3.4M). Every chart shows exact values in a tooltip or a table.

The header has the date range (this month; last 3, 6 or 12 months; this year; all; custom), the Needs you count and the theme switch.

The sidebar has Overview, Net worth, Cash flow, Spending, Transfers, Conversions (only with more than one currency), Accounts, Transactions, Statements and Settings.

1. **Overview.** Accounts and net worth first.
   - Stat cards: net worth with the change since last month, money in accounts, money in fixed deposits, owed on cards (when you have any), and spent this month next to last month.
   - Net worth chart for the last 12 months.
   - Needs you, top items with their actions.
   - Accounts grouped by bank: balance (plus home value for foreign accounts) and a coverage bar with holes for missing periods.
   - "Where <month> went": spending by category.
2. **Net worth.** Area chart over time, split by account type, bank or currency. Month-end table. Fixed deposits with principal, start, maturity, rate and days left.
3. **Cash flow.** Income against outgoing per month as bars, with the net as a line. Income split into salary, interest and other. Outgoing split into categories, fees and tax.
4. **Spending.** By category for the range, monthly trend, top payees. A category opens its transactions and 12-month trend. Filter by account or card.
5. **Transfers.** Both views, one above the other, then a list:
   - Flow map: accounts as nodes (deposits as one node per bank, unknown accounts dashed), links sized by amount and labelled with amount and count.
   - From/to table: every pair of accounts with amount and count.
   - Clicking a link or a cell lists its transfers.
   - Transfer list with tabs: Needs you, Waiting, All, Fixed deposits. Each row has date, from and to, amount, fee, status (matched, confirmed, waiting, no match) and actions.
6. **Conversions.** Your conversions with date, amounts, your rate and the source's rate that day when known. Average rate per currency. Foreign money held now and its value at today's rate, with source and date.
7. **Accounts.** Grouped by bank. Each account shows type, currency, balance, coverage bar and last statement date. An account page shows balance over time, statements and transactions. Card pages add billing cycles (statement date, billed, paid, due date, status) and use of the limit. Deposit pages show principal, term, rate and maturity.
8. **Transactions.** Every transaction with search and filters (range, account, bank, kind, category, amount). Change kind or category for one row, or for "all like this", which creates a rule. Rows show their transfer link and the files they came from.
9. **Statements.** For each account, a timeline of files over months with covered, quiet and missing parts. A file table with name, bank, account, period, rows and status (ok, duplicate, overlapping, improper name, wrong folder, unreadable). Tidy-up suggestions with approve, apply and undo. Import by dropping or picking files.
10. **Settings.** Data folder, bank folders, accounts (with card and deposit settings), home currency and locale, rate source and manual rates, categories, rules (with a live count of matching transactions), transfer settings, your names, and unused answers.
11. **First run.** Choose or create a data folder (a path field with a folder browser served by the server), pick a home currency and your banks, create bank folders, then scan and offer the accounts found in files already there.

## 14. Architecture

A pnpm workspace with three packages:

| Package | Role | May use |
|---|---|---|
| `packages/core` | Model, bank plug-ins, rate-source parsers, the ledger engine, views, tidy-up planner, config schema | No Node or browser APIs. Pure functions only. |
| `packages/server` | The `kanakku` command, data folder and config handling, scanning and watching, file moves with undo, rate fetching and storage, the HTTP API, serving the built web app | Node 22 |
| `packages/web` | The React app | React 19.2.3, Oxygen UI 0.21, Vite |

The server reads files, calls `buildLedger`, keeps the ledger in memory and serves JSON. Writes (answers, config, moves) go to files. That triggers a rebuild and an event to open pages.

The API is JSON under `/api`:

- `GET status`: data folder, config errors, last scan.
- `GET ledger`: accounts, transactions, transfers, conversions, deposits, card cycles, coverage, Needs you and rates.
- `GET views/net-worth`, `views/cash-flow`, `views/spending`, `views/transfers`, with `from`, `to` and `group`.
- `POST decisions`, `DELETE decisions/:id`.
- `GET config`, `PUT config`.
- `GET tidy`, `POST tidy/apply`, `POST tidy/undo`.
- `POST import` (multipart), `POST import/apply`.
- `POST rates/refresh`.
- `GET fs/dirs?path`: the folder browser, directory names only.
- `GET events`: server-sent events (`changed`).

To run: `pnpm install`, then `pnpm start` builds the web app, starts the server and opens the browser. `pnpm dev` runs Vite and the server with reload. `pnpm demo` starts Kanakku on the made-up demo data.

## 15. Security

Other websites can reach a local server through the browser. So:

- Listen on 127.0.0.1 only.
- Reject any request whose `Host` header is not `localhost:<port>` or `127.0.0.1:<port>`. This stops DNS rebinding.
- Every API call needs a random token created at start-up and placed in the served page. No CORS headers are sent.
- File operations stay inside the data folder and the configured bank folders. Paths are resolved and checked before every read, write or move.
- The folder browser lists directory names only.
- No telemetry.

## 16. Testing

- **core:** unit tests (Vitest) with synthetic fixtures in each bank's layout. Cover thousand separators, quoted fields, a missing final newline, empty months and footers; time ordering; merging overlaps; coverage and quiet periods; every transfer case (exact, fee, reference, cross-currency, window, tie, waiting, one-sided); deposits; card cycles including month ends; classification order; answers; valuation and rate fallback; tidy names; config errors; rate parsers against saved sample responses.
- **Demo data:** a made-up person with accounts at every included bank, a card, deposits and a foreign-currency account over 12 months. It includes overlaps, a missing period and a few unclear rows. Used by `pnpm demo`, by end-to-end tests and for screenshots.
- **server:** integration tests on temporary folders: scanning, watching, answers, config saves with backup, tidy apply and undo, import, and rate fetching against a fake network.
- **web:** Playwright smoke tests on the demo data. Every page loads and shows its key numbers.
- **Real data, locally:** a contributor can run the engine on their own folder and compare with numbers kept outside the repository.

## 17. Keeping real data out of the repository

- `.gitignore` blocks `.csv`, `.xls`, `.xlsx`, `.pdf` and `config.yaml`, except under `fixtures/` folders and the demo data folder.
- A pre-commit hook rejects staged statement-type files outside those folders. It also rejects staged text containing any line of an optional, git-ignored `.private-strings` file, where each contributor can list their own account numbers and names.
- CI runs type checks, lint, tests and the build on every push and pull request.

## 18. Calls made for the builder

Decided without discussion. They can change without changing what gets built.

- MIT licence.
- pnpm workspace, TypeScript, Vitest and Playwright.
- Server on Fastify. Watching with chokidar. YAML with `yaml`, which keeps comments. Validation with zod. CSV with csv-parse. Moving to the system bin with `trash`.
- Web with Vite, React Router and TanStack Query.
- Exact dependency versions in every `package.json`.
- Rates kept with 6 decimal places.
- Full ledger rebuild on every change.
- A fixed default port, configurable, moving to a free one when busy.
- Matching window 3 days. Reminders 7 days ahead. "Behind" after 7 days.
- Deposits valued at principal. Interest counts when paid.
- English only, with each page's text kept together so translation can come later.
- Split rows are one transaction with parts, not extra transactions (7.2).
- The merge key leaves out the running balance; disagreeing files go to Needs you instead of one file winning (9.5).
- Statements win over config for deposits, and a deposit never goes below zero (9.9).
- One-sided transfers never change the balance of an account with statements (9.8).
- "Mine" adds the counterparty as a config account (9.12).

## 19. Later

Budgets and goals. PDF statements, payslips and receipts. More banks and countries. More rate sources, such as central bank reference rates. Investments. Export. An encrypted data folder. Translations. `npx kanakku`. A desktop wrapper.

## Appendix A. Included bank plug-ins

All examples are made up.

### A.1 Bank of Ceylon (`boc`)

Format `boc-account-csv`, for savings and current accounts:

```
BANK OF CEYLON - ACCOUNT STATEMENT

Account Number,0012345678
Account Holder,MR A PERERA
Address,"1 SAMPLE ROAD,COLOMBO"
Branch,Sample Branch
Branch Contact,011 0000000
Currency,LKR
Statement Period,2026-01-01 to 2026-03-31
Generated On,01-04-2026 09:15 AM

TRANSACTION SUMMARY
Total Credits,"150,000.00",3 - item(s)
Total Debits,"42,500.00",12 - item(s)

TRANSACTION DETAILS
Date,Description,Transaction Type,Credit Amount,Debit Amount,Running Balance,Cheque Number,Branch ID
2026-03-30,POS       SUPERMART - COLOMBO,Debit,,"2,350.00","107,500.00",000000000,777
2026-03-28,INTEREST,Credit,12.40,,"109,850.00",000000000,761
```

- Detect: the first line is `BANK OF CEYLON - ACCOUNT STATEMENT`.
- Account number, currency and period come from the header. Holder, address and branch are not kept.
- Rows are newest first. Dates are `YYYY-MM-DD`. Amounts use thousand separators inside quotes.
- The summary totals and counts become `checks`.
- Seen wording: `INTEREST` (interest), `INTEREST WITHHELD` (tax), `ATM SERVICE CHARGE` and other `CHARGE` lines (fees), `ATMCASHWDL` (cash), `POS` and `ECOMMERCE` prefixes (card purchases), `CEFT` (transfer hint).

### A.2 Commercial Bank (`combank`)

Format `combank-account-csv`, for savings and current accounts:

```
,,,,Transaction History,,,,,,,
,,,,,,,,,,e-Receipt,
,Transaction Date,,Description,,Currency,Debit,Credit,Running Balance,,,
,30/03/2026,,INTEREST / - / -,,LKR,,"1,234.56","210,500.00",,,
,29/03/2026,,TRF TO: 003012345678 / IBT0000000001 / -,,LKR,"100,000.00",,"209,265.44",,,
,,Generated at 4/1/26 9:15 AM,,,,,,, Page 1 of ,, 1
"Commercial Bank of Ceylon PLC, No 21, Sir Razik Fareed Mawatha,
P.O. Box 856 Colombo 1, Sri Lanka.",,,,,,,,,,,
```

- Detect: a `Transaction History` title row, a header row from `Transaction Date` to `Running Balance`, and the bank's name in the footer.
- No account number inside. The bank's download name, `transaction_history_<account>_<yyyymmdd>.csv`, has it.
- Rows are newest first. Dates are `DD/MM/YYYY`. Descriptions have three parts split by ` / `.
- The table ends at the footer row with "Generated at", which uses `M/D/YY h:mm AM`. Both ComBank formats have this footer.
- Transfer fees come as separate rows (`IB CEFT CHGS`).

Format `combank-card-csv`, for credit cards:

- The same layout without `Running Balance`.
- Each description ends with a 12-digit reference: `SHOP NAME CITY CC / 123456789012 / -`.
- Rows are not strictly in date order. Debit is a charge. Credit is a payment or a refund.
- No card number inside. The bank's download name is `transactions_history_current_period.csv`.

Seen wording: `INTEREST` (interest), `ADVANCE INCOME TAX` (tax), `TRF TO: <deposit number>` (deposit placement), `IB Time Redemption Deposit` and `Principal from eFD` (deposit principal return), `Interest from eFD` (deposit interest), `INITIAL DEP` (opening deposit, kind `other` until you say otherwise), `CEFT` and `IBT` (transfer hints).

### A.3 Hatton National Bank (`hnb`)

Format `hnb-account-csv`, for savings and current accounts in any currency:

```
Date, Ref.No, Particulars, Debits, Credits, Balance
04/03/2026,DC123456,Finacle Alert Charges,25,,1200.50
24/03/2026,SD1234567,12345XXXXX67:Int.Pd:23-02-2026 to 23-03-2026,,2.54,1203.04
31/03/2026,,BALANCE AS AT DATE,,,1203.04
```

- Detect: the header line and a last row `BALANCE AS AT DATE`.
- Rows are oldest first. Dates are `DD/MM/YYYY`. Numbers are plain. The file often has no final newline.
- The last row gives the end date and the closing balance.
- No bank name, currency or full account number inside. Interest rows carry the masked number (`12345XXXXX67:Int.Pd:...`). The currency comes from the matched account. A month without an interest row has no masked number, so its file is assigned by its name or by asking.
- Header cells carry leading spaces; match them trimmed. Some rows have an empty description.
- One file per month is usual.
- Both sides of a transfer between two HNB accounts carry the same `Ref.No`, also across currencies.
- Seen wording: `<masked>:Int.Pd:` (interest), `Finacle Alert Charges`, `MB/IB FEE`, `Bi Annual Fee` and `COUNTER WITHDRAWAL CHGS` (fees), `Dr. Tran for funding A/c <number>` (deposit placement), `<number> : Closure Proceeds` (deposit closure, principal plus interest), `MB:` (transfer hint).

## Appendix B. Included rate sources

### B.1 HNB (`hnb`)

- `GET https://venus.hnb.lk/api/get_exchange_rates_contents_web` returns `[{ currency, currencyCode, buyingRate, sellingRate }]` for about 17 currencies.
- `GET https://venus.hnb.lk/api/get_exchange_rate_last_update_date_contents` returns `[{ lastUpdatedDate: "YYYY-MM-DD" }]`, used as the rate's day.
- Quote currency LKR. A plain GET works (checked 2026-11-06). It is the feed behind the bank's website, not a published API.

### B.2 numbers.lk (`numbers-lk`)

- `GET https://numbers.lk/trackers/exrates` returns an HTML page with a table titled "Bank rates | Telegraphic Transfer (TT)". Columns: rank, bank, buying, selling, spread, 14-day trend, source. The page states the date.
- About 20 Sri Lankan banks, USD only. Option: which bank.
- Parse the table defensively. When it changes, fail clearly and keep stored rates.

### B.3 Manual (`manual`) and off (`off`)

- Manual uses `rates.manual` from config.
- Off makes no requests. It uses stored rates, your conversions and manual rates.
