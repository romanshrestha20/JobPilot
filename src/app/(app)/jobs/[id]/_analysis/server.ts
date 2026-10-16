import "server-only";
import {
  createAnalysisQueue,
  createAnalysisRepository,
  createAnalysisService,
} from "@/features/job-analysis";
import { createJobTextReader } from "@/features/job-intake/reader";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { createProducerQueue } from "@/lib/queue";

/**
 * Composition root for the web side of job analysis: binds the database, the owner-scoped job
 * reader and the queue producer to the request service. The producer only sends; the worker
 * process owns the queue schema. Cached on `globalThis` so dev hot reloads do not open a new
 * connection pool each time.
 */
const cache = globalThis as typeof globalThis & {
  __jobpilotAnalysisService?: ReturnType<typeof createAnalysisService>;
};

export function getAnalysisService() {
  cache.__jobpilotAnalysisService ??= createAnalysisService({
    repository: createAnalysisRepository(db),
    jobs: createJobTextReader(db),
    queue: createAnalysisQueue(
      createProducerQueue({
        connectionString: env.DATABASE_URL,
        maxConnections: 2,
        // Never log the error itself: it can carry a connection string.
        onError: () => log.error({ event: "queue.error", code: "queue_error" }),
      }),
    ),
  });
  return cache.__jobpilotAnalysisService;
}
