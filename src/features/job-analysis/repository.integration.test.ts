import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jobPosting } from "@/features/job-intake/schema";
import { user } from "@/lib/schema";
import { assertSafeTestDatabaseUrl } from "@/test/database-guard";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import {
  createAnalysisService,
  type AnalysisQueue,
  type JobReader,
} from "./application/analysis-service";
import { hashDescription } from "./domain/description-hash";
import type { GroundedRequirements } from "./domain/requirements";
import { createAnalysisRepository, type CompletedResult } from "./repository";
import { jobAnalysis } from "./schema";

// Runs against the guarded `*_test` database only. `connectTestDatabase` applies the
// migrations; the race tests use a pool of their own so requests genuinely overlap.

let db: TestDatabase;
let close: () => Promise<void>;
let racePool: ReturnType<typeof postgres>;
let repository: ReturnType<typeof createAnalysisRepository>;
let raceRepository: ReturnType<typeof createAnalysisRepository>;
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

const result = (description: string): CompletedResult => ({
  descriptionHash: hashDescription(description),
  promptVersion: "extract-job-requirements.v1",
  provider: "demo",
  model: null,
  requirements: REQUIREMENTS,
  droppedUngrounded: 0,
});

async function newUser(label: string) {
  const created = await createTestUser(db, label);
  createdUsers.push(created.id);
  return created;
}

async function newJob(userId: string, description = "We need Go.") {
  const [row] = await db
    .insert(jobPosting)
    .values({ userId, title: "Engineer", company: "Acme", description })
    .returning({ id: jobPosting.id });
  return row.id;
}

/** The same ownership rule the real job reader applies: id AND user_id. */
const jobReader: JobReader = {
  async findJob(userId, jobId) {
    const [row] = await db
      .select({ description: jobPosting.description })
      .from(jobPosting)
      .where(and(eq(jobPosting.id, jobId), eq(jobPosting.userId, userId)))
      .limit(1);
    return row ?? null;
  },
};

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  repository = createAnalysisRepository(db);
  const url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL]);
  racePool = postgres(url, { max: 12, onnotice: () => {} });
  raceRepository = createAnalysisRepository(drizzle(racePool));
});

afterAll(async () => {
  if (createdUsers.length > 0) await db.delete(user).where(inArray(user.id, createdUsers));
  await racePool.end();
  await close();
});

describe("createPendingForUser", () => {
  it("creates a pending run, then returns it while it is active", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const first = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    expect(first.kind).toBe("created");
    if (first.kind !== "created") return;
    expect(first.record).toMatchObject({ status: "pending", attempts: 0, userId: alice.id });

    const second = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    expect(second).toMatchObject({ kind: "already_active", record: { id: first.record.id } });
  });

  it("starts a new run after the previous one failed or completed; history is kept", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const first = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    if (first.kind !== "created") throw new Error("expected created");
    await repository.fail(alice.id, first.record.id, "timeout");

    const retry = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    expect(retry.kind).toBe("created");
    if (retry.kind !== "created") return;
    expect(retry.record.id).not.toBe(first.record.id);
    expect(await repository.findForUser(alice.id, first.record.id)).toMatchObject({
      status: "failed",
      failureCode: "timeout",
    });
  });

  it("cannot create a run for another user's job, even when called directly", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const bobsJob = await newJob(bob.id);
    await expect(
      repository.createPendingForUser(alice.id, bobsJob, { dailyLimit: 20 }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    expect(await db.select().from(jobAnalysis).where(eq(jobAnalysis.jobId, bobsJob))).toHaveLength(
      0,
    );
  });

  it("enforces the daily limit, counting failed runs but not lost-queue ones or old ones", async () => {
    const alice = await newUser("alice");
    const oldJob = await newJob(alice.id);
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    // Five runs from 25 hours ago do not count.
    for (let i = 0; i < 5; i += 1) {
      await db.insert(jobAnalysis).values({
        userId: alice.id,
        jobId: oldJob,
        status: "failed",
        failureCode: "timeout",
        createdAt: longAgo,
      });
    }
    // Two runs that never reached the queue do not count either.
    for (let i = 0; i < 2; i += 1) {
      await db.insert(jobAnalysis).values({
        userId: alice.id,
        jobId: oldJob,
        status: "failed",
        failureCode: "enqueue_failed",
      });
    }
    // Three real runs do.
    for (let i = 0; i < 3; i += 1) {
      await db.insert(jobAnalysis).values({
        userId: alice.id,
        jobId: oldJob,
        status: "failed",
        failureCode: "invalid_output",
      });
    }
    const jobId = await newJob(alice.id);
    expect((await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 4 })).kind).toBe(
      "created",
    );
    const other = await newJob(alice.id);
    expect(await repository.createPendingForUser(alice.id, other, { dailyLimit: 4 })).toEqual({
      kind: "quota_exceeded",
    });
  });

  it("one user's usage never counts against another", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const aliceJob = await newJob(alice.id);
    await repository.createPendingForUser(alice.id, aliceJob, { dailyLimit: 1 });
    const bobJob = await newJob(bob.id);
    expect((await repository.createPendingForUser(bob.id, bobJob, { dailyLimit: 1 })).kind).toBe(
      "created",
    );
  });
});

describe("concurrent requests", () => {
  it("15 simultaneous requests for one job create exactly one run", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const outcomes = await Promise.all(
      Array.from({ length: 15 }, () =>
        raceRepository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 }),
      ),
    );
    const created = outcomes.filter((o) => o.kind === "created");
    expect(created).toHaveLength(1);
    const ids = new Set(outcomes.map((o) => (o.kind === "quota_exceeded" ? null : o.record.id)));
    expect(ids.size).toBe(1);
    expect(await db.select().from(jobAnalysis).where(eq(jobAnalysis.jobId, jobId))).toHaveLength(1);
  });

  it("30 simultaneous requests across 30 jobs stay within the daily limit of 20", async () => {
    const alice = await newUser("alice");
    const jobs = await Promise.all(Array.from({ length: 30 }, () => newJob(alice.id)));
    const outcomes = await Promise.all(
      jobs.map((jobId) => raceRepository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 })),
    );
    expect(outcomes.filter((o) => o.kind === "created")).toHaveLength(20);
    expect(outcomes.filter((o) => o.kind === "quota_exceeded")).toHaveLength(10);
    expect(
      await db.select().from(jobAnalysis).where(eq(jobAnalysis.userId, alice.id)),
    ).toHaveLength(20);
  });
});

describe("state machine", () => {
  async function pendingRun(userId: string) {
    const jobId = await newJob(userId);
    const outcome = await repository.createPendingForUser(userId, jobId, { dailyLimit: 20 });
    if (outcome.kind !== "created") throw new Error("expected created");
    return { jobId, id: outcome.record.id };
  }

  it("pending -> processing -> completed, with the result stored", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);

    const claimed = await repository.claim(alice.id, id, NO_RECLAIM);
    expect(claimed).toMatchObject({ status: "processing", attempts: 1 });
    expect(claimed?.startedAt).not.toBeNull();

    const done = await repository.complete(alice.id, id, result("We need Go."));
    expect(done).toMatchObject({ status: "completed", provider: "demo", failureCode: null });
    expect(done?.requirements).toEqual(REQUIREMENTS);
    expect(done?.completedAt).not.toBeNull();
  });

  it("a duplicate delivery cannot claim a run another delivery is working on", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    expect(await repository.claim(alice.id, id, NO_RECLAIM)).toBeNull();
    expect(await repository.findForUser(alice.id, id)).toMatchObject({
      status: "processing",
      attempts: 1,
    });
  });

  it("a processing run idle past the cutoff (its worker died) is claimed again and counted", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    const future = { reclaimBefore: new Date(Date.now() + 60_000) };
    expect(await repository.claim(alice.id, id, future)).toMatchObject({
      status: "processing",
      attempts: 2,
    });
  });

  it("ten simultaneous claims of one pending run: exactly one wins", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => raceRepository.claim(alice.id, id, NO_RECLAIM)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.findForUser(alice.id, id)).toMatchObject({ attempts: 1 });
  });

  it("release hands a processing run back, only for the attempt that holds it", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    expect(await repository.release(alice.id, id, 2)).toBeNull(); // wrong attempt
    expect(await repository.release(bob.id, id, 1)).toBeNull(); // wrong owner
    expect(await repository.release(alice.id, id, 1)).toMatchObject({
      status: "pending",
      attempts: 1,
    });
    expect(await repository.release(alice.id, id, 1)).toBeNull(); // no longer processing
    expect(await repository.claim(alice.id, id, NO_RECLAIM)).toMatchObject({ attempts: 2 });
  });

  it("release cannot reopen a finished run", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    await repository.complete(alice.id, id, result("We need Go."));
    expect(await repository.release(alice.id, id, 1)).toBeNull();
    expect(await repository.findForUser(alice.id, id)).toMatchObject({ status: "completed" });
  });

  it("cannot complete a run that was never claimed", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    expect(await repository.complete(alice.id, id, result("We need Go."))).toBeNull();
    expect(await repository.findForUser(alice.id, id)).toMatchObject({ status: "pending" });
  });

  it("a finished run cannot be claimed, completed again, failed or overwritten", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    await repository.complete(alice.id, id, result("We need Go."));

    expect(await repository.claim(alice.id, id, NO_RECLAIM)).toBeNull();
    expect(await repository.complete(alice.id, id, result("Different."))).toBeNull();
    expect(await repository.fail(alice.id, id, "timeout")).toBeNull();
    const row = await repository.findForUser(alice.id, id);
    expect(row).toMatchObject({ status: "completed", attempts: 1, failureCode: null });
    expect(row?.descriptionHash).toBe(hashDescription("We need Go."));
  });

  it("a failed run cannot be claimed or completed by a late delivery", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    expect(await repository.fail(alice.id, id, "provider_unavailable")).toMatchObject({
      status: "failed",
      failureCode: "provider_unavailable",
    });
    expect(await repository.claim(alice.id, id, NO_RECLAIM)).toBeNull();
    expect(await repository.complete(alice.id, id, result("We need Go."))).toBeNull();
    expect(await repository.fail(alice.id, id, "timeout")).toBeNull();
    expect(await repository.findForUser(alice.id, id)).toMatchObject({
      status: "failed",
      failureCode: "provider_unavailable",
    });
  });

  it("a pending run can be failed directly (lost queue)", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    expect(await repository.fail(alice.id, id, "enqueue_failed")).toMatchObject({
      status: "failed",
      failureCode: "enqueue_failed",
    });
  });

  it("two simultaneous completions: exactly one wins", async () => {
    const alice = await newUser("alice");
    const { id } = await pendingRun(alice.id);
    await repository.claim(alice.id, id, NO_RECLAIM);
    const results = await Promise.all(
      ["First.", "Second.", "Third.", "Fourth."].map((text) =>
        raceRepository.complete(alice.id, id, result(text)),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});

describe("ownership", () => {
  it("another user cannot read, claim, complete or fail someone's analysis", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const jobId = await newJob(alice.id);
    const outcome = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    if (outcome.kind !== "created") throw new Error("expected created");
    const { id } = outcome.record;

    expect(await repository.findForUser(bob.id, id)).toBeNull();
    expect(await repository.latestForJob(bob.id, jobId)).toEqual({
      latest: null,
      latestCompleted: null,
    });
    expect(await repository.claim(bob.id, id, NO_RECLAIM)).toBeNull();
    await repository.claim(alice.id, id, NO_RECLAIM);
    expect(await repository.complete(bob.id, id, result("We need Go."))).toBeNull();
    expect(await repository.fail(bob.id, id, "timeout")).toBeNull();
    expect(await repository.findForUser(alice.id, id)).toMatchObject({
      status: "processing",
      failureCode: null,
    });
  });

  it("a forged payload cannot widen access: ids alone never select a row", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const outcome = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    if (outcome.kind !== "created") throw new Error("expected created");
    for (const userId of ["", "%", "alice", "' OR '1'='1", alice.id.toUpperCase()]) {
      expect(await repository.findForUser(userId, outcome.record.id)).toBeNull();
      expect(await repository.claim(userId, outcome.record.id, NO_RECLAIM)).toBeNull();
    }
  });

  it("latestForJob returns the newest run and the newest completed run", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const first = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    if (first.kind !== "created") throw new Error("expected created");
    await repository.claim(alice.id, first.record.id, NO_RECLAIM);
    await repository.complete(alice.id, first.record.id, result("We need Go."));

    const second = await repository.createPendingForUser(alice.id, jobId, { dailyLimit: 20 });
    if (second.kind !== "created") throw new Error("expected created");
    await repository.fail(alice.id, second.record.id, "timeout");

    const view = await repository.latestForJob(alice.id, jobId);
    expect(view.latest?.id).toBe(second.record.id);
    expect(view.latestCompleted?.id).toBe(first.record.id);
  });
});

describe("analysis service with the real repository", () => {
  it("requests, queues and reports the run; foreign jobs are plain not found", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const jobId = await newJob(alice.id);
    const enqueue = vi.fn<AnalysisQueue["enqueue"]>(async () => {});
    const service = createAnalysisService({ repository, jobs: jobReader, queue: { enqueue } });

    expect(await service.requestAnalysis(bob, jobId)).toEqual({ ok: false, reason: "not_found" });
    expect(enqueue).not.toHaveBeenCalled();

    const requested = await service.requestAnalysis(alice, jobId);
    expect(requested).toMatchObject({ ok: true, created: true });
    const again = await service.requestAnalysis(alice, jobId);
    expect(again).toMatchObject({ ok: true, created: false });
    expect(enqueue).toHaveBeenCalledTimes(1);

    expect(await service.getMyAnalysisView(bob, jobId)).toBeNull();
    expect((await service.getMyAnalysisView(alice, jobId))?.latest?.status).toBe("pending");
  });

  it("marks the run failed and leaves nothing pending when the queue is down", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const service = createAnalysisService({
      repository,
      jobs: jobReader,
      queue: {
        enqueue: async () => {
          throw new Error("queue down");
        },
      },
    });
    expect(await service.requestAnalysis(alice, jobId)).toEqual({
      ok: false,
      reason: "enqueue_failed",
    });
    const view = await service.getMyAnalysisView(alice, jobId);
    expect(view?.latest).toMatchObject({
      status: "failed",
      failureCode: "enqueue_failed",
      canRetry: true,
    });
    // The failed run does not block a retry once the queue is back.
    const healthy = createAnalysisService({
      repository,
      jobs: jobReader,
      queue: { enqueue: async () => {} },
    });
    expect(await healthy.requestAnalysis(alice, jobId)).toMatchObject({ ok: true, created: true });
  });

  it("reports a completed result as out of date after the description is edited", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id, "We need Go.");
    const service = createAnalysisService({
      repository,
      jobs: jobReader,
      queue: { enqueue: async () => {} },
    });
    const requested = await service.requestAnalysis(alice, jobId);
    if (!requested.ok) throw new Error("expected ok");
    await repository.claim(alice.id, requested.analysis.id, NO_RECLAIM);
    await repository.complete(alice.id, requested.analysis.id, result("We need Go."));

    expect((await service.getMyAnalysisView(alice, jobId))?.stale).toBe(false);
    await db
      .update(jobPosting)
      .set({ description: "We need Rust now." })
      .where(eq(jobPosting.id, jobId));
    const view = await service.getMyAnalysisView(alice, jobId);
    expect(view?.stale).toBe(true);
    expect(view?.current?.requirements).toEqual(REQUIREMENTS);
  });

  it("deleting the job removes its analyses, and the view is gone", async () => {
    const alice = await newUser("alice");
    const jobId = await newJob(alice.id);
    const service = createAnalysisService({
      repository,
      jobs: jobReader,
      queue: { enqueue: async () => {} },
    });
    await service.requestAnalysis(alice, jobId);
    await db.delete(jobPosting).where(eq(jobPosting.id, jobId));
    expect(await service.getMyAnalysisView(alice, jobId)).toBeNull();
    expect(await db.select().from(jobAnalysis).where(eq(jobAnalysis.jobId, jobId))).toHaveLength(0);
  });
});
