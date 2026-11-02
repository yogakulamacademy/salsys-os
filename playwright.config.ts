import { defineConfig } from '@playwright/test';
const port = Number(process.env.UI_TEST_PORT ?? 3107);
const fixturePort = Number(process.env.UI_FIXTURE_PORT ?? 3108);
if (![port, fixturePort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535) || port === fixturePort) throw new Error('Choose two distinct local test ports.');
const baseURL = `http://127.0.0.1:${port}`;
const sourceURL = `http://127.0.0.1:${fixturePort}`;

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/ui-results.json' }]],
  webServer: process.env.UI_TEST_BASE_URL ? undefined : [
    { command: 'node tests/ui/fixture-server.mjs', url: `${sourceURL}/auth/v1/user`, env: { UI_FIXTURE_PORT: String(fixturePort), UI_TEST_PORT: String(port) }, reuseExistingServer: false },
    { command: `npm run dev -- --port ${port}`, url: `${baseURL}/login`, reuseExistingServer: false,
      env: { SALSYS_BUILD_DIR: process.env.UI_TEST_BUILD_DIR || '.next-ui-preview', NEXT_PUBLIC_USE_MOCK_DATA: 'true', NEXT_PUBLIC_SUPABASE_URL: sourceURL, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ui-fixture-not-a-production-key', SUPABASE_SERVICE_ROLE_KEY: 'ui-fixture-not-a-production-admin-key' }, timeout: 120_000 },
  ],
  use: { baseURL: process.env.UI_TEST_BASE_URL || baseURL, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
