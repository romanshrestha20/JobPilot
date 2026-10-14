import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Database-backed tests run via `pnpm test:integration`.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
