import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      // Lets the guard refuse a TEST_DATABASE_URL that equals the app database.
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
    // Files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
