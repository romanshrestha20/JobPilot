import { describe, expect, it, vi } from "vitest";
import type { JobRecord, JobRepository, JobSummaryRecord } from "./repository";
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
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

function fakeRepository(stored: JobRecord | null = record()) {
  return {
    create: vi.fn(async (userId: string, data: object) => record({ userId, ...data })),
    listForUser: vi.fn(async (): Promise<JobSummaryRecord[]> => []),
    findForUser: vi.fn(async () => stored),
    updateForUser: vi.fn<JobRepository["updateForUser"]>(async (userId, _id, data) =>
      record({ userId, ...data, updatedAt: new Date("2026-02-01T00:00:00Z") }),
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
