import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/lib/schema.ts", "./src/features/*/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});