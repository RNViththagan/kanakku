import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    env: {
      KANAKKU_WORLD: fileURLToPath(
        new URL('./packages/core/test/fixtures/ledger', import.meta.url),
      ),
    },
    server: { deps: { inline: ['@wso2/oxygen-ui', /@mui\/x-/] } },
  },
});
