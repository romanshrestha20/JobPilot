import type { JobHandlerContext, QueueSettings } from "@/lib/queue";
import type { Logger } from "@/lib/log";

/** The slice of the worker queue this loop needs; a fake stands in for it in tests. */
export interface WorkerQueuePort {
  start(): Promise<void>;
  ensureQueue(name: string, settings: QueueSettings): Promise<void>;
  work(
    name: string,
    options: { concurrency: number; pollingIntervalSeconds: number },
    handler: (payload: unknown, context: JobHandlerContext) => Promise<void>,
  ): Promise<void>;
  stop(timeoutMs: number): Promise<void>;
}

/** Thrown to make the queue deliver the job again. Its message is fixed and carries no data. */
export class RetryDelivery extends Error {
  constructor() {
    super("Analysis will be retried.");
    this.name = "RetryDelivery";
  }
}

export type AnalysisWorkerDeps = {
  queue: WorkerQueuePort;
  queueName: string;
  queueSettings: QueueSettings;
  processor: { process(payload: unknown): Promise<{ kind: string }> };
  recovery: { recover(): Promise<unknown> };
  logger: Logger;
  concurrency?: number;
  recoveryIntervalMs?: number;
  shutdownTimeoutMs?: number;
};

/**
 * The long-running part of the worker process: registers the queue handler and runs the
 * stale-run recovery on a timer. Everything it needs is passed in, so it never reads
 * configuration or opens a connection of its own.
 */
export function createAnalysisWorker(deps: AnalysisWorkerDeps) {
  const { queue, queueName, queueSettings, processor, recovery, logger } = deps;
  const recoveryIntervalMs = deps.recoveryIntervalMs ?? 60_000;
  const shutdownTimeoutMs = deps.shutdownTimeoutMs ?? 30_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let sweeping = false;

  async function sweep() {
    // One pass at a time: a slow pass must not stack up behind itself.
    if (sweeping) return;
    sweeping = true;
    try {
      await recovery.recover();
    } catch {
      logger.error({ event: "analysis.recovery_failed", code: "recovery_failed" });
    } finally {
      sweeping = false;
    }
  }

  return {
    async start() {
      await queue.start();
      await queue.ensureQueue(queueName, queueSettings);
      await queue.work(
        queueName,
        { concurrency: deps.concurrency ?? 1, pollingIntervalSeconds: 2 },
        async (payload) => {
          const outcome = await processor.process(payload);
          if (outcome.kind === "retry") throw new RetryDelivery();
        },
      );
      await sweep();
      timer = setInterval(() => void sweep(), recoveryIntervalMs);
      logger.info({ event: "worker.started" });
    },

    /** Stops the timer, then lets running handlers finish (up to the timeout) before closing. */
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await queue.stop(shutdownTimeoutMs);
      logger.info({ event: "worker.stopped" });
    },

    /** Exposed for tests. */
    sweep,
  };
}

export type AnalysisWorker = ReturnType<typeof createAnalysisWorker>;
