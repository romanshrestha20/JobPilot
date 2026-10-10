import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  OLLAMA_URL: z.string().url().default("http://localhost:11434"),
  LLM_PROVIDER: z.enum(["ollama"]).default("ollama"),
  LLM_MODEL: z.string().min(1),
  EMBED_MODEL: z.string().default("bge-m3"),
  AUTH_SECRET: z.string().min(32),
});

export const env = schema.parse(process.env);