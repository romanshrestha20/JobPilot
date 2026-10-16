import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobPosting } from "@/features/job-intake/schema";
import { user } from "@/lib/schema";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { jobAnalysis } from "./schema";

// Applies migrations 0000 to 0008 to the guarded `*_test` database and checks that the
// constraints in 0007 and 0008 really hold. Nothing here touches the development database.

let db: TestDatabase;
let close: () => Promise<void>;
let alice: { id: string };
let bob: { id: string };
const createdUsers: string[] = [];

const HASH = "a".repeat(64);
const REQUIREMENTS = { schemaVersion: 1, requiredSkills: [] };

async function newUser(label: string) {
  const created = await createTestUser(db, label);
  createdUsers.push(created.id);
  return created;
}

async function newJob(userId: string) {
  const [row] = await db
    .insert(jobPosting)
    .values({ userId, title: "Engineer", company: "Acme", description: "Build things." })
    .returning({ id: jobPosting.id });
  return row.id;
}

/** Postgres reports constraint violations on the cause of the driver's wrapped error. */
async function violation(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint_name?: string } }).cause;
    return `${cause?.code ?? "?"}:${cause?.constraint_name ?? ""}`;
  }
  return "no error";
}

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  alice = await newUser("alice");
  bob = await newUser("bob");
});

afterAll(async () => {
  if (createdUsers.length > 0) await db.delete(user).where(inArray(user.id, createdUsers));
  await close();
});

describe("job_analysis ownership", () => {
  it("accepts an analysis of the owner's own job", async () => {
    const jobId = await newJob(alice.id);
    const [row] = await db.insert(jobAnalysis).values({ userId: alice.id, jobId }).returning();
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
  });

  it("refuses an analysis that points at another user's job", async () => {
    const bobsJob = await newJob(bob.id);
    expect(
      await violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId: bobsJob })),
    ).toBe("23503:job_analysis_job_id_user_id_fk");
  });

  it("refuses a job that does not exist", async () => {
    expect(
      await violation(
        db
          .insert(jobAnalysis)
          .values({ userId: alice.id, jobId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).toBe("23503:job_analysis_job_id_user_id_fk");
  });

  it("job_posting has the (id, user_id) unique constraint the foreign key needs", async () => {
    const names = await db.execute(
      sql`select conname from pg_constraint where conname = 'job_posting_id_user_id_unique'`,
    );
    expect(names).toHaveLength(1);
  });

  it("deleting the job deletes its analyses; deleting the user deletes everything", async () => {
    const carol = await newUser("carol");
    const jobId = await newJob(carol.id);
    await db.insert(jobAnalysis).values({ userId: carol.id, jobId });
    await db.delete(jobPosting).where(eq(jobPosting.id, jobId));
    expect(await db.select().from(jobAnalysis).where(eq(jobAnalysis.jobId, jobId))).toHaveLength(0);

    const secondJob = await newJob(carol.id);
    await db.insert(jobAnalysis).values({ userId: carol.id, jobId: secondJob });
    await db.delete(user).where(eq(user.id, carol.id));
    expect(
      await db.select().from(jobAnalysis).where(eq(jobAnalysis.userId, carol.id)),
    ).toHaveLength(0);
  });
});

describe("job_analysis one active run per job", () => {
  it("allows only one pending or processing run, but any number of finished ones", async () => {
    const jobId = await newJob(alice.id);
    await db.insert(jobAnalysis).values({ userId: alice.id, jobId });
    expect(await violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId }))).toBe(
      "23505:job_analysis_one_active_per_job",
    );
    expect(
      await violation(
        db.insert(jobAnalysis).values({ userId: alice.id, jobId, status: "processing" }),
      ),
    ).toBe("23505:job_analysis_one_active_per_job");

    await db
      .update(jobAnalysis)
      .set({ status: "failed", failureCode: "timeout" })
      .where(eq(jobAnalysis.jobId, jobId));
    await db.insert(jobAnalysis).values({ userId: alice.id, jobId });
    await db
      .update(jobAnalysis)
      .set({ status: "failed", failureCode: "timeout" })
      .where(eq(jobAnalysis.jobId, jobId));
    await db
      .insert(jobAnalysis)
      .values({ userId: alice.id, jobId, status: "failed", failureCode: "too_long" });
    expect(await db.select().from(jobAnalysis).where(eq(jobAnalysis.jobId, jobId))).toHaveLength(3);
  });

  it("five inserts for one job: exactly one wins (one connection; real races come later)", async () => {
    const jobId = await newJob(alice.id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId })),
      ),
    );
    expect(results.filter((r) => r === "no error")).toHaveLength(1);
    expect(results.filter((r) => r === "23505:job_analysis_one_active_per_job")).toHaveLength(4);
  });
});

describe("job_analysis state constraints", () => {
  const completed = (jobId: string, overrides: Record<string, unknown> = {}) => ({
    userId: alice.id,
    jobId,
    status: "completed",
    requirements: REQUIREMENTS,
    descriptionHash: HASH,
    promptVersion: "extract-v1",
    provider: "demo",
    completedAt: new Date(),
    ...overrides,
  });

  it("accepts a complete, well-formed completed row", async () => {
    const jobId = await newJob(alice.id);
    const [row] = await db.insert(jobAnalysis).values(completed(jobId)).returning();
    expect(row.requirements).toEqual(REQUIREMENTS);
  });

  it("rejects values outside the allowed sets", async () => {
    const jobId = await newJob(alice.id);
    const bad = (values: Record<string, unknown>) =>
      violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId, ...values } as never));
    expect(await bad({ status: "done" })).toBe("23514:job_analysis_status_allowed");
    expect(await bad({ status: "failed", failureCode: "boom" })).toBe(
      "23514:job_analysis_failure_code_allowed",
    );
    expect(await bad({ provider: "openai" })).toBe("23514:job_analysis_provider_allowed");
  });

  it("a failure code exists if and only if the run failed", async () => {
    const jobId = await newJob(alice.id);
    const bad = (values: Record<string, unknown>) =>
      violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId, ...values } as never));
    expect(await bad({ status: "failed" })).toBe("23514:job_analysis_failure_code_iff_failed");
    expect(await bad({ status: "pending", failureCode: "timeout" })).toBe(
      "23514:job_analysis_failure_code_iff_failed",
    );
  });

  it("requirements exist if and only if the run completed, with full provenance", async () => {
    const jobId = await newJob(alice.id);
    const bad = (values: Record<string, unknown>) =>
      violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId, ...values } as never));
    expect(await bad({ requirements: REQUIREMENTS })).toBe(
      "23514:job_analysis_requirements_iff_completed",
    );
    // Breaks two CHECKs at once; Postgres reports the first it evaluates, so only the class is fixed.
    expect(await bad({ status: "completed" })).toMatch(/^23514:job_analysis_/);
    expect(await bad(completed(jobId, { descriptionHash: null }))).toBe(
      "23514:job_analysis_completed_has_provenance",
    );
    expect(await bad(completed(jobId, { completedAt: null }))).toBe(
      "23514:job_analysis_completed_has_provenance",
    );
    expect(await bad(completed(jobId, { promptVersion: null }))).toBe(
      "23514:job_analysis_completed_has_provenance",
    );
  });

  it("rejects a malformed hash, non-object requirements and negative counters", async () => {
    const jobId = await newJob(alice.id);
    const bad = (values: Record<string, unknown>) =>
      violation(db.insert(jobAnalysis).values({ userId: alice.id, jobId, ...values } as never));
    expect(await bad({ descriptionHash: "not-a-hash" })).toBe(
      "23514:job_analysis_description_hash_format",
    );
    expect(await bad({ descriptionHash: "A".repeat(64) })).toBe(
      "23514:job_analysis_description_hash_format",
    );
    expect(await bad(completed(jobId, { requirements: [1, 2] }))).toBe(
      "23514:job_analysis_requirements_object",
    );
    expect(await bad(completed(jobId, { requirements: { blob: "x".repeat(150_000) } }))).toBe(
      "23514:job_analysis_requirements_object",
    );
    expect(await bad({ attempts: -1 })).toBe("23514:job_analysis_counters_non_negative");
    expect(await bad({ droppedUngrounded: -1 })).toBe("23514:job_analysis_counters_non_negative");
  });
});
