import { z } from "zod";

// An unset and a blank variable mean the same thing for optional settings.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * Environment contract. Kept apart from `env.ts` (which is `server-only` and parses at import)
 * so the rules can be unit-tested with plain objects and reused by scripts.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    // Optional comma-separated extra origins (e.g. a preview domain). BETTER_AUTH_URL is always trusted.
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    OLLAMA_URL: z.url().default("http://localhost:11434"),
    LLM_PROVIDER: z.enum(["ollama", "demo"]).default("ollama"),
    // Required for `ollama` (checked below); the `demo` provider runs no model.
    LLM_MODEL: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    // Upper bound for one model call, in milliseconds.
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
    EMBED_MODEL: z.string().default("bge-m3"),
  })
  .superRefine((value, ctx) => {
    if (value.LLM_PROVIDER === "ollama" && !value.LLM_MODEL) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_MODEL"],
        message: "LLM_MODEL is required when LLM_PROVIDER=ollama.",
      });
    }
    // Demo output is not model output. There is deliberately no override for production.
    if (value.LLM_PROVIDER === "demo" && value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_PROVIDER"],
        message: "LLM_PROVIDER=demo is not allowed when NODE_ENV=production.",
      });
    }
  });

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}
