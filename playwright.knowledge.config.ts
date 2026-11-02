import { defineConfig } from '@playwright/test';
const port = 3167, fixturePort = 3168;
const baseURL = `http://127.0.0.1:${port}`;
const sourceURL = `http://127.0.0.1:${fixturePort}`;
export default defineConfig({
  testDir: './tests/knowledge-ui', timeout: 90_000, expect: { timeout: 20_000 }, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/knowledge-ui-results.json' }]],
  webServer: process.env.KNOWLEDGE_UI_BASE_URL ? undefined : [
    { command: 'node tests/ui/fixture-server.mjs', url: `${sourceURL}/auth/v1/user`, env: { UI_FIXTURE_PORT: String(fixturePort), UI_TEST_PORT: String(port) }, reuseExistingServer: false },
    { command: `npm run dev -- --port ${port}`, url: `${baseURL}/login`, reuseExistingServer: false, timeout: 120_000,
      env: { SALSYS_BUILD_DIR: '.next-knowledge-preview', NEXT_PUBLIC_USE_MOCK_DATA: 'false', NEXT_PUBLIC_SUPABASE_URL: sourceURL, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ui-fixture-not-a-production-key', SUPABASE_SERVICE_ROLE_KEY: 'ui-fixture-not-a-production-admin-key' } },
  ],
  use: { baseURL: process.env.KNOWLEDGE_UI_BASE_URL || baseURL, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
