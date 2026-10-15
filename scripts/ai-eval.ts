/**
 * Evaluates requirements extraction on the fixed fixtures.
 *
 *   pnpm ai:eval                 demo provider (default; deterministic, no model, no network)
 *   pnpm ai:eval --provider ollama   the model named by LLM_MODEL / OLLAMA_URL (manual only)
 *
 * Demo numbers prove the pipeline and the fixtures, not model quality; the output says so.
 * Exits 1 when any fixture fails. Prints fixture ids and codes only, never the job text or
 * model output.
 */
import { evaluateFixtures } from "@/features/job-analysis/evaluation";
import { EVAL_FIXTURES } from "@/features/job-analysis/fixtures";
import {
  demoExtractRequirements,
  DEMO_LABEL,
} from "@/features/job-analysis/domain/demo-extraction";
import { createProviderFromConfig } from "@/lib/ai/factory";
import { createAiGateway } from "@/lib/ai/gateway";
import { createLogger } from "@/lib/log";
import { parseEnv } from "@/lib/env-schema";

try {
  process.loadEnvFile();
} catch {}

async function main() {
  const flag = process.argv.indexOf("--provider");
  const choice = flag >= 0 ? process.argv[flag + 1] : "demo";
  if (choice !== "demo" && choice !== "ollama") {
    throw new Error("Use --provider demo or --provider ollama.");
  }

  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 60_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw new Error("LLM_TIMEOUT_MS must be an integer from 1000 to 300000.");
  }
  // Only the AI settings are needed here; the rest of the app environment is not required.
  const provider =
    choice === "ollama"
      ? (() => {
          const env = parseEnv({
            ...process.env,
            DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://unused/unused",
            BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
            BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
            LLM_PROVIDER: "ollama",
          });
          return createProviderFromConfig(
            {
              provider: "ollama",
              model: env.LLM_MODEL,
              ollamaUrl: env.OLLAMA_URL,
              nodeEnv: env.NODE_ENV,
            },
            {},
          );
        })()
      : createProviderFromConfig(
          { provider: "demo", ollamaUrl: "", nodeEnv: process.env.NODE_ENV ?? "development" },
          { extract_job_requirements: demoExtractRequirements },
        );

  const gateway = createAiGateway({ provider, timeoutMs, logger: createLogger(() => {}) });
  console.log(
    choice === "demo"
      ? `${DEMO_LABEL.toUpperCase()}: keyword rules, not an AI model. These numbers are NOT model accuracy.`
      : `REAL MODEL (${provider.model}): a small fixed sample, not a benchmark.`,
  );

  const results = await evaluateFixtures(gateway, EVAL_FIXTURES);
  for (const result of results) {
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${result.id} recall=${result.recall.toFixed(2)} precision=${result.precision.toFixed(2)} dropped=${result.droppedUngrounded}`,
    );
    for (const problem of result.problems) console.log(`  - ${problem}`);
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(`${results.length - failed}/${results.length} fixtures passed (${choice}).`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  // Configuration problems only; never print provider output.
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
});
