import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * @param {NodeJS.Platform} platform
 * @param {string} entry
 */
export function launcherFor(platform, entry) {
  if (platform === 'win32') return `@echo off\r\nnode "${entry}" %*\r\n`;
  return `#!/bin/sh\nexec node "${entry}" "$@"\n`;
}

function main() {
  const args = process.argv.slice(2);
  const binAt = args.indexOf('--bin');
  const given = binAt >= 0 ? args[binAt + 1] : undefined;
  const binDir = resolve(given ?? join(homedir(), '.local', 'bin'));
  const entry = fileURLToPath(new URL('../packages/server/bin/kanakku.mjs', import.meta.url));
  const target = join(binDir, process.platform === 'win32' ? 'kanakku.cmd' : 'kanakku');
  if (
    existsSync(target) &&
    !readFileSync(target, 'utf8').includes('kanakku.mjs') &&
    !args.includes('--force')
  ) {
    console.error(
      `${target} exists and is not a Kanakku launcher. Run again with --force to replace it.`,
    );
    process.exit(1);
  }
  mkdirSync(binDir, { recursive: true });
  writeFileSync(target, launcherFor(process.platform, entry));
  if (process.platform !== 'win32') chmodSync(target, 0o755);
  console.log(`Installed ${target}`);
  const onPath = (process.env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir && resolve(dir) === binDir);
  if (!onPath) console.log(`Add ${binDir} to your PATH to run kanakku from anywhere.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
