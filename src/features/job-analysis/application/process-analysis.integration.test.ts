import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createJobTextReader } from "@/features/job-intake/reader";
import { jobPosting } from "@/features/job-intake/schema";
import { user } from "@/lib/schema";
import { assertSafeTestDatabaseUrl } from "@/test/database-guard";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import type { GroundedRequirements } from "../domain/requirements";
import {
  ABANDONED_PENDING_SECONDS,
  STALE_PENDING_SECONDS,
  staleProcessingSeconds,
} from "../domain/processing-policy";
import { createAnalysisRepository } from "../repository";
import { jobAnalysis } from "../schema";
import type { ExtractionResult } from "./extract";
import { createAnalysisProcessor } from "./process-analysis";
import { createStaleRecovery } from "./recover-stale";

// Runs against the guarded `*_test` database only. The model is a fake: no network, no LLM.

let db: TestDatabase;
let close: () => Promise<void>;
let racePool: ReturnType<typeof postgres>;
const createdUsers: string[] = [];
/** Never reclaim a processing run: only pending ones can be claimed. */
const NO_RECLAIM = { reclaimBefore: new Date(0) };

const REQUIREMENTS: GroundedRequirements = {
  schemaVersion: 1,
  dictionaryVersion: "skills-v1",
  requiredSkills: [{ key: "go", name: "Go", mapped: true, quote: "We need Go." }],
  preferredSkills: [],
  minYearsExperience: null,
  languages: [],
  workMode: null,
  locations: [],
  droppedUngrounded: 0,
};
const OK: ExtractionResult = {
  ok: true,
  requirements: REQUIREMENTS,
  meta: {
    provider: "ollama",
    model: "qwen",
    latencyMs: 5,
    promptVersion: "extract-job-requirements.v1",
    demo: false,
  },
};

async function newUser(label: string) {
  const created = await createTestUser(db, label);
  createdUsers.push(created.id);
  return created;
}
async function newJob(userId: string) {
  const [row] = await db
    .insert(jobPosting)
    .values({ userId, title: "Engineer", company: "Acme", description: "We need Go." })
    .returning({ id: jobPosting.id });
  return row.id;
}
async function newRun(repository: ReturnType<typeof createAnalysisRepository>, userId: string) {
  const jobId = await newJob(userId);
  const outcome = await repository.createPendingForUser(userId, jobId, { dailyLimit: 1000 });
  if (outcome.kind !== "created") throw new Error("expected a new run");
  return outcome.record;
}
const stored = async (id: string) =>
  (await db.select().from(jobAnalysis).where(eq(jobAnalysis.id, id)))[0];
const backdate = (id: string, seconds: number) =>
  db
    .update(jobAnalysis)
    .set({ updatedAt: new Date(Date.now() - seconds * 1000) })
    .where(eq(jobAnalysis.id, id));

function processorFor(
  pool: ReturnType<typeof postgres>,
  extract: (text: string) => Promise<ExtractionResult>,
) {
  const poolDb = drizzle(pool);
  return createAnalysisProcessor({
    repository: createAnalysisRepository(poolDb),
    jobs: createJobTextReader(poolDb),
    extract,
    llmTimeoutMs: 60_000,
    logger: { info() {}, warn() {}, error() {} },
  });
}

let repository: ReturnType<typeof createAnalysisRepository>;

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  repository = createAnalysisRepository(db);
  const url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL]);
  racePool = postgres(url, { max: 12, onnotice: () => {} });
});

afterAll(async () => {
  if (createdUsers.length > 0) await db.delete(user).where(inArray(user.id, createdUsers));
  await racePool.end();
  await close();
});

describe("processing against the database", () => {
  it("completes a run end to end and stores the validated result", async () => {
    const alice = await newUser("alice");
    const run = await newRun(repository, alice.id);
    const processor = processorFor(racePool, async () => OK);
    expect(await processor.process({ analysisId: run.id, userId: alice.id })).toEqual({
      kind: "completed",
    });
    const row = await stored(run.id);
    expect(row).toMatchObject({ status: "completed", attempts: 1, provider: "ollama" });
    expect(row.requirements).toEqual(REQUIREMENTS);
    expect(row.descriptionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("eight simultaneous deliveries leave exactly one completed result and never go backwards", async () => {
    const alice = await newUser("alice-dup");
    const run = await newRun(repository, alice.id);
    const extract = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return OK;
    });
    const processor = processorFor(racePool, extract);
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => processor.process({ analysisId: run.id, userId: alice.id })),
    );
    expect(outcomes.filter((o) => o.kind === "completed")).toHaveLength(1);
    expect(outcomes.every((o) => o.kind === "completed" || o.kind === "skipped")).toBe(true);
    const rows = await db.select().from(jobAnalysis).where(eq(jobAnalysis.jobId, run.jobId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
    const completedAt = rows[0].completedAt;

    // Later duplicates change nothing at all.
    expect(await processor.process({ analysisId: run.id, userId: alice.id })).toEqual({
      kind: "skipped",
      reason: "not_claimable",
    });
    const after = await stored(run.id);
    expect(after.completedAt).toEqual(completedAt);
    expect(after.attempts).toBe(rows[0].attempts);
  });

  it("another user's id in the payload cannot read, claim or change the run", async () => {
    const alice = await newUser("alice-own");
    const bob = await newUser("bob-own");
    const run = await newRun(repository, alice.id);
    const extract = vi.fn(async () => OK);
    const processor = processorFor(racePool, extract);
    expect(await processor.process({ analysisId: run.id, userId: bob.id })).toEqual({
      kind: "skipped",
      reason: "not_found",
    });
    expect(extract).not.toHaveBeenCalled();
    expect(await stored(run.id)).toMatchObject({
      status: "pending",
      attempts: 0,
      requirements: null,
    });
  });

  it("a retryable model failure retries, then fails closed on the last attempt", async () => {
    const alice = await newUser("alice-retry");
    const run = await newRun(repository, alice.id);
    const processor = processorFor(racePool, async () => ({
      ok: false,
      code: "model_unavailable",
    }));
    const payload = { analysisId: run.id, userId: alice.id };
    expect(await processor.process(payload)).toEqual({ kind: "retry", code: "model_unavailable" });
    expect(await stored(run.id)).toMatchObject({ status: "pending", attempts: 1 });
    expect(await processor.process(payload)).toMatchObject({ kind: "retry" });
    expect(await processor.process(payload)).toEqual({ kind: "failed", code: "model_unavailable" });
    expect(await stored(run.id)).toMatchObject({
      status: "failed",
      failureCode: "model_unavailable",
      attempts: 3,
      requirements: null,
    });
    // A late delivery cannot reopen it.
    expect(await processor.process(payload)).toEqual({ kind: "skipped", reason: "not_claimable" });
    expect((await stored(run.id)).status).toBe("failed");
  });

  it("a run recovers after one failed attempt: the retry completes it", async () => {
    const alice = await newUser("alice-recover");
    const run = await newRun(repository, alice.id);
    let calls = 0;
    const processor = processorFor(racePool, async () =>
      ++calls === 1 ? { ok: false, code: "timeout" } : OK,
    );
    const payload = { analysisId: run.id, userId: alice.id };
    expect(await processor.process(payload)).toMatchObject({ kind: "retry" });
    expect(await processor.process(payload)).toEqual({ kind: "completed" });
    expect(await stored(run.id)).toMatchObject({
      status: "completed",
      attempts: 2,
      failureCode: null,
    });
  });

  it("a deleted job ends the run failed without calling the model", async () => {
    const alice = await newUser("alice-del");
    const run = await newRun(repository, alice.id);
    // Deleting the job cascades to its analyses, so simulate the race by reading as another owner.
    const bob = await newUser("bob-del");
    const extract = vi.fn(async () => OK);
    const processor = createAnalysisProcessor({
      repository,
      jobs: { findJob: async () => null },
      extract,
      llmTimeoutMs: 60_000,
      logger: { info() {}, warn() {}, error() {} },
    });
    expect(await processor.process({ analysisId: run.id, userId: alice.id })).toEqual({
      kind: "failed",
      code: "job_missing",
    });
    expect(extract).not.toHaveBeenCalled();
    expect(bob.id).toBeTruthy();
  });
});

describe("stale-run recovery against the database", () => {
  const recorder = () => {
    const sent: { analysisId: string; userId: string }[] = [];
    return {
      sent,
      queue: { enqueue: async (p: { analysisId: string; userId: string }) => void sent.push(p) },
    };
  };

  it("lists only stale active runs, oldest first, and never finished ones", async () => {
    const alice = await newUser("alice-stale");
    const stalePending = await newRun(repository, alice.id);
    const freshPending = await newRun(repository, alice.id);
    const staleProcessing = await newRun(repository, alice.id);
    const done = await newRun(repository, alice.id);
    await repository.claim(alice.id, staleProcessing.id, NO_RECLAIM);
    await repository.claim(alice.id, done.id, NO_RECLAIM);
    await repository.complete(alice.id, done.id, {
      descriptionHash: "a".repeat(64),
      promptVersion: "v",
      provider: "demo",
      model: null,
      requirements: REQUIREMENTS,
      droppedUngrounded: 0,
    });
    await backdate(stalePending.id, STALE_PENDING_SECONDS + 60);
    await backdate(freshPending.id, 10);
    await backdate(staleProcessing.id, staleProcessingSeconds(60_000) + 60);
    await backdate(done.id, 10 * 86_400);

    const now = Date.now();
    const listed = await repository.listStale({
      pendingBefore: new Date(now - STALE_PENDING_SECONDS * 1000),
      processingBefore: new Date(now - staleProcessingSeconds(60_000) * 1000),
      limit: 500,
    });
    const ids = listed.map((r) => r.id);
    expect(ids).toContain(stalePending.id);
    expect(ids).toContain(staleProcessing.id);
    expect(ids).not.toContain(freshPending.id);
    expect(ids).not.toContain(done.id);

    const bounded = await repository.listStale({
      pendingBefore: new Date(now + 3_600_000),
      processingBefore: new Date(now + 3_600_000),
      limit: 1,
    });
    expect(bounded).toHaveLength(1);
  });

  it("failIfStale refuses a run that changed after the cutoff and a run that is finished", async () => {
    const alice = await newUser("alice-fis");
    const run = await newRun(repository, alice.id);
    // Fresh: not older than the cutoff.
    expect(
      await repository.failIfStale(alice.id, run.id, "timeout", new Date(Date.now() - 60_000)),
    ).toBeNull();
    expect((await stored(run.id)).status).toBe("pending");
    // Another user cannot fail it, even when it is stale.
    const bob = await newUser("bob-fis");
    await backdate(run.id, 600);
    expect(await repository.failIfStale(bob.id, run.id, "timeout", new Date())).toBeNull();
    expect((await stored(run.id)).status).toBe("pending");
    expect(await repository.failIfStale(alice.id, run.id, "timeout", new Date())).not.toBeNull();
    // Already failed: a second call changes nothing.
    expect(
      await repository.failIfStale(alice.id, run.id, "enqueue_failed", new Date(Date.now() + 5000)),
    ).toBeNull();
    expect(await stored(run.id)).toMatchObject({ status: "failed", failureCode: "timeout" });
  });

  it("recovery re-enqueues a lost pending run, fails exhausted and abandoned ones", async () => {
    const alice = await newUser("alice-rec");
    const lost = await newRun(repository, alice.id);
    const abandoned = await newRun(repository, alice.id);
    const exhausted = await newRun(repository, alice.id);
    await repository.claim(alice.id, exhausted.id, NO_RECLAIM);
    await db.update(jobAnalysis).set({ attempts: 3 }).where(eq(jobAnalysis.id, exhausted.id));
    await backdate(lost.id, STALE_PENDING_SECONDS + 60);
    await backdate(abandoned.id, ABANDONED_PENDING_SECONDS + 60);
    await backdate(exhausted.id, staleProcessingSeconds(60_000) + 60);

    const { sent, queue } = recorder();
    const recovery = createStaleRecovery({
      repository,
      queue,
      llmTimeoutMs: 60_000,
      logger: { info() {}, warn() {}, error() {} },
    });
    await recovery.recover();

    expect(sent.map((s) => s.analysisId)).toContain(lost.id);
    expect(sent.map((s) => s.analysisId)).not.toContain(abandoned.id);
    expect(await stored(lost.id)).toMatchObject({ status: "pending" });
    expect(await stored(abandoned.id)).toMatchObject({
      status: "failed",
      failureCode: "enqueue_failed",
    });
    expect(await stored(exhausted.id)).toMatchObject({
      status: "failed",
      failureCode: "retries_exhausted",
    });

    // A second pass is harmless: the failed runs stay as they are.
    await recovery.recover();
    expect((await stored(abandoned.id)).failureCode).toBe("enqueue_failed");
    expect((await stored(exhausted.id)).failureCode).toBe("retries_exhausted");
  });
});
