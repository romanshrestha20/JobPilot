import { describe, expect, it, vi } from "vitest";
import type { JobRecord, JobRepository } from "./repository";
import { JOBS_PAGE_SIZE, createJobService } from "./service";

const ID = "11111111-1111-4111-8111-111111111111";

const record = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: ID,
  userId: "user-alice",
  title: "Engineer",
  company: "Acme",
  location: null,
  sourceUrl: null,
  description: "Do things.",
  status: "saved",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

function fakeRepository(stored: JobRecord | null = record()) {
  return {
    create: vi.fn(async (userId: string, data: object) => record({ userId, ...data })),
    listForUser: vi.fn<JobRepository["listForUser"]>(async () => []),
    findForUser: vi.fn(async () => stored),
    updateForUser: vi.fn<JobRepository["updateForUser"]>(async (userId, _id, data) =>
      record({ userId, ...data, updatedAt: new Date("2026-02-01T00:00:00Z") }),
    ),
    updateStatusForUser: vi.fn<JobRepository["updateStatusForUser"]>(async (userId, _id, status) =>
      record({ userId, status, updatedAt: new Date("2026-02-01T00:00:00Z") }),
    ),
    deleteForUser: vi.fn(async () => true),
  } satisfies JobRepository;
}

const alice = { id: "user-alice" };
const input = { title: " Engineer ", company: "Acme", description: "Do things." };

describe("job service", () => {
  it("creates a job for the authenticated user and never exposes userId", async () => {
    const repo = fakeRepository();
    const result = await createJobService(repo).createMyJob(alice, input);

    expect(repo.create).toHaveBeenCalledWith(
      "user-alice",
      expect.objectContaining({ title: "Engineer", location: null, sourceUrl: null }),
    );
    expect(result).toMatchObject({ ok: true, job: { title: "Engineer" } });
    expect(result.ok && result.job).not.toHaveProperty("userId");
  });

  it("does not touch the repository when validation fails", async () => {
    const repo = fakeRepository();
    const result = await createJobService(repo).createMyJob(alice, { ...input, title: " " });

    expect(result.ok).toBe(false);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied owner", async () => {
    const repo = fakeRepository();
    const result = await createJobService(repo).createMyJob(alice, {
      ...input,
      userId: "user-bob",
    });

    expect(result.ok).toBe(false);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("lists with a bounded page and reports whether more exist", async () => {
    const repo = fakeRepository();
    const rows = Array.from({ length: JOBS_PAGE_SIZE + 1 }, (_, i) => ({
      id: String(i),
      title: "t",
      company: "c",
      location: null,
      sourceUrl: null,
      status: "saved" as const,
      createdAt: new Date(),
    }));
    repo.listForUser.mockResolvedValueOnce(rows);

    const page = await createJobService(repo).listMyJobs(alice, 3);

    expect(repo.listForUser).toHaveBeenCalledWith("user-alice", {
      limit: JOBS_PAGE_SIZE + 1,
      offset: 2 * JOBS_PAGE_SIZE,
    });
    expect(page.jobs).toHaveLength(JOBS_PAGE_SIZE);
    expect(page).toMatchObject({ page: 3, hasMore: true });
  });

  it.each([0, -1, 1.5, NaN])("treats page %s as page 1", async (bad) => {
    const repo = fakeRepository();
    await createJobService(repo).listMyJobs(alice, bad);
    expect(repo.listForUser).toHaveBeenCalledWith(
      "user-alice",
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("reads a job by id scoped to the user, and returns null when not found", async () => {
    const repo = fakeRepository(null);
    await expect(createJobService(repo).getMyJob(alice, ID)).resolves.toBeNull();
    expect(repo.findForUser).toHaveBeenCalledWith("user-alice", ID);
  });

  it("answers a malformed id without querying", async () => {
    const repo = fakeRepository();
    const service = createJobService(repo);
    await expect(service.getMyJob(alice, "not-a-uuid")).resolves.toBeNull();
    await expect(service.deleteMyJob(alice, "' or 1=1 --")).resolves.toBe(false);
    expect(repo.findForUser).not.toHaveBeenCalled();
    expect(repo.deleteForUser).not.toHaveBeenCalled();
  });

  it("deletes scoped to the user", async () => {
    const repo = fakeRepository();
    await expect(createJobService(repo).deleteMyJob(alice, ID)).resolves.toBe(true);
    expect(repo.deleteForUser).toHaveBeenCalledWith("user-alice", ID);
  });
});

describe("job service: update", () => {
  const edit = { title: " New title ", company: "New Co", description: "New text." };

  it("updates through the user-scoped repository call and returns the new values", async () => {
    const repo = fakeRepository();
    const result = await createJobService(repo).updateMyJob(alice, ID, {
      ...edit,
      location: "Oulu",
    });

    expect(repo.updateForUser).toHaveBeenCalledWith(
      "user-alice",
      ID,
      expect.objectContaining({ title: "New title", location: "Oulu", sourceUrl: null }),
    );
    expect(result).toMatchObject({ ok: true, job: { title: "New title", company: "New Co" } });
    expect(result.ok && result.job).not.toHaveProperty("userId");
    expect(result.ok && result.job.updatedAt.getTime()).toBeGreaterThan(
      result.ok ? result.job.createdAt.getTime() : 0,
    );
  });

  it("does not update when validation fails, and reports the field errors to the owner", async () => {
    const repo = fakeRepository();
    const result = await createJobService(repo).updateMyJob(alice, ID, { ...edit, title: "  \n" });

    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(repo.updateForUser).not.toHaveBeenCalled();
  });

  it.each([
    { title: " " },
    { company: "" },
    { description: "\n\t " },
    { sourceUrl: "javascript:alert(1)" },
    { title: "x".repeat(201) },
  ])("rejects invalid input %j", async (bad) => {
    const repo = fakeRepository();
    const result = await createJobService(repo).updateMyJob(alice, ID, { ...edit, ...bad });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(repo.updateForUser).not.toHaveBeenCalled();
  });

  it.each(["userId", "id", "createdAt", "updatedAt", "extra"])(
    "rejects a forged %s field without updating",
    async (key) => {
      const repo = fakeRepository();
      const result = await createJobService(repo).updateMyJob(alice, ID, { ...edit, [key]: "x" });
      expect(result.ok).toBe(false);
      expect(repo.updateForUser).not.toHaveBeenCalled();
    },
  );

  it("treats someone else's or a missing job as not found", async () => {
    const repo = fakeRepository();
    repo.updateForUser.mockResolvedValueOnce(null);
    await expect(createJobService(repo).updateMyJob(alice, ID, edit)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("answers a non-owner with not_found even for invalid input", async () => {
    const repo = fakeRepository(null);
    const result = await createJobService(repo).updateMyJob(alice, ID, { title: "" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("answers a malformed id without touching the repository", async () => {
    const repo = fakeRepository();
    for (const id of ["not-a-uuid", "", "' or 1=1 --", "../etc"]) {
      await expect(createJobService(repo).updateMyJob(alice, id, edit)).resolves.toEqual({
        ok: false,
        reason: "not_found",
      });
    }
    expect(repo.updateForUser).not.toHaveBeenCalled();
    expect(repo.findForUser).not.toHaveBeenCalled();
  });
});

describe("job service: status", () => {
  it.each(["saved", "applied", "interviewing", "offered", "rejected", "withdrawn"] as const)(
    "sets %s through the user-scoped repository call",
    async (status) => {
      const repo = fakeRepository();
      const result = await createJobService(repo).updateMyJobStatus(alice, ID, { status });

      expect(repo.updateStatusForUser).toHaveBeenCalledWith("user-alice", ID, status);
      expect(result).toMatchObject({ ok: true, job: { id: ID, status } });
      expect(result.ok && result.job).not.toHaveProperty("userId");
    },
  );

  it.each([{ status: "hired" }, { status: "" }, {}, { status: null }, { status: ["applied"] }])(
    "rejects invalid input %j without updating, telling the owner how to fix it",
    async (input) => {
      const repo = fakeRepository();
      const result = await createJobService(repo).updateMyJobStatus(alice, ID, input);

      expect(result).toMatchObject({ ok: false, reason: "invalid" });
      expect(repo.updateStatusForUser).not.toHaveBeenCalled();
    },
  );

  it.each(["userId", "id", "createdAt", "title", "extra"])(
    "rejects a forged %s field without updating",
    async (key) => {
      const repo = fakeRepository();
      const result = await createJobService(repo).updateMyJobStatus(alice, ID, {
        status: "applied",
        [key]: "x",
      });
      expect(result.ok).toBe(false);
      expect(repo.updateStatusForUser).not.toHaveBeenCalled();
    },
  );

  it("treats someone else's or a missing job as not found", async () => {
    const repo = fakeRepository();
    repo.updateStatusForUser.mockResolvedValueOnce(null);
    await expect(
      createJobService(repo).updateMyJobStatus(alice, ID, { status: "applied" }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("answers a non-owner with not_found even for an invalid status", async () => {
    const repo = fakeRepository(null);
    await expect(
      createJobService(repo).updateMyJobStatus(alice, ID, { status: "hired" }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("answers a malformed id without touching the repository", async () => {
    const repo = fakeRepository();
    for (const id of ["not-a-uuid", "", "' or 1=1 --"]) {
      await expect(
        createJobService(repo).updateMyJobStatus(alice, id, { status: "applied" }),
      ).resolves.toEqual({ ok: false, reason: "not_found" });
    }
    expect(repo.updateStatusForUser).not.toHaveBeenCalled();
    expect(repo.findForUser).not.toHaveBeenCalled();
  });

  it("does not send a status when creating, so the database default (saved) applies", async () => {
    const repo = fakeRepository();
    await createJobService(repo).createMyJob(alice, input);
    expect(repo.create.mock.calls[0][1]).not.toHaveProperty("status");
  });

  it("rejects a forged status on create", async () => {
    const repo = fakeRepository();
    const result = await createJobService(repo).createMyJob(alice, { ...input, status: "offered" });
    expect(result.ok).toBe(false);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("passes the status filter to the repository and reports it back", async () => {
    const repo = fakeRepository();
    const page = await createJobService(repo).listMyJobs(alice, 2, "applied");

    expect(repo.listForUser).toHaveBeenCalledWith("user-alice", {
      limit: JOBS_PAGE_SIZE + 1,
      offset: JOBS_PAGE_SIZE,
      status: "applied",
    });
    expect(page).toMatchObject({ page: 2, status: "applied" });
  });

  it("lists every status when no filter is given", async () => {
    const repo = fakeRepository();
    await createJobService(repo).listMyJobs(alice, 1);
    expect(repo.listForUser.mock.calls[0][1].status).toBeUndefined();
  });
});
