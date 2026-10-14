import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { createJobRepository } from "./repository";
import { jobPosting } from "./schema";
import { createJobService } from "./service";

let db: TestDatabase;
let close: () => Promise<void>;
let service: ReturnType<typeof createJobService>;
let alice: { id: string };
let bob: { id: string };
const createdUsers: string[] = [];

const input = { title: "Backend engineer", company: "Acme", description: "Build services." };

async function rowsFor(userId: string) {
  return db.select().from(jobPosting).where(eq(jobPosting.userId, userId));
}

async function createJob(user: { id: string }, overrides: Record<string, unknown> = {}) {
  const result = await service.createMyJob(user, { ...input, ...overrides });
  if (!result.ok) throw new Error("setup failed");
  return result.job;
}

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  service = createJobService(createJobRepository(db));
  alice = await createTestUser(db, "job-alice");
  bob = await createTestUser(db, "job-bob");
  createdUsers.push(alice.id, bob.id);
});

afterAll(async () => {
  // Deleting users cascades to their jobs.
  for (const id of createdUsers) await db.execute(sql`delete from "user" where id = ${id}`);
  await close();
});

describe("job creation (real PostgreSQL)", () => {
  it("stores a valid job owned by the authenticated user", async () => {
    const result = await service.createMyJob(alice, {
      ...input,
      location: "Helsinki",
      sourceUrl: "https://example.com/jobs/1",
      description: "Line one\n\nLine two",
    });

    expect(result.ok).toBe(true);
    const rows = await rowsFor(alice.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: alice.id,
      title: "Backend engineer",
      location: "Helsinki",
      sourceUrl: "https://example.com/jobs/1",
      description: "Line one\n\nLine two",
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("stores nothing when validation fails", async () => {
    const before = (await rowsFor(bob.id)).length;
    for (const bad of [
      { title: "   " },
      { company: "" },
      { description: "\n\t " },
      { title: "x".repeat(201) },
      { description: "x".repeat(20_001) },
      { sourceUrl: "javascript:alert(1)" },
      { userId: alice.id },
    ]) {
      const result = await service.createMyJob(bob, { ...input, ...bad });
      expect(result.ok).toBe(false);
    }
    expect(await rowsFor(bob.id)).toHaveLength(before);
  });

  it("ignores any attempt to set the owner through input", async () => {
    await service.createMyJob(bob, { ...input, title: "Bob's", userId: alice.id });
    expect((await rowsFor(alice.id)).some((row) => row.title === "Bob's")).toBe(false);
  });
});

describe("listing and reading (real PostgreSQL)", () => {
  it("lists only the caller's jobs, newest first, without descriptions", async () => {
    const first = await createJob(alice, { title: "Older" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await createJob(alice, { title: "Newer" });
    await createJob(bob, { title: "Bob only" });

    const { jobs } = await service.listMyJobs(alice);
    const ids = jobs.map((job) => job.id);

    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(jobs.some((job) => job.title === "Bob only")).toBe(false);
    expect(jobs[0]).not.toHaveProperty("description");
    expect(jobs[0]).not.toHaveProperty("userId");
  });

  it("paginates with a bounded page size", async () => {
    const carol = await createTestUser(db, "job-carol");
    createdUsers.push(carol.id);
    for (let i = 0; i < 22; i++) await createJob(carol, { title: `Job ${i}` });

    const first = await service.listMyJobs(carol, 1);
    const second = await service.listMyJobs(carol, 2);

    expect(first.jobs).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(second.jobs).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.jobs, ...second.jobs].map((job) => job.id)).size).toBe(22);
  });

  it("reads the full job, including the untouched description, for its owner", async () => {
    const description = "Para one.\n\n  Indented <b>not html</b>\n- bullet";
    const job = await createJob(alice, { description });

    const read = await service.getMyJob(alice, job.id);

    expect(read).toMatchObject({ id: job.id, description });
    expect(read).not.toHaveProperty("userId");
  });
});

describe("cross-user access (real PostgreSQL)", () => {
  it("answers a missing id and another user's id identically", async () => {
    const job = await createJob(alice, { title: "Alice private" });

    const foreign = await service.getMyJob(bob, job.id);
    const missing = await service.getMyJob(bob, "00000000-0000-4000-8000-000000000000");

    expect(foreign).toBeNull();
    expect(missing).toBeNull();
  });

  it("never lets another user delete a job, and leaves it intact", async () => {
    const job = await createJob(alice, { title: "Keep me" });

    await expect(service.deleteMyJob(bob, job.id)).resolves.toBe(false);

    await expect(service.getMyJob(alice, job.id)).resolves.toMatchObject({ title: "Keep me" });
  });

  it("lets the owner delete, and the job is gone", async () => {
    const job = await createJob(alice, { title: "Delete me" });

    await expect(service.deleteMyJob(alice, job.id)).resolves.toBe(true);

    await expect(service.getMyJob(alice, job.id)).resolves.toBeNull();
    await expect(service.deleteMyJob(alice, job.id)).resolves.toBe(false);
  });
});

describe("database constraints and cascade (real PostgreSQL)", () => {
  const raw = (overrides: Record<string, unknown>) => ({
    userId: alice.id,
    title: "T",
    company: "C",
    description: "D",
    ...overrides,
  });

  it.each([
    ["blank title", { title: "   " }],
    ["overlong title", { title: "x".repeat(201) }],
    ["blank company", { company: " " }],
    ["blank description", { description: "  \n" }],
    ["overlong description", { description: "x".repeat(20_001) }],
    ["blank location", { location: "  " }],
    ["newline-only title", { title: "\n" }],
    ["tab-only company", { company: "\t\t" }],
    ["mixed-whitespace description", { description: " \n\t\r\n " }],
    ["newline-only location", { location: "\n" }],
    ["non-http source URL", { sourceUrl: "javascript:alert(1)" }],
    ["ftp source URL", { sourceUrl: "ftp://example.com" }],
  ])("rejects %s directly in SQL", async (_name, overrides) => {
    await expect(db.insert(jobPosting).values(raw(overrides))).rejects.toThrow();
  });

  it("rejects a job for a user that does not exist", async () => {
    await expect(db.insert(jobPosting).values(raw({ userId: "no-such-user" }))).rejects.toThrow();
  });

  it("rejects a NULL owner", async () => {
    await expect(
      db.insert(jobPosting).values(raw({ userId: null as unknown as string })),
    ).rejects.toThrow();
  });

  it("deletes a user's jobs together with the user", async () => {
    const temp = await createTestUser(db, "job-temp");
    await createJob(temp, { title: "Cascade" });
    expect(await rowsFor(temp.id)).toHaveLength(1);

    await db.execute(sql`delete from "user" where id = ${temp.id}`);

    expect(await rowsFor(temp.id)).toHaveLength(0);
  });
});

describe("editing a job (real PostgreSQL)", () => {
  const edit = {
    title: "Edited title",
    company: "Edited Co",
    location: "Oulu",
    sourceUrl: "https://example.com/edited",
    description: "Edited description.\n\nSecond paragraph.",
  };

  async function rowById(id: string) {
    const [row] = await db.select().from(jobPosting).where(eq(jobPosting.id, id));
    return row;
  }

  it("lets the owner change every editable field and bumps only updated_at", async () => {
    const job = await createJob(alice, { title: "Original" });
    const before = await rowById(job.id);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await service.updateMyJob(alice, job.id, edit);

    expect(result.ok).toBe(true);
    const after = await rowById(job.id);
    expect(after).toMatchObject({ ...edit, userId: alice.id, id: job.id });
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("clears optional fields when they are submitted empty", async () => {
    const job = await createJob(alice, {
      location: "Somewhere",
      sourceUrl: "https://example.com/x",
    });

    await service.updateMyJob(alice, job.id, { ...input, location: "", sourceUrl: "" });

    expect(await rowById(job.id)).toMatchObject({ location: null, sourceUrl: null });
  });

  it("never lets another user change a job, verified directly in the database", async () => {
    const job = await createJob(alice, { title: "Alice's job", description: "Alice's text." });
    const before = await rowById(job.id);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await service.updateMyJob(bob, job.id, edit);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await rowById(job.id)).toEqual(before);
  });

  it("gives a non-owner the same answer for invalid input as for valid input", async () => {
    const job = await createJob(alice);
    const before = await rowById(job.id);

    const result = await service.updateMyJob(bob, job.id, { title: "" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await rowById(job.id)).toEqual(before);
  });

  it("cannot be used to take over or reassign a job", async () => {
    const job = await createJob(alice);

    const forged = await service.updateMyJob(alice, job.id, { ...edit, userId: bob.id });
    const forgedByBob = await service.updateMyJob(bob, job.id, { ...edit, userId: bob.id });

    expect(forged.ok).toBe(false);
    expect(forgedByBob.ok).toBe(false);
    expect((await rowById(job.id)).userId).toBe(alice.id);
  });

  it("leaves the stored job unchanged when validation fails", async () => {
    const job = await createJob(alice);
    const before = await rowById(job.id);

    for (const bad of [{ title: "  " }, { description: "\n\t" }, { sourceUrl: "ftp://x.test" }]) {
      const result = await service.updateMyJob(alice, job.id, { ...edit, ...bad });
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    }

    expect(await rowById(job.id)).toEqual(before);
  });

  it("only touches the targeted job", async () => {
    const target = await createJob(alice, { title: "Target" });
    const other = await createJob(alice, { title: "Bystander" });
    const otherBefore = await rowById(other.id);

    await service.updateMyJob(alice, target.id, edit);

    expect(await rowById(other.id)).toEqual(otherBefore);
  });

  it("answers missing and malformed ids as not found", async () => {
    await expect(
      service.updateMyJob(alice, "00000000-0000-4000-8000-000000000000", edit),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(service.updateMyJob(alice, "not-a-uuid", edit)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("is still held to the database constraints", async () => {
    const job = await createJob(alice);
    await expect(
      db.update(jobPosting).set({ title: "\n\t " }).where(eq(jobPosting.id, job.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(jobPosting)
        .set({ sourceUrl: "javascript:alert(1)" })
        .where(eq(jobPosting.id, job.id)),
    ).rejects.toThrow();
  });
});

describe("application status (real PostgreSQL)", () => {
  async function rowById(id: string) {
    const [row] = await db.select().from(jobPosting).where(eq(jobPosting.id, id));
    return row;
  }

  it("gives new jobs the saved status, whether created through the service or raw SQL", async () => {
    const viaService = await createJob(alice, { title: "Default status" });
    expect(viaService.status).toBe("saved");
    expect((await rowById(viaService.id)).status).toBe("saved");

    const [raw] = await db
      .insert(jobPosting)
      .values({ userId: alice.id, title: "Raw", company: "C", description: "D" })
      .returning();
    expect(raw.status).toBe("saved");
  });

  it("lets the owner move a job through every status and bumps updated_at", async () => {
    const job = await createJob(alice, { title: "Pipeline" });
    const before = await rowById(job.id);

    for (const status of ["applied", "interviewing", "offered", "rejected", "withdrawn", "saved"]) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await service.updateMyJobStatus(alice, job.id, { status });
      expect(result).toMatchObject({ ok: true, job: { status } });
      expect((await rowById(job.id)).status).toBe(status);
    }

    const after = await rowById(job.id);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect({ ...after, status: "x", updatedAt: null }).toEqual({
      ...before,
      status: "x",
      updatedAt: null,
    });
  });

  it("never lets another user change a status, and leaves the row byte-identical", async () => {
    const job = await createJob(alice, { title: "Alice status" });
    const before = await rowById(job.id);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await service.updateMyJobStatus(bob, job.id, { status: "offered" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    // Even an invalid status from a non-owner is just "not found".
    expect(await service.updateMyJobStatus(bob, job.id, { status: "bogus" })).toEqual({
      ok: false,
      reason: "not_found",
    });

    expect(await rowById(job.id)).toEqual(before);
  });

  it("rejects invalid status values before they reach the database and changes nothing", async () => {
    const job = await createJob(alice, { title: "Invalid status" });
    const before = await rowById(job.id);

    for (const bad of [
      { status: "hired" },
      { status: "" },
      {},
      { status: "applied", userId: bob.id },
    ]) {
      const result = await service.updateMyJobStatus(alice, job.id, bad);
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    }

    expect(await rowById(job.id)).toEqual(before);
  });

  it("only touches the targeted job", async () => {
    const target = await createJob(alice, { title: "Target status" });
    const bystander = await createJob(alice, { title: "Bystander status" });
    const bystanderBefore = await rowById(bystander.id);

    await service.updateMyJobStatus(alice, target.id, { status: "interviewing" });

    expect(await rowById(bystander.id)).toEqual(bystanderBefore);
  });

  it("answers missing and malformed ids as not found", async () => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect(await service.updateMyJobStatus(alice, id, { status: "applied" })).toEqual({
        ok: false,
        reason: "not_found",
      });
    }
  });

  it("rejects an invalid status in SQL too (CHECK constraint), on insert and update", async () => {
    const job = await createJob(alice, { title: "Constraint" });

    await expect(
      db.update(jobPosting).set({ status: "hired" }).where(eq(jobPosting.id, job.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(jobPosting).values({
        userId: alice.id,
        title: "T",
        company: "C",
        description: "D",
        status: "Applied",
      }),
    ).rejects.toThrow();
    await expect(
      db
        .update(jobPosting)
        .set({ status: sql`NULL` })
        .where(eq(jobPosting.id, job.id)),
    ).rejects.toThrow();
    expect((await rowById(job.id)).status).toBe("saved");
  });

  it("ordinary edits never change the status", async () => {
    const job = await createJob(alice, { title: "Keeps status" });
    await service.updateMyJobStatus(alice, job.id, { status: "applied" });

    await service.updateMyJob(alice, job.id, { ...input, title: "Edited, still applied" });

    expect(await rowById(job.id)).toMatchObject({
      status: "applied",
      title: "Edited, still applied",
    });
  });

  describe("filtering", () => {
    let dana: { id: string };

    beforeAll(async () => {
      dana = await createTestUser(db, "job-dana");
      createdUsers.push(dana.id);
      const now = Date.now();
      const statuses = ["applied", "saved", "applied", "rejected", "applied", "saved", "applied"];
      for (let i = 0; i < 22; i++) {
        const status = statuses[i % statuses.length];
        await db.insert(jobPosting).values({
          userId: dana.id,
          title: `Dana ${i}`,
          company: "Acme",
          description: "D",
          status,
          createdAt: new Date(now - i * 60_000),
        });
      }
      await createJob(bob, { title: "Bob applied" });
      await service.updateMyJobStatus(bob, (await service.listMyJobs(bob, 1, "saved")).jobs[0].id, {
        status: "applied",
      });
    });

    it("returns only matching statuses, newest first, and nothing from other users", async () => {
      const { jobs } = await service.listMyJobs(dana, 1, "applied");

      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every((job) => job.status === "applied")).toBe(true);
      const times = jobs.map((job) => job.createdAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(jobs.some((job) => job.title.startsWith("Bob"))).toBe(false);
    });

    it("lists every status when unfiltered", async () => {
      const { jobs } = await service.listMyJobs(dana, 1);
      expect(new Set(jobs.map((job) => job.status))).toEqual(
        new Set(["applied", "saved", "rejected"]),
      );
    });

    it("paginates within a filter without skipping or repeating rows", async () => {
      const total = (
        await db.select().from(jobPosting).where(eq(jobPosting.userId, dana.id))
      ).filter((row) => row.status === "applied").length;
      const seen: string[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await service.listMyJobs(dana, page, "applied");
        seen.push(...result.jobs.map((job) => job.id));
        hasMore = result.hasMore;
        page += 1;
        expect(page).toBeLessThan(10);
      }
      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
    });

    it("returns an empty page for a status with no jobs and for a page past the end", async () => {
      expect((await service.listMyJobs(dana, 1, "offered")).jobs).toEqual([]);
      expect((await service.listMyJobs(dana, 5, "applied")).jobs).toEqual([]);
    });
  });
});
