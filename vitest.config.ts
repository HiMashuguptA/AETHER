import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['tests/global-setup.ts'],
    env: {
      AETHER_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/aether_test',
      AUTH_SECRET: 'test-secret-test-secret-test-secret-0123456789',
      APP_URL: 'http://localhost:8787',
      STORAGE_PROVIDER: 'local',
      LOCAL_STORAGE_DIR: '/tmp/aether-test-uploads',
      MUSE_PROVIDER: 'fallback',
    },
  },
});
