import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildLedger, parseYmd } from '@kanakku/core';
import { appFilePath, writeAppFile } from './app-file';
import { type DataFolder, expandHome, resolveDataFolder } from './data-folder';
import { type DataFolderContents, loadDataFolder } from './load';
import { renderReport } from './report';

export interface CliContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  platform: NodeJS.Platform;
  today: string;
  print(text: string): void;
  error(text: string): void;
}

const VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

function help(appFile: string): string {
  return `Kanakku: your bank statements, as one finance system.

Usage:
  kanakku report [--today YYYY-MM-DD]   Accounts, net worth, cash flow, transfers and what needs you
  kanakku use <folder>                  Use this data folder from now on
  kanakku where                         Show the data folder and whether its config is valid
  kanakku help                          Show this help

Options:
  --data <folder>   Use this data folder for one command
  --version         Show the version

The data folder holds kanakku/config.yaml and your bank folders. Kanakku finds it
from --data, then the KANAKKU_DATA variable, then ${appFile}.`;
}

const OPTIONS = {
  data: { type: 'string' },
  today: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

function parse(argv: string[]) {
  return parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
}

const SOURCES: Record<DataFolder['source'], string> = {
  option: 'from --data',
  env: 'from KANAKKU_DATA',
  'app-file': 'set with kanakku use',
};

function configProblems(contents: DataFolderContents): string[] {
  return contents.configErrors.map(
    (error) =>
      `  config.yaml${error.line ? ` line ${error.line}` : ''}: ${error.path ? `${error.path} ` : ''}${error.message}`,
  );
}

export function runCli(argv: string[], ctx: CliContext): number {
  const appFile = appFilePath(ctx.env, ctx.platform, ctx.home);
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (problem) {
    ctx.error(`${(problem as Error).message}\n\n${help(appFile)}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    ctx.print(VERSION);
    return 0;
  }
  const [command = 'help', ...rest] = positionals;
  if (values.help || command === 'help') {
    ctx.print(help(appFile));
    return 0;
  }

  if (command === 'use') {
    const target = rest[0];
    if (!target) {
      ctx.error('Usage: kanakku use <folder>');
      return 2;
    }
    const folder = resolve(ctx.cwd, expandHome(target, ctx.home));
    if (!existsSync(folder) || !statSync(folder).isDirectory()) {
      ctx.error(`There is no folder at ${folder}`);
      return 1;
    }
    writeAppFile(appFile, { dataFolder: folder });
    ctx.print(`Kanakku will use ${folder} from now on.`);
    if (!existsSync(resolve(folder, 'kanakku', 'config.yaml'))) {
      ctx.print(
        'It has no kanakku/config.yaml yet. Copy config.example.yaml from the Kanakku repo there and edit it.',
      );
    }
    return 0;
  }

  if (command !== 'where' && command !== 'report') {
    ctx.error(`Unknown command: ${command}\n\n${help(appFile)}`);
    return 2;
  }
  const today = values.today ?? ctx.today;
  if (!parseYmd(today)) {
    ctx.error(`--today must be a date like 2026-11-06, not ${today}`);
    return 2;
  }
  const dataFolder = resolveDataFolder({
    option: values.data,
    env: ctx.env,
    appFile,
    cwd: ctx.cwd,
    home: ctx.home,
  });
  if (!dataFolder) {
    ctx.error('Kanakku does not know your data folder yet. Run: kanakku use <folder>');
    return 1;
  }
  const contents = loadDataFolder(dataFolder.folder);

  if (command === 'where') {
    ctx.print(`Data folder: ${dataFolder.folder} (${SOURCES[dataFolder.source]})`);
    if (!contents.config) {
      ctx.print(['Config: problems', ...configProblems(contents)].join('\n'));
      return 1;
    }
    ctx.print(
      `Config: ok, ${contents.config.accounts.length} accounts, ${contents.files.length} statement files`,
    );
    return 0;
  }

  if (!contents.config) {
    ctx.error(
      [`Kanakku cannot read ${contents.configPath}:`, ...configProblems(contents)].join('\n'),
    );
    return 1;
  }
  const ledger = buildLedger({
    files: contents.files,
    config: contents.config,
    decisions: contents.decisions,
    rates: contents.rates,
    today,
  });
  ctx.print(
    renderReport(ledger, {
      config: contents.config,
      dataFolder: dataFolder.folder,
      files: contents.files,
    }),
  );
  return 0;
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function main(): number {
  return runCli(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
    today: localToday(),
    print: (text) => console.log(text),
    error: (text) => console.error(text),
  });
}
