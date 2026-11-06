# Kanakku app, first slice: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kanakku` starts a local server and opens a read-only web app that shows the user's real data: Overview, Net worth, Cash flow, Spending, Transfers, Accounts, Transactions, Statements and Needs you.

**Architecture:** `packages/server` gains a small `node:http` server: it builds the ledger from the data folder with `@kanakku/core`, keeps it in memory, rebuilds when files change, and serves `/api/*` plus the built web app. `packages/web` is a Vite + React app with Oxygen UI. The browser fetches the whole ledger once and computes every view with `@kanakku/core`, which is pure and runs in the browser. Writes (answers, rules, settings, import, tidy-up) are the next slice.

**Tech Stack:** Node 22 `node:http` and `fs.watch`; React 19.2.3; `@wso2/oxygen-ui`, `@wso2/oxygen-ui-icons-react`, `@wso2/oxygen-ui-charts-react` 0.21.0; Vite 8.3.5 with `@vitejs/plugin-react` 6.2.1; Vitest.

**Spec:** `docs/specs/2026-11-06-kanakku-design.md` (sections 12.3, 13, 14, 15). Builds on `docs/plans/2026-11-06-core-engine.md`.

**Revision:** v2 after a Fable review: the last good ledger survives config errors, a header date range, an async CLI, safe static paths, stricter Host and token handling, robust watching, a working dev setup, a server-side tidy endpoint, and an explicit list of deferred section 13 items.

**Deferred to the next slice (not built here):** the Transfers flow map (needs `recharts` Sankey directly), Net worth split by type, bank or currency, Spending top payees, the per-account statement timeline, custom date ranges, Transactions filters by bank and amount, and every write (answers, rules, settings, import, applying tidy-up).

## Global Constraints

- The server listens on 127.0.0.1 only, rejects any `Host` other than `127.0.0.1:<port>` or `localhost:<port>`, requires the start-up token on every `/api` request (header `x-kanakku-token`, or `?token=` for the event stream), and sends no CORS headers.
- Static files are served only from the web build folder; resolved paths must stay inside it.
- The browser never receives the raw statement text. `/api/status` is built field by field, never by spreading the loaded folder.
- Every `/api` response and `index.html` carry `Cache-Control: no-store`; every response carries `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. Requests with no `Host`, a `Host` other than exactly `127.0.0.1:<port>` or `localhost:<port>`, or `Sec-Fetch-Site: cross-site` on `/api` are rejected. Tokens are compared with `crypto.timingSafeEqual`; `?token=` is accepted only on `/api/events`. Request URLs are never logged.
- Known limit: any local process can read the token from `/`; the threat model is other websites.
- Oxygen UI rules: import components from `@wso2/oxygen-ui`, never `@mui/material`; wrap the app in `OxygenUIThemeProvider`; icons from `@wso2/oxygen-ui-icons-react`; charts from `@wso2/oxygen-ui-charts-react`; MUI X through namespaces (`DataGrid.DataGrid`); style with theme tokens through `sx`.
- React 19.2.3 exactly (Oxygen UI's peer). No router package: react-router 8 needs a newer React, so pages switch on the URL hash.
- Exact dependency versions. No code comments unless the reason is non-obvious. Only synthetic data in the repository.
- Commit after each task and push the `first-version` branch.

## Review Focus

1. **Another website calling the local API** (DNS rebinding, a form post from a page the user has open): rejected by the Host check and the token. Tests in Task 1.
2. **Statement files changing while the app runs** (a download lands, a file is renamed): the ledger rebuilds once after changes settle and open pages refresh. Test in Task 2.
3. **A data folder with config errors or no config**: the server still starts, `/api/status` explains the problem, and the web app shows it instead of a blank page. Tests in Task 1 and Task 5.
4. **A large or empty ledger**: pages render with no accounts, no transactions or no foreign currency without crashing. Covered by view helper tests in Task 4.
5. **The port is busy**: start-up moves to the next free port and prints the address. Test in Task 3.

## File structure

```
packages/server/src/app.ts          state, ledger rebuild, HTTP routing
packages/server/src/watch.ts        debounced folder watching
packages/server/src/start.ts        port choice, browser opening, start-up
packages/server/src/cli.ts          `kanakku start` and bare `kanakku`
packages/server/test/app.test.ts, watch.test.ts, start.test.ts
packages/web/index.html, vite.config.ts, tsconfig.json, package.json
packages/web/src/main.tsx           theme provider and app shell
packages/web/src/api.ts             token, ledger fetch, event stream
packages/web/src/routes.ts          hash routes
packages/web/src/format.ts          money and date display
packages/web/src/model.ts           view helpers over the ledger (pure)
packages/web/src/pages/*.tsx        one file per page
packages/web/test/format.test.ts, model.test.ts, routes.test.ts
```

---

### Task 1: HTTP app with security checks

**Files:** Create `packages/server/src/app.ts`, `packages/server/test/app.test.ts`.

**Interfaces:**
- Produces: `createApp(options: { dataFolder: string; webRoot: string; token: string; today: () => IsoDate }): { server: http.Server; rebuild(): void; state(): AppState }` where `AppState = { ledger?: Ledger; tidy: TidyProposal[]; status: Status; builtAt?: string }` and `Status = { dataFolder: string; configPath: string; configErrors: ConfigError[]; decisionErrors: ConfigError[]; files: number; error?: string; stale: boolean }`.
- `rebuild()` never throws. When the config is missing or invalid, or `buildLedger` throws, it keeps the last good ledger, records the problem in `status` (`stale: true` when an older ledger is kept) and still notifies open pages.
- Routes: `GET /api/status` → `Status`; `GET /api/ledger` → the ledger JSON (503 with `Status` when there has never been one); `GET /api/tidy` → `TidyProposal[]` from `planTidy` with the folders and the set of paths on disk; `GET /api/events` → server-sent events; anything else → a regular file inside `webRoot` with a MIME type from a fixed map (`.js .css .svg .woff2 .woff .ttf .png .ico .json .map .html`), else `index.html` (single-page fallback) with `<meta name="kanakku-token" content="<token>">` added to its head. The whole handler is wrapped so any error becomes a 500.
- Static paths: `decodeURIComponent` inside try (failure → 404), reject `\0`, `path.resolve(webRoot, '.' + path)` must stay inside `webRoot`, and only regular files are served.

- [ ] **Step 1: Write the failing tests** against a server on an ephemeral port with the core fixture world as the data folder and a temporary `webRoot` holding `index.html` and `app.js`:
  - `rejects a foreign Host header` (403 for `Host: evil.example:PORT`, for `localhost:<other port>`, and for no Host at all).
  - `requires the token on api requests` (401 without, 401 with a wrong token, 200 with the header; `?token=` works only on `/api/events`).
  - `rejects cross-site api requests` (`Sec-Fetch-Site: cross-site` → 403).
  - `serves the ledger` (accounts include `boc-main`; `files` count 7) and `never sends raw statement text` (neither `/api/status` nor `/api/ledger` contains a distinctive fixture line).
  - `explains a broken data folder` (a folder without config: `/api/ledger` is 503 and `/api/status` lists the config error).
  - `keeps the last good ledger when the config breaks` (good folder, break `config.yaml`, rebuild: `/api/ledger` still 200 and `/api/status` lists the error with `stale: true`; fix it, rebuild: error cleared).
  - `serves tidy suggestions` (`/api/tidy` lists the misplaced USD file).
  - `serves the app with the token` (`/` and `/accounts` both return `index.html` containing the meta tag and `Cache-Control: no-store`; `/app.js` returns the asset with a JavaScript content type).
  - `refuses paths outside the web root and survives bad paths` (`/..%2fpackage.json`, `/%2e%2e%2fpackage.json`, `/%zz`, `/%00` never return the file and the server still answers afterwards).
  - `sends no CORS headers and sets nosniff and frame headers`.
- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `node:http`. Build the ledger with `loadDataFolder` and `buildLedger`; on any thrown error keep the previous ledger and record `error`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Add local HTTP app with host and token checks`.

### Task 2: Rebuild on file changes

**Files:** Create `packages/server/src/watch.ts`, `packages/server/test/watch.test.ts`; modify `app.ts`.

**Interfaces:**
- Produces: `watchFolders(folders: string[], onChange: () => void, delayMs = 500): { close(): void }` using `fs.watch` with `recursive: true`, debounced. Missing folders are skipped, `error` events are handled, a `null` filename counts as a change, and paths with any segment starting with `.` are ignored. `createApp` gains `options.watch?: boolean`; after a rebuild it re-creates the watchers when `config.folders` changed and sends `event: changed` to every open event stream.

- [ ] **Step 1: Write the failing tests** on a temporary copy of the fixture world: three files written back to back call `onChange` once within 1.5 seconds; a configured folder that does not exist does not throw; with the app, an open event stream receives `changed` and `/api/ledger` then shows the new file.
- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/watch.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Watch the data folder and every configured bank folder outside it; ignore `.`-files.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Rebuild the ledger when statement files change`.

### Task 3: `kanakku start`

**Files:** Create `packages/server/src/start.ts`, `packages/server/test/start.test.ts`; modify `cli.ts` and its test.

**Interfaces:**
- Produces: `findPort(preferred: number, host = '127.0.0.1', tries = 50): Promise<number>`; `startApp(options: { dataFolder: string; webRoot: string; port?: number; open?: boolean; token?: string }): Promise<{ url: string; close(): Promise<void> }>`; `openBrowser(url: string)` spawning `open` (macOS), `xdg-open` (Linux) or `cmd /c start "" "<url>"` (Windows) detached with `stdio: 'ignore'`, `unref()` and an `error` handler. Default port 5170.
- `runCli` and `main` become async (`Promise<number>`); the launcher does `process.exitCode = await main()`; `start` resolves once listening and the server keeps the process alive, closing on SIGINT and SIGTERM.
- `kanakku` with no command and `kanakku start [--port N] [--no-open]` start the app when a data folder is known, else print the `kanakku use <folder>` hint and exit 1 (`kanakku help` still prints help). The URL (with no token in it) is printed. When the web build is missing, start prints `Run pnpm build first` and exits 1. `KANAKKU_TOKEN` overrides the random token, for `pnpm dev` only.

- [ ] **Step 1: Write the failing tests**: `findPort` returns the next port when the preferred one is taken; `startApp` serves `/api/status` with the token taken from the served `index.html`; the CLI with `start --no-open` on a missing web build exits 1 with that message; bare `kanakku` with no data folder exits 1 with the `kanakku use` hint; the existing CLI tests pass awaited.
- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/start.test.ts packages/server/test/cli.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The token is 32 random bytes in hex from `node:crypto`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `Add kanakku start`.

### Task 4: Web app shell, data and view helpers

**Files:** Create `packages/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `packages/web/src/{main.tsx,api.ts,routes.ts,format.ts,model.ts}`, `packages/web/test/{format,model,routes}.test.ts`; modify root `package.json` (scripts `build`, `dev`), `vitest.config.ts` (include `packages/web/test`).

**Interfaces:**
- `api.ts`: `readToken(): string` (from the meta tag), `fetchLedger(): Promise<Ledger>`, `fetchStatus()`, `fetchTidy()`, `subscribe(onChanged: () => void): () => void` (EventSource on `/api/events?token=`), `useLedger(): { ledger?: Ledger; status?: Status; tidy: TidyProposal[]; loading: boolean; error?: string }`. On a 401 the page reloads once (a restarted server has a new token); a session flag stops a reload loop.
- Dev: `vite.config.ts` proxies `/api` to `http://127.0.0.1:5170` and a small plugin injects `<meta name="kanakku-token">` from `KANAKKU_TOKEN` through `transformIndexHtml`; `pnpm dev` runs the server with the same `KANAKKU_TOKEN`.
- Range: `type RangePreset = 'this-month' | '3m' | '6m' | '12m' | 'this-year' | 'all'`, `rangeFor(preset, today, ledger): DateRange`; the header has a preset selector and every page that shows a period takes the range.
- `routes.ts`: `type Route = { page: PageId; param?: string }`, `parseHash(hash: string): Route`, `hrefFor(route: Route): string`. Pages: `overview`, `net-worth`, `cash-flow`, `spending`, `transfers`, `conversions`, `accounts`, `account`, `transactions`, `statements`, `needs`.
- `format.ts`: `money(minor, currency, locale)` (full), `compact(minor, currency, locale)` (divides by the currency's minor units, then `Intl.NumberFormat` with `notation: 'compact'`, for example 3.9M), `shortDate(iso, locale)` (`6 Nov 2026`, built with `Date.UTC` and formatted in `timeZone: 'UTC'`), `monthLabel('2026-10')` (`Oct 2026`).
- `model.ts` (pure, over `Ledger`): `overviewStats(ledger)`, `accountsByBank(ledger)`, `latestMonth(ledger)`, `rangeEndingAt(today, months)`, `transactionRows(ledger)` for the grid, `needsByType(ledger)`.

- [ ] **Step 1: Write the failing tests** for `format`, `routes` and `model` (on the core fixture world ledger built in the test): stats equal the hand-computed fixture values; an empty ledger gives zero stats and empty lists; `parseHash('#/account/cb-card')` gives `{ page: 'account', param: 'cb-card' }`; unknown hashes give `overview`; `rangeFor` gives the right first and last day for each preset; `shortDate('2026-11-06','en-US')` is `Nov 6, 2026` in any time zone (run with `TZ=America/Los_Angeles`); `compact(386000000,'LKR','en-US')` is `3.86M`.
- [ ] **Step 2: Run** `pnpm vitest run packages/web/test`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and the shell: `OxygenUIThemeProvider` with `OxygenTheme`, `AppShell` with `Header` (brand, Needs you count, `ColorSchemeToggle`) and `Sidebar` (one item per page), a status banner when `/api/status` reports problems, and a page switch on the hash.
- [ ] **Step 4: Run** the tests, `pnpm check`, `pnpm --filter @kanakku/web build`. Expected: PASS and a `dist/` folder.
- [ ] **Step 5: Commit** `Add web app shell with ledger loading`.

### Task 5: Pages

**Files:** Create `packages/web/src/pages/{Overview,NetWorth,CashFlow,Spending,Transfers,Conversions,Accounts,Account,Transactions,Statements,Needs}.tsx`.

- [ ] **Step 1: Build the pages** from the spec, section 13, read-only:
  - Overview: stat cards (net worth and change since last month, in accounts, in deposits, owed on cards, spent this month against last month), 12-month net worth area chart, top Needs you items, accounts by bank with coverage bars, "Where <month> went".
  - Net worth: area chart over time, month-end table, deposits list.
  - Cash flow: income and outgoing bars per month with the net, plus income and spending splits.
  - Spending: categories for the range, monthly stacked trend, a category list that opens its transactions.
  - Transfers: from/to table and transfer list with tabs named as in the spec: Needs you (possible and ambiguous rows), Waiting, All, Fixed deposits.
  - Conversions (only with foreign currency): list with rates, average rate, holdings at today's rate with source and date.
  - Accounts and Account: by bank with balance, coverage bar and last statement; the account page shows balance over time, its statements and transactions, card cycles for cards, and principal, start and maturity for deposits.
  - Transactions: `DataGrid.DataGrid` with search, the header range, and filters by account, kind and category; columns include the transfer link and the source files.
  - Statements: files with bank, account, period, rows, status and problems; tidy-up suggestions from `/api/tidy` (read-only for now).
  - Needs you: every item grouped by type with its message.
- [ ] **Step 2: Verify in a browser** with `pnpm build` and `kanakku start --data packages/core/test/fixtures/ledger --no-open`: every page renders with data, the numbers match the core fixture tests, and the dark theme works. Then run it on the author's own data folder locally.
- [ ] **Step 3: Run** `pnpm lint && pnpm check && pnpm test`. Expected: all pass.
- [ ] **Step 4: Commit** `Add read-only app pages`.
