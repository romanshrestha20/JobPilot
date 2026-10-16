import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/log";
import { hashDescription } from "../domain/description-hash";
import type { GroundedRequirements } from "../domain/requirements";
import type { AnalysisRecord, AnalysisRepository } from "../repository";
import { type AnalysisQueue, createAnalysisService } from "./analysis-service";

const ALICE = { id: "user-alice" };
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const DESCRIPTION = "We need a Go developer.";

const REQUIREMENTS: GroundedRequirements = {
  schemaVersion: 1,
  dictionaryVersion: "skills-v1",
  requiredSkills: [{ key: "go", name: "Go", mapped: true, quote: "We need a Go developer." }],
  preferredSkills: [],
  minYearsExperience: null,
  languages: [],
  workMode: null,
  locations: [],
  droppedUngrounded: 0,
};

function record(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  const now = new Date("2026-10-16T10:00:00Z");
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: ALICE.id,
    jobId: JOB_ID,
    status: "pending",
    descriptionHash: null,
    promptVersion: null,
    provider: null,
    model: null,
    requirements: null,
    droppedUngrounded: 0,
    failureCode: null,
    attempts: 0,
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const completed = (overrides: Partial<AnalysisRecord> = {}) =>
  record({
    status: "completed",
    descriptionHash: hashDescription(DESCRIPTION),
    promptVersion: "extract-job-requirements.v1",
    provider: "demo",
    requirements: REQUIREMENTS,
    completedAt: new Date("2026-10-16T10:01:00Z"),
    ...overrides,
  });

function setup(overrides: { repository?: Partial<AnalysisRepository> } = {}) {
  const lines: string[] = [];
  const repository: AnalysisRepository = {
    createPendingForUser: vi.fn(async () => ({ kind: "created" as const, record: record() })),
    findForUser: vi.fn(async () => null),
    latestForJob: vi.fn(async () => ({ latest: null, latestCompleted: null })),
    claim: vi.fn(async () => null),
    complete: vi.fn(async () => null),
    fail: vi.fn(async () => null),
    ...overrides.repository,
  };
  // The fake job reader knows one job, owned by alice, like the real one scoped by user id.
  const findJob = vi.fn(async (userId: string, jobId: string) =>
    userId === ALICE.id && jobId === JOB_ID ? { description: DESCRIPTION } : null,
  );
  const enqueue = vi.fn<AnalysisQueue["enqueue"]>(async () => {});
  const logger = createLogger((_level, line) => lines.push(line));
  const service = createAnalysisService({
    repository,
    jobs: { findJob },
    queue: { enqueue },
    dailyLimit: 20,
    logger,
  });
  return { service, repository, findJob, enqueue, lines };
}

describe("requestAnalysis", () => {
  it("creates a pending run and queues it with ids only", async () => {
    const { service, repository, enqueue } = setup();
    const result = await service.requestAnalysis(ALICE, JOB_ID);

    expect(result).toMatchObject({ ok: true, created: true, analysis: { status: "pending" } });
    expect(repository.createPendingForUser).toHaveBeenCalledWith(ALICE.id, JOB_ID, {
      dailyLimit: 20,
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      analysisId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: ALICE.id,
    });
  });

  it("the owner always comes from the authenticated user, never from the input", async () => {
    const { service, findJob } = setup();
    await service.requestAnalysis({ id: "user-mallory" }, JOB_ID);
    expect(findJob).toHaveBeenCalledWith("user-mallory", JOB_ID);
  });

  it("treats someone else's job, a missing job and a malformed id alike", async () => {
    const { service, repository, enqueue } = setup();
    const foreign = await service.requestAnalysis({ id: "user-bob" }, JOB_ID);
    const missing = await service.requestAnalysis(ALICE, OTHER_JOB_ID);
    const malformed = await Promise.all(
      ["", "not-a-uuid", "../etc", null, undefined, 42, {}, [JOB_ID]].map((id) =>
        service.requestAnalysis(ALICE, id),
      ),
    );
    for (const result of [foreign, missing, ...malformed]) {
      expect(result).toEqual({ ok: false, reason: "not_found" });
    }
    expect(repository.createPendingForUser).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns the active run without queueing a second one", async () => {
    const active = record({ status: "processing", attempts: 1 });
    const { service, enqueue } = setup({
      repository: {
        createPendingForUser: vi.fn(async () => ({
          kind: "already_active" as const,
          record: active,
        })),
      },
    });
    const result = await service.requestAnalysis(ALICE, JOB_ID);
    expect(result).toMatchObject({ ok: true, created: false, analysis: { status: "processing" } });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reports the daily limit and queues nothing", async () => {
    const { service, enqueue, lines } = setup({
      repository: {
        createPendingForUser: vi.fn(async () => ({ kind: "quota_exceeded" as const })),
      },
    });
    expect(await service.requestAnalysis(ALICE, JOB_ID)).toEqual({
      ok: false,
      reason: "quota_exceeded",
      limit: 20,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("analysis.quota_exceeded");
  });

  it("marks the run failed at once when the queue is unreachable, without leaking the cause", async () => {
    const { service, repository, enqueue, lines } = setup();
    enqueue.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"));
    const result = await service.requestAnalysis(ALICE, JOB_ID);

    expect(result).toEqual({ ok: false, reason: "enqueue_failed" });
    expect(repository.fail).toHaveBeenCalledWith(
      ALICE.id,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "enqueue_failed",
    );
    const logged = lines.join("\n");
    expect(logged).toContain("analysis.enqueue_failed");
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("ECONNREFUSED");
  });

  it("answers not found when the job disappears between the read and the insert", async () => {
    const foreignKeyViolation = Object.assign(new Error("failed query"), {
      cause: { code: "23503" },
    });
    const { service, enqueue } = setup({
      repository: {
        createPendingForUser: vi.fn(async () => {
          throw foreignKeyViolation;
        }),
      },
    });
    expect(await service.requestAnalysis(ALICE, JOB_ID)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not swallow other database errors", async () => {
    const { service } = setup({
      repository: {
        createPendingForUser: vi.fn(async () => {
          throw Object.assign(new Error("boom"), { cause: { code: "57P01" } });
        }),
      },
    });
    await expect(service.requestAnalysis(ALICE, JOB_ID)).rejects.toThrow("boom");
  });

  it("never reads or sends candidate data: its dependencies cannot supply any", async () => {
    const { service, enqueue } = setup();
    await service.requestAnalysis(ALICE, JOB_ID);
    expect(Object.keys(enqueue.mock.calls[0][0]).sort()).toEqual(["analysisId", "userId"]);
  });
});

describe("getMyAnalysisView", () => {
  it("is null for someone else's job, a missing job and a malformed id", async () => {
    const { service, repository } = setup();
    expect(await service.getMyAnalysisView({ id: "user-bob" }, JOB_ID)).toBeNull();
    expect(await service.getMyAnalysisView(ALICE, OTHER_JOB_ID)).toBeNull();
    expect(await service.getMyAnalysisView(ALICE, "nope")).toBeNull();
    expect(repository.latestForJob).not.toHaveBeenCalled();
  });

  it("an unanalysed job has no runs and is not stale", async () => {
    const { service } = setup();
    expect(await service.getMyAnalysisView(ALICE, JOB_ID)).toEqual({
      latest: null,
      current: null,
      stale: false,
    });
  });

  it("shows the completed result and keeps it current while a re-run is pending", async () => {
    const done = completed({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const rerun = record({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    const { service } = setup({
      repository: { latestForJob: vi.fn(async () => ({ latest: rerun, latestCompleted: done })) },
    });
    const view = await service.getMyAnalysisView(ALICE, JOB_ID);
    expect(view?.latest?.status).toBe("pending");
    expect(view?.current).toMatchObject({
      status: "completed",
      requirements: REQUIREMENTS,
      demo: true,
    });
    expect(view?.stale).toBe(false);
  });

  it("marks a result out of date when the description changed since the run", async () => {
    const done = completed({ descriptionHash: hashDescription("An older description.") });
    const { service } = setup({
      repository: { latestForJob: vi.fn(async () => ({ latest: done, latestCompleted: done })) },
    });
    expect((await service.getMyAnalysisView(ALICE, JOB_ID))?.stale).toBe(true);
  });

  it("a whitespace-only change to the description is not out of date", async () => {
    const done = completed({ descriptionHash: hashDescription("We need  a Go\n developer.") });
    const { service } = setup({
      repository: { latestForJob: vi.fn(async () => ({ latest: done, latestCompleted: done })) },
    });
    expect((await service.getMyAnalysisView(ALICE, JOB_ID))?.stale).toBe(false);
  });

  it("a failed run offers Retry, except for permanent causes", async () => {
    const view = async (failureCode: AnalysisRecord["failureCode"]) => {
      const failed = record({ status: "failed", failureCode });
      const { service } = setup({
        repository: {
          latestForJob: vi.fn(async () => ({ latest: failed, latestCompleted: null })),
        },
      });
      return (await service.getMyAnalysisView(ALICE, JOB_ID))?.latest;
    };
    for (const code of [
      "provider_unavailable",
      "model_unavailable",
      "timeout",
      "invalid_output",
      "enqueue_failed",
    ]) {
      expect(await view(code), code).toMatchObject({ status: "failed", canRetry: true });
    }
    for (const code of ["too_long", "job_missing"]) {
      expect(await view(code), code).toMatchObject({ status: "failed", canRetry: false });
    }
  });

  it("refuses a stored result that does not match the schema instead of showing it", async () => {
    const damaged = completed({ requirements: { schemaVersion: 1, requiredSkills: "everything" } });
    const { service, lines } = setup({
      repository: {
        latestForJob: vi.fn(async () => ({ latest: damaged, latestCompleted: damaged })),
      },
    });
    const view = await service.getMyAnalysisView(ALICE, JOB_ID);
    expect(view?.current).toMatchObject({
      status: "failed",
      failureCode: "invalid_output",
      requirements: null,
      canRetry: true,
    });
    expect(lines.join("\n")).toContain("analysis.stored_result_invalid");
  });

  it("refuses a stored result with an unexpected extra field", async () => {
    const damaged = completed({ requirements: { ...REQUIREMENTS, isAdmin: true } });
    const { service } = setup({
      repository: {
        latestForJob: vi.fn(async () => ({ latest: damaged, latestCompleted: damaged })),
      },
    });
    expect((await service.getMyAnalysisView(ALICE, JOB_ID))?.current?.requirements).toBeNull();
  });

  it("never exposes the owner, the description hash or the model", async () => {
    const done = completed({ model: "qwen2.5:7b-instruct", provider: "ollama" });
    const { service } = setup({
      repository: { latestForJob: vi.fn(async () => ({ latest: done, latestCompleted: done })) },
    });
    const dto = (await service.getMyAnalysisView(ALICE, JOB_ID))?.current;
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain(ALICE.id);
    expect(serialized).not.toContain(done.descriptionHash!);
    expect(serialized).not.toContain("qwen");
    expect(dto).toMatchObject({ provider: "ollama", demo: false });
  });
});
