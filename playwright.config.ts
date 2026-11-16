import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run the real app: the built frontend served by the API, against a local
 * Postgres database that is rebuilt from the migrations before every run.
 * Muse uses the labelled development fallback here so the suite needs no AI credentials.
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/aether_e2e';
const PORT = 8790;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx tsx tests/e2e/reset-db.ts && npm run build && npx tsx server/dev.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      DATABASE_URL,
      AETHER_ENV: 'development',
      APP_URL: `http://localhost:${PORT}`,
      AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123456789',
      DEV_OUTBOX: 'true',
      STORAGE_PROVIDER: 'local',
      LOCAL_STORAGE_DIR: '/tmp/aether-e2e-uploads',
      MUSE_PROVIDER: 'fallback',
    },
  },
});
