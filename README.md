# Kanakku

Your bank statements, as one finance system.

Kanakku (கணக்கு, "accounts" in Tamil) is a personal finance app that runs on your own computer. You download statements from your banks and drop them into folders. Kanakku reads them and shows all your accounts together: what you have, where your money went, and how it moved between your own accounts.

> **Status:** early development. The engine, a text report and a read-only web app work. Answering questions, rules and tidy-up from the app come next.

## What it does

- Reads statement files from folders you choose, one folder per bank.
- Treats your accounts, cards, fixed deposits and currencies as one system. Any bank can hold any of them.
- Finds transfers between your own accounts, including bank fees and currency conversions, so they don't count as income or spending.
- Removes duplicates when statements overlap, and tells you when a period is missing.
- Shows net worth, cash flow, spending, transfers, accounts, transactions and statement coverage.
- Tracks credit card billing cycles and due dates, and fixed deposits.
- Values foreign currency at your bank's current rate, and keeps the actual rate of every conversion you made.
- Suggests proper names and places for statement files, and imports new ones for you.

## Privacy

- Your statements and numbers never leave your computer.
- The only thing Kanakku fetches online is public exchange rates. You can turn that off.
- It never asks for bank logins. It only reads files you download yourself.
- It never moves, renames or deletes a statement without your OK, and every move can be undone.
- Everything it learns from you is kept as plain files in your finance folder.

## How it is built

- **One model for every bank.** A bank holds accounts. Each account has a type (savings, current, credit card or fixed deposit) and a currency (LKR, USD or any other). Any bank can hold any mix of them.
- **Banks are plug-ins.** A bank plug-in teaches Kanakku two things: how to read that bank's statement files, and what the bank's wording means (fees, interest, fixed deposits, transfers). Everything else is shared by all banks.
- **Included plug-ins:** Bank of Ceylon (BOC), Commercial Bank (ComBank) and Hatton National Bank (HNB). Adding a bank means adding one plug-in.

## Run it

Needs Node 22 and pnpm 10.

```
pnpm install
pnpm build                # builds the web app
pnpm cli:install          # puts a kanakku command in ~/.local/bin (--bin <dir> for another folder)
kanakku use ~/Finance     # your data folder, with kanakku/config.yaml and your bank folders
kanakku                   # starts the app and opens it in your browser
kanakku report            # the same numbers as text
```

The app runs only on your computer, at `http://127.0.0.1:5170`. It updates by itself when statement files change.

Start your config from `config.example.yaml`. `kanakku help` lists every command.

## Develop

```
pnpm test
pnpm check && pnpm lint
pnpm dev                  # the app with live reload, on the data folder you chose with kanakku use
```

The engine lives in `packages/core`, the `kanakku` command and local server in `packages/server`, and the web app in `packages/web`. The design is in `docs/specs/`, and `docs/adding-a-bank.md` explains how to add a bank.

## License

[MIT](LICENSE)
