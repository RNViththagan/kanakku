import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import {
  type BankPlugin,
  bankPlugins,
  type Config,
  type ConfigError,
  type Decision,
  type FileInput,
  loadConfig,
  loadDecisions,
  parseRatesCsv,
  type RateQuote,
} from '@kanakku/core';

export interface DataFolderContents {
  folder: string;
  configPath: string;
  config?: Config;
  configErrors: ConfigError[];
  decisions: Decision[];
  decisionErrors: ConfigError[];
  rates: RateQuote[];
  files: FileInput[];
}

function walk(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

export function loadDataFolder(
  folder: string,
  plugins: BankPlugin[] = bankPlugins,
): DataFolderContents {
  const configPath = join(folder, 'kanakku', 'config.yaml');
  const contents: DataFolderContents = {
    folder,
    configPath,
    configErrors: [],
    decisions: [],
    decisionErrors: [],
    rates: [],
    files: [],
  };
  if (!existsSync(configPath)) {
    contents.configErrors.push({ path: '', message: `No kanakku/config.yaml in ${folder}` });
    return contents;
  }
  const { config, errors } = loadConfig(readFileSync(configPath, 'utf8'), plugins);
  contents.configErrors = errors;
  if (!config) return contents;
  contents.config = config;

  const decisionsPath = join(folder, 'kanakku', 'decisions.yaml');
  if (existsSync(decisionsPath)) {
    const loaded = loadDecisions(readFileSync(decisionsPath, 'utf8'));
    contents.decisions = loaded.decisions;
    contents.decisionErrors = loaded.errors;
  }

  const ratesFolder = join(folder, 'kanakku', 'rates');
  for (const path of walk(ratesFolder).filter((file) => file.endsWith('.csv'))) {
    contents.rates.push(...parseRatesCsv(readFileSync(path, 'utf8'), basename(path, '.csv')));
  }

  const types = new Set(
    plugins.flatMap((plugin) => plugin.formats.flatMap((format) => format.fileTypes)),
  );
  for (const bankFolder of config.folders) {
    const root = isAbsolute(bankFolder.path) ? bankFolder.path : join(folder, bankFolder.path);
    for (const path of walk(root)) {
      if (![...types].some((type) => path.toLowerCase().endsWith(type.toLowerCase()))) continue;
      contents.files.push({
        path: relative(folder, path).split(sep).join('/'),
        name: basename(path),
        text: readFileSync(path, 'utf8'),
        folderBank: bankFolder.bank,
      });
    }
  }
  return contents;
}
