import { defineConfig, devices } from "@playwright/test";
import { assertSafeTestDatabaseUrl } from "./src/test/database-guard";

try {
  process.loadEnvFile();
} catch {}

// The app under test is started on its own port, against the dedicated test database only.
// The guard refuses anything that is not a local `*_test` database different from DATABASE_URL.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const testDatabaseUrl = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [
  process.env.DATABASE_URL,
]);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Every test uses its own user and client address; parallel runs do not share state.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build in a separate directory (see next.config.ts) so it never clobbers `next dev`.
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    // Never reuse a server already on this port: it could be pointed at a different database.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET || "e2e-only-secret-not-used-outside-tests-0123456789",
      LLM_PROVIDER: "demo",
      LLM_MODEL: "e2e-placeholder",
    },
  },
});
