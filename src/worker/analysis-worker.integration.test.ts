import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ANALYSIS_QUEUE_NAME,
  createAnalysisQueue,
} from "@/features/job-analysis/application/analysis-queue";
import type { ExtractionResult } from "@/features/job-analysis/application/extract";
import { createAnalysisProcessor } from "@/features/job-analysis/application/process-analysis";
import { createStaleRecovery } from "@/features/job-analysis/application/recover-stale";
import { createAnalysisRepository } from "@/features/job-analysis/repository";
import { jobAnalysis } from "@/features/job-analysis/schema";
import { createJobTextReader } from "@/features/job-intake/reader";
import { jobPosting } from "@/features/job-intake/schema";
import { createWorkerQueue } from "@/lib/queue";
import { user } from "@/lib/schema";
import { assertSafeTestDatabaseUrl } from "@/test/database-guard";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { createAnalysisWorker } from "./analysis-worker";

// Real pg-boss, real repository, real job reader; only the model is a fake. Runs against the
// guarded `*_test` database, in a throwaway pg-boss schema that is dropped afterwards, so the
// default `pgboss` schema is never touched.

let db: TestDatabase;
let close: () => Promise<void>;
let url: string;
let admin: ReturnType<typeof postgres>;
const schema = `pgboss_t_${randomBytes(6).toString("hex")}`;
const createdUsers: string[] = [];
const cleanups: (() => Promise<void>)[] = [];

const OK: ExtractionResult = {
  ok: true,
  requirements: {
    schemaVersion: 1,
    dictionaryVersion: "skills-v1",
    requiredSkills: [{ key: "go", name: "Go", mapped: true, quote: "We need Go." }],
    preferredSkills: [],
    minYearsExperience: null,
    languages: [],
    workMode: null,
    locations: [],
    droppedUngrounded: 0,
  },
  meta: {
    provider: "ollama",
    model: "qwen",
    latencyMs: 5,
    promptVersion: "extract-job-requirements.v1",
    demo: false,
  },
};

// Fast retries so the test finishes in seconds; the production values live in the policy file.
const FAST = {
  policy: "short" as const,
  retryLimit: 2,
  retryDelaySeconds: 1,
  retryDelayMaxSeconds: 2,
  expireInSeconds: 60,
};

async function newRun() {
  const created = await createTestUser(db, "worker");
  createdUsers.push(created.id);
  const [job] = await db
    .insert(jobPosting)
    .values({ userId: created.id, title: "Engineer", company: "Acme", description: "We need Go." })
    .returning({ id: jobPosting.id });
  const repository = createAnalysisRepository(db);
  const outcome = await repository.createPendingForUser(created.id, job.id, { dailyLimit: 1000 });
  if (outcome.kind !== "created") throw new Error("expected a new run");
  return { userId: created.id, analysisId: outcome.record.id };
}

const statusOf = async (id: string) =>
  (await db.select().from(jobAnalysis).where(eq(jobAnalysis.id, id)))[0];

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function startWorker(extract: (text: string) => Promise<ExtractionResult>) {
  const poolClient = postgres(url, { max: 4, onnotice: () => {} });
  const poolDb = drizzle(poolClient);
  const repository = createAnalysisRepository(poolDb);
  const errors: unknown[] = [];
  const queue = createWorkerQueue({
    connectionString: url,
    maxConnections: 4,
    schema,
    onError: (error) => errors.push(error),
  });
  const silent = { info() {}, warn() {}, error() {} };
  const worker = createAnalysisWorker({
    queue,
    queueName: ANALYSIS_QUEUE_NAME,
    queueSettings: FAST,
    processor: createAnalysisProcessor({
      repository,
      jobs: createJobTextReader(poolDb),
      extract,
      llmTimeoutMs: 60_000,
      logger: silent,
    }),
    recovery: createStaleRecovery({
      repository,
      queue: createAnalysisQueue({ send: (n, p, o) => queue.send(n, p, o) }),
      llmTimeoutMs: 60_000,
      logger: silent,
    }),
    logger: silent,
    recoveryIntervalMs: 3_600_000,
    shutdownTimeoutMs: 5_000,
  });
  cleanups.push(async () => {
    await worker.stop();
    await poolClient.end({ timeout: 5 });
  });
  const send = createAnalysisQueue({ send: (n, p, o) => queue.send(n, p, o) });
  return { worker, send, errors };
}

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL]);
  admin = postgres(url, { max: 1, onnotice: () => {} });
});

// Each test runs its own worker; stop it before the next test so workers never compete.
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => {});
});

afterAll(async () => {
  // Only ever our own throwaway schema, in the guarded test database.
  await admin.unsafe(`drop schema if exists ${schema} cascade`);
  await admin.end();
  if (createdUsers.length > 0) await db.delete(user).where(inArray(user.id, createdUsers));
  await close();
});

describe("analysis worker with a real queue", () => {
  it("delivers a job, completes the run, and ignores duplicate sends of the same job", async () => {
    let calls = 0;
    const { worker, send, errors } = startWorker(async () => {
      calls += 1;
      return OK;
    });
    await worker.start();
    const run = await newRun();

    // Three sends of the same run: the singleton key collapses the waiting ones.
    await Promise.all([1, 2, 3].map(() => send.enqueue(run)));
    const row = await until(
      () => statusOf(run.analysisId),
      (r) => r.status === "completed",
    );
    expect(row).toMatchObject({ status: "completed", attempts: 1, provider: "ollama" });

    // A duplicate delivered after completion changes nothing and never calls the model again.
    const before = calls;
    await send.enqueue(run);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(calls).toBe(before);
    expect(await statusOf(run.analysisId)).toMatchObject({ status: "completed", attempts: 1 });
    expect(errors).toEqual([]);
  });

  it("retries after a transient model failure and then completes", async () => {
    let calls = 0;
    const { worker, send } = startWorker(async () =>
      ++calls === 1 ? { ok: false, code: "provider_unavailable" } : OK,
    );
    await worker.start();
    const run = await newRun();
    await send.enqueue(run);
    const row = await until(
      () => statusOf(run.analysisId),
      (r) => r.status === "completed",
    );
    expect(row).toMatchObject({ status: "completed", attempts: 2, failureCode: null });
    expect(calls).toBe(2);
  });

  it("fails closed after the last attempt when the model stays unavailable", async () => {
    let calls = 0;
    const { worker, send } = startWorker(async () => {
      calls += 1;
      return { ok: false, code: "model_unavailable" };
    });
    await worker.start();
    const run = await newRun();
    await send.enqueue(run);
    const row = await until(
      () => statusOf(run.analysisId),
      (r) => r.status === "failed",
    );
    expect(row).toMatchObject({ status: "failed", failureCode: "model_unavailable", attempts: 3 });
    expect(row.requirements).toBeNull();
    expect(calls).toBe(3);
    // The queue delivers nothing more: the count stays at three.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(calls).toBe(3);
  });

  it("recovers a pending run whose queue job was lost", async () => {
    const { worker } = startWorker(async () => OK);
    await worker.start();
    const run = await newRun(); // never sent to the queue
    await db
      .update(jobAnalysis)
      .set({ updatedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(jobAnalysis.id, run.analysisId));
    await worker.sweep();
    const row = await until(
      () => statusOf(run.analysisId),
      (r) => r.status === "completed",
    );
    expect(row).toMatchObject({ status: "completed", attempts: 1 });
  });

  it("a payload for another user's run does nothing", async () => {
    let calls = 0;
    const { worker, send } = startWorker(async () => {
      calls += 1;
      return OK;
    });
    await worker.start();
    const run = await newRun();
    const intruder = await createTestUser(db, "intruder");
    createdUsers.push(intruder.id);
    await send.enqueue({ analysisId: run.analysisId, userId: intruder.id });
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(calls).toBe(0);
    expect(await statusOf(run.analysisId)).toMatchObject({ status: "pending", attempts: 0 });
  });
});
