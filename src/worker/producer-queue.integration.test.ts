import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ANALYSIS_QUEUE_NAME,
  createAnalysisQueue,
} from "@/features/job-analysis/application/analysis-queue";
import { createAnalysisService } from "@/features/job-analysis/application/analysis-service";
import {
  ANALYSIS_RETRY_DELAY_MAX_SECONDS,
  ANALYSIS_RETRY_DELAY_SECONDS,
  ANALYSIS_RETRY_LIMIT,
  analysisExpireInSeconds,
} from "@/features/job-analysis/domain/processing-policy";
import { createAnalysisRepository } from "@/features/job-analysis/repository";
import { jobAnalysis } from "@/features/job-analysis/schema";
import { createJobTextReader } from "@/features/job-intake/reader";
import { jobPosting } from "@/features/job-intake/schema";
import { user } from "@/lib/schema";
import { assertSafeTestDatabaseUrl } from "@/test/database-guard";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { createProducerQueue, createWorkerQueue } from "@/lib/queue";

// The web process's producer adapter against a real pg-boss, in the guarded `*_test` database and
// throwaway pg-boss schemas that are dropped afterwards. Nothing here touches the default
// `pgboss` schema or any non-test database.

let db: TestDatabase;
let close: () => Promise<void>;
let url: string;
let admin: ReturnType<typeof postgres>;
const schemas: string[] = [];
const createdUsers: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
const silent = { info() {}, warn() {}, error() {} };

const newSchema = () => {
  const name = `pgboss_p_${randomBytes(6).toString("hex")}`;
  schemas.push(name);
  return name;
};

const PRODUCTION_SETTINGS = {
  policy: "short" as const,
  retryLimit: ANALYSIS_RETRY_LIMIT,
  retryDelaySeconds: ANALYSIS_RETRY_DELAY_SECONDS,
  retryDelayMaxSeconds: ANALYSIS_RETRY_DELAY_MAX_SECONDS,
  expireInSeconds: analysisExpireInSeconds(60_000),
};

/** What the worker does at startup: installs the queue schema and creates the queue. */
async function installQueue(schema: string, settings = PRODUCTION_SETTINGS) {
  const worker = createWorkerQueue({
    connectionString: url,
    maxConnections: 2,
    schema,
    onError: () => {},
  });
  await worker.start();
  await worker.ensureQueue(ANALYSIS_QUEUE_NAME, settings);
  cleanups.push(() => worker.stop(5_000));
}

function producer(schema: string, connectionString = url) {
  const errors: unknown[] = [];
  const queue = createProducerQueue({
    connectionString,
    maxConnections: 2,
    schema,
    onError: (error) => errors.push(error),
  });
  cleanups.push(() => queue.stop().catch(() => {}));
  return { queue, errors };
}

async function newRun() {
  const owner = await createTestUser(db, "producer");
  createdUsers.push(owner.id);
  const [job] = await db
    .insert(jobPosting)
    .values({ userId: owner.id, title: "Engineer", company: "Acme", description: "We need Go." })
    .returning({ id: jobPosting.id });
  return { userId: owner.id, jobId: job.id };
}

const jobsIn = (schema: string) =>
  admin.unsafe(
    `select name, state, singleton_key, data, retry_limit, retry_delay, retry_backoff, retry_delay_max, expire_seconds from ${schema}.job where name = $1`,
    [ANALYSIS_QUEUE_NAME],
  );

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL]);
  admin = postgres(url, { max: 1, onnotice: () => {} });
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => {});
});

afterAll(async () => {
  for (const schema of schemas) await admin.unsafe(`drop schema if exists ${schema} cascade`);
  await admin.end();
  if (createdUsers.length > 0) await db.delete(user).where(inArray(user.id, createdUsers));
  await close();
});

describe("producer adapter with a real pg-boss", () => {
  it("creates the queue under the agreed name with the approved retry configuration", async () => {
    const schema = newSchema();
    await installQueue(schema);
    const [queue] = await admin.unsafe(`select * from ${schema}.queue where name = $1`, [
      ANALYSIS_QUEUE_NAME,
    ]);
    expect(queue).toMatchObject({
      name: "job-analysis.extract",
      policy: "short",
      retry_limit: 2,
      retry_delay: 30,
      retry_backoff: true,
      retry_delay_max: 300,
      expire_seconds: 90,
    });
    expect(ANALYSIS_QUEUE_NAME).toBe("job-analysis.extract");
  });

  it("re-running queue setup applies changed settings to the existing queue", async () => {
    const schema = newSchema();
    await installQueue(schema, { ...PRODUCTION_SETTINGS, retryDelayMaxSeconds: 120 });
    await installQueue(schema);
    const [queue] = await admin.unsafe(
      `select retry_delay_max from ${schema}.queue where name = $1`,
      [ANALYSIS_QUEUE_NAME],
    );
    expect(queue.retry_delay_max).toBe(300);
  });

  it("sends ids only, under the analysis id as singleton key, inheriting the queue settings", async () => {
    const schema = newSchema();
    await installQueue(schema);
    const { queue, errors } = producer(schema);
    const owner = await createTestUser(db, "payload");
    createdUsers.push(owner.id);
    const analysisId = crypto.randomUUID();

    await createAnalysisQueue(queue).enqueue({ analysisId, userId: owner.id });

    const rows = await jobsIn(schema);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: "created",
      singleton_key: analysisId,
      data: { analysisId, userId: owner.id },
      retry_limit: 2,
      retry_delay: 30,
      retry_backoff: true,
      retry_delay_max: 300,
      expire_seconds: 90,
    });
    expect(Object.keys(rows[0].data as object).sort()).toEqual(["analysisId", "userId"]);
    expect(errors).toEqual([]);
  });

  it("collapses duplicate sends of the same run to one waiting job, and keeps other runs apart", async () => {
    const schema = newSchema();
    await installQueue(schema);
    const { queue } = producer(schema);
    const adapter = createAnalysisQueue(queue);
    const owner = await createTestUser(db, "dupes");
    createdUsers.push(owner.id);
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();

    await Promise.all(
      [1, 2, 3, 4].map(() => adapter.enqueue({ analysisId: first, userId: owner.id })),
    );
    await adapter.enqueue({ analysisId: first, userId: owner.id });
    await adapter.enqueue({ analysisId: second, userId: owner.id });

    const rows = await jobsIn(schema);
    expect(rows.map((r) => r.singleton_key).sort()).toEqual([first, second].sort());
  });

  it("refuses a malformed payload before anything is sent", async () => {
    const schema = newSchema();
    await installQueue(schema);
    const { queue } = producer(schema);
    const adapter = createAnalysisQueue(queue);
    await expect(adapter.enqueue({ analysisId: "not-a-uuid", userId: "u" })).rejects.toThrow();
    await expect(
      adapter.enqueue({
        analysisId: crypto.randomUUID(),
        userId: "u",
        jobText: "secret",
      } as never),
    ).rejects.toThrow();
    expect(await jobsIn(schema)).toHaveLength(0);
  });

  it("does not install or migrate anything: a producer never creates the queue schema", async () => {
    const schema = newSchema();
    const { queue } = producer(schema);
    await expect(
      queue.send(ANALYSIS_QUEUE_NAME, { a: 1 }, { singletonKey: "k" }),
    ).rejects.toThrow();
    const [{ exists }] = await admin.unsafe(
      `select exists(select 1 from information_schema.schemata where schema_name = $1) as exists`,
      [schema],
    );
    expect(exists).toBe(false);
  });

  it("rejects when the schema exists but the queue was never created", async () => {
    const schema = newSchema();
    const worker = createWorkerQueue({
      connectionString: url,
      maxConnections: 2,
      schema,
      onError: () => {},
    });
    await worker.start(); // installs pg-boss but creates no queue
    cleanups.push(() => worker.stop(5_000));
    const { queue } = producer(schema);
    await expect(
      queue.send(ANALYSIS_QUEUE_NAME, { a: 1 }, { singletonKey: "k" }),
    ).rejects.toThrow();
  });

  it("rejects when the database is unreachable, then works once it is back (no stuck state)", async () => {
    const schema = newSchema();
    await installQueue(schema);
    const dead = new URL(url);
    dead.port = "1"; // nothing listens here
    const { queue: deadQueue } = producer(schema, dead.toString());
    await expect(
      deadQueue.send(ANALYSIS_QUEUE_NAME, { a: 1 }, { singletonKey: "k" }),
    ).rejects.toThrow();
    // A failed start is not cached: the next send tries again (and fails again, not hangs).
    await expect(
      deadQueue.send(ANALYSIS_QUEUE_NAME, { a: 1 }, { singletonKey: "k" }),
    ).rejects.toThrow();
  }, 30_000);

  it("a failed enqueue marks the run enqueue_failed at once and offers Retry; a retry then queues", async () => {
    const owner = await newRun();
    const repository = createAnalysisRepository(db);
    const missingSchema = newSchema(); // never installed
    const broken = producer(missingSchema).queue;
    const service = (queue: ReturnType<typeof createProducerQueue>) =>
      createAnalysisService({
        repository,
        jobs: createJobTextReader(db),
        queue: createAnalysisQueue(queue),
        logger: silent,
      });

    const failed = await service(broken).requestAnalysis({ id: owner.userId }, owner.jobId);
    expect(failed).toEqual({ ok: false, reason: "enqueue_failed" });
    const rows = await db.select().from(jobAnalysis);
    const mine = rows.filter((r) => r.userId === owner.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: "failed", failureCode: "enqueue_failed" });

    // The queue comes up; the user retries, which creates a new run (the failed one is kept).
    const schema = newSchema();
    await installQueue(schema);
    const healthy = producer(schema).queue;
    const retried = await service(healthy).requestAnalysis({ id: owner.userId }, owner.jobId);
    expect(retried).toMatchObject({ ok: true, created: true });
    expect(await jobsIn(schema)).toHaveLength(1);
  }, 30_000);

  it("a second request while a run is active neither creates a run nor sends a second job", async () => {
    const owner = await newRun();
    const schema = newSchema();
    await installQueue(schema);
    const { queue } = producer(schema);
    const service = createAnalysisService({
      repository: createAnalysisRepository(db),
      jobs: createJobTextReader(db),
      queue: createAnalysisQueue(queue),
      logger: silent,
    });
    const results = await Promise.all(
      [1, 2, 3].map(() => service.requestAnalysis({ id: owner.userId }, owner.jobId)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.created)).toHaveLength(1);
    expect(await jobsIn(schema)).toHaveLength(1);
  });
});
