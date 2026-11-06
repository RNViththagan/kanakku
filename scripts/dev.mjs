import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';

/** @param {number} from @returns {Promise<number>} */
function freePort(from) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (/** @type {NodeJS.ErrnoException} */ error) => {
      if (error.code === 'EADDRINUSE') resolve(freePort(from + 1));
      else reject(error);
    });
    probe.listen(from, '127.0.0.1', () => probe.close(() => resolve(from)));
  });
}

const shell = process.platform === 'win32';
if (!existsSync('packages/web/dist/index.html')) {
  spawnSync('pnpm', ['--filter', '@kanakku/web', 'build'], { stdio: 'inherit', shell });
}
const port = await freePort(5180);
const env = {
  ...process.env,
  KANAKKU_TOKEN: randomBytes(32).toString('hex'),
  KANAKKU_API: `http://127.0.0.1:${port}`,
};
const server = ['packages/server/bin/kanakku.mjs', 'start', '--no-open', '--port', String(port)];
const children = [
  spawn(process.execPath, [...server, ...process.argv.slice(2)], { env, stdio: 'inherit' }),
  spawn('pnpm', ['--filter', '@kanakku/web', 'dev'], { env, stdio: 'inherit', shell }),
];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', stop);
