import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  // Optional comma-separated extra origins (e.g. a preview domain). BETTER_AUTH_URL is always trusted.
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  OLLAMA_URL: z.url().default("http://localhost:11434"),
  LLM_PROVIDER: z.enum(["ollama", "demo"]).default("ollama"),
  LLM_MODEL: z.string().min(1),
  EMBED_MODEL: z.string().default("bge-m3"),
});

export const env = schema.parse(process.env);
