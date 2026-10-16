/**
 * Worker process entry: `pnpm worker`. Runs the job-analysis queue handler and stale-run
 * recovery. It is a separate process from the web server and must never be started against a
 * database you do not want pg-boss to install its own `pgboss` schema into.
 *
 * Feature code imports `server-only`, so the process runs with the `react-server` condition
 * (see the `worker` script) and reads `.env` itself because Next.js is not loading it.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  ANALYSIS_QUEUE_NAME,
  ANALYSIS_RETRY_DELAY_MAX_SECONDS,
  ANALYSIS_RETRY_DELAY_SECONDS,
  ANALYSIS_RETRY_LIMIT,
  analysisExpireInSeconds,
  createAnalysisProcessor,
  createAnalysisQueue,
  createAnalysisRepository,
  createStaleRecovery,
  extractJobRequirements,
} from "@/features/job-analysis";
import { createJobTextReader } from "@/features/job-intake/reader";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { createWorkerQueue } from "@/lib/queue";
import { createAnalysisWorker } from "./analysis-worker";

async function main() {
  // Own pools, sized for the worker, separate from the web application's.
  const client = postgres(env.DATABASE_URL, { max: 4 });
  const db = drizzle(client);

  const repository = createAnalysisRepository(db);
  const queue = createWorkerQueue({
    connectionString: env.DATABASE_URL,
    maxConnections: 4,
    onError: () => log.error({ event: "queue.error", code: "queue_error" }),
  });

  const processor = createAnalysisProcessor({
    repository,
    jobs: createJobTextReader(db),
    extract: extractJobRequirements,
    llmTimeoutMs: env.LLM_TIMEOUT_MS,
  });
  const recovery = createStaleRecovery({
    repository,
    // Recovery only needs to send; the worker's own queue client does that.
    queue: createAnalysisQueue({
      send: (name, payload, options) => queue.send(name, payload, options),
    }),
    llmTimeoutMs: env.LLM_TIMEOUT_MS,
  });

  const worker = createAnalysisWorker({
    queue,
    queueName: ANALYSIS_QUEUE_NAME,
    queueSettings: {
      policy: "short",
      retryLimit: ANALYSIS_RETRY_LIMIT,
      retryDelaySeconds: ANALYSIS_RETRY_DELAY_SECONDS,
      retryDelayMaxSeconds: ANALYSIS_RETRY_DELAY_MAX_SECONDS,
      expireInSeconds: analysisExpireInSeconds(env.LLM_TIMEOUT_MS),
    },
    processor,
    recovery,
    logger: log,
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await worker.stop();
      await client.end({ timeout: 5 });
      process.exit(0);
    } catch {
      log.error({ event: "worker.shutdown_failed", code: "shutdown_failed" });
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  await worker.start();
}

main().catch(() => {
  // No error text: it could carry a connection string.
  log.error({ event: "worker.start_failed", code: "start_failed" });
  process.exit(1);
});
