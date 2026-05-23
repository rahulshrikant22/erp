import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // NODE_ENV=test silences the request logger in createApp().
    // AUTH_BCRYPT_COST=4 keeps password ops fast — production stays at 12 via .env.
    // PASSWORD_BREACH_CHECK_ENABLED=false avoids hitting HIBP in CI / offline tests.
    env: {
      NODE_ENV: 'test',
      AUTH_BCRYPT_COST: '4',
      PASSWORD_BREACH_CHECK_ENABLED: 'false',
    },
    // Lockout flow does several bcrypt + DB writes; default 5s is too tight.
    testTimeout: 30_000,
    silent: false,
    reporters: 'default',
    // Tests share the live `erp_dev` Postgres. File-level parallelism would
    // race two workers mutating the same row (e.g. core.modules.is_active).
    // Tests within a file still run sequentially by default in vitest.
    fileParallelism: false,
  },
});
