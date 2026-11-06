import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    server: { deps: { inline: ['@wso2/oxygen-ui', /@mui\/x-/] } },
  },
});
