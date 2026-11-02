import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/ui-results.json' }]],
  webServer: process.env.UI_TEST_BASE_URL ? undefined : [
    { command: 'node tests/ui/fixture-server.mjs', url: 'http://127.0.0.1:3108/auth/v1/user', reuseExistingServer: false },
    { command: 'npm run dev -- --port 3107', url: 'http://127.0.0.1:3107/login', reuseExistingServer: false,
      env: { SALSYS_BUILD_DIR: '.next-ui-preview', NEXT_PUBLIC_USE_MOCK_DATA: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3108', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ui-fixture-not-a-production-key', SUPABASE_SERVICE_ROLE_KEY: 'ui-fixture-not-a-production-admin-key' }, timeout: 120_000 },
  ],
  use: { baseURL: process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:3107', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
