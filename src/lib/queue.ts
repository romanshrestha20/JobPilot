import { PgBoss } from "pg-boss";

/**
 * Thin wrapper over pg-boss, the only file that imports it (docs/decisions/0001-pg-boss.md).
 * pg-boss keeps its own `pgboss` schema in the database and manages it itself; Drizzle never
 * touches it and nothing else queries it. The API used here was checked against pg-boss 12.38.
 *
 * Jobs are delivered at least once, so handlers must be idempotent. A handler that throws makes
 * pg-boss retry the job with the queue's retry settings; a handler that returns finishes it.
 */

export type QueueSettings = {
  /** `short`: one waiting job per singleton key, so a repeated send is a no-op. */
  policy: "short";
  retryLimit: number;
  retryDelaySeconds: number;
  retryDelayMaxSeconds: number;
  /** How long one attempt may run before the queue treats it as lost and retries it. */
  expireInSeconds: number;
};

export type QueueClientConfig = {
  connectionString: string;
  /** Separate pool for the queue; keep it small. */
  maxConnections: number;
  /** Test-only override; production uses pg-boss's default `pgboss` schema. */
  schema?: string;
  /** Called with an error that would otherwise be an unhandled `error` event. Never log its message. */
  onError: (error: unknown) => void;
};

export type JobHandlerContext = { retryCount: number; signal: AbortSignal };

/** The queue a worker process runs: creates and migrates the queue schema, and runs handlers. */
export function createWorkerQueue(config: QueueClientConfig) {
  const boss = new PgBoss({
    connectionString: config.connectionString,
    max: config.maxConnections,
    ...(config.schema ? { schema: config.schema } : {}),
    application_name: "jobpilot-worker",
  });
  boss.on("error", config.onError);

  return {
    /** Connects and installs or upgrades pg-boss's own schema. */
    async start() {
      await boss.start();
    },

    /** Creates the queue if needed and applies the settings (idempotent). */
    async ensureQueue(name: string, settings: QueueSettings) {
      await boss.createQueue(name, {
        policy: settings.policy,
        retryLimit: settings.retryLimit,
        retryDelay: settings.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: settings.retryDelayMaxSeconds,
        expireInSeconds: settings.expireInSeconds,
      });
      await boss.updateQueue(name, {
        retryLimit: settings.retryLimit,
        retryDelay: settings.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: settings.retryDelayMaxSeconds,
        expireInSeconds: settings.expireInSeconds,
      });
    },

    async send(name: string, payload: object, options: { singletonKey: string }) {
      // Null means the singleton key already has a waiting job; that is success, not an error.
      await boss.send(name, payload, { singletonKey: options.singletonKey });
    },

    /**
     * Runs `handler` for each job, one at a time per `concurrency` slot. Throwing from the
     * handler asks the queue to retry; the payload is untrusted and must be validated by it.
     */
    async work(
      name: string,
      options: { concurrency: number; pollingIntervalSeconds: number },
      handler: (payload: unknown, context: JobHandlerContext) => Promise<void>,
    ) {
      await boss.work(
        name,
        {
          batchSize: 1,
          localConcurrency: options.concurrency,
          pollingIntervalSeconds: options.pollingIntervalSeconds,
        },
        async (jobs) => {
          for (const job of jobs) {
            await handler(job.data, { retryCount: job.retryCount, signal: job.signal });
          }
        },
      );
    },

    /** Graceful: stops fetching and waits up to `timeoutMs` for running handlers. */
    async stop(timeoutMs: number) {
      await boss.stop({ graceful: true, timeout: timeoutMs });
    },
  };
}

export type WorkerQueue = ReturnType<typeof createWorkerQueue>;

/**
 * The queue a web process uses to send jobs. It installs nothing and runs no maintenance: the
 * worker owns the schema and the queue. If the worker has never run, `send` fails and the
 * caller marks the run `enqueue_failed`.
 */
export function createProducerQueue(config: QueueClientConfig) {
  const boss = new PgBoss({
    connectionString: config.connectionString,
    max: config.maxConnections,
    ...(config.schema ? { schema: config.schema } : {}),
    application_name: "jobpilot-web",
    supervise: false,
    schedule: false,
    migrate: false,
    createSchema: false,
  });
  boss.on("error", config.onError);
  let started: Promise<unknown> | undefined;

  return {
    async send(name: string, payload: object, options: { singletonKey: string }) {
      started ??= boss.start().catch((error: unknown) => {
        started = undefined;
        throw error;
      });
      await started;
      await boss.send(name, payload, { singletonKey: options.singletonKey });
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 5_000 });
    },
  };
}
