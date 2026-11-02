import { defineConfig } from "@playwright/test";
const port = Number(process.env.HOME_TEST_PORT ?? 3147);
const fixturePort = Number(process.env.HOME_FIXTURE_PORT ?? 3148);
export default defineConfig({
  testDir: "./tests/home",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/home-results.json" }],
  ],
  use: {
    baseURL: process.env.HOME_TEST_BASE_URL || `http://127.0.0.1:${port}`,
    viewport: { width: 1672, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.HOME_TEST_BASE_URL
    ? undefined
    : [
        {
          command: "node tests/ui/fixture-server.mjs",
          url: `http://127.0.0.1:${fixturePort}/auth/v1/user`,
          env: {
            UI_FIXTURE_PORT: String(fixturePort),
            UI_TEST_PORT: String(port),
          },
        },
        {
          command: `npm run dev -- --port ${port}`,
          url: `http://127.0.0.1:${port}/login`,
          timeout: 120_000,
          env: {
            SALSYS_BUILD_DIR: ".next-home-test",
            NEXT_PUBLIC_USE_MOCK_DATA: "true",
            NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "ui-fixture-not-a-production-key",
            SUPABASE_SERVICE_ROLE_KEY: "ui-fixture-not-a-production-admin-key",
          },
        },
      ],
});
