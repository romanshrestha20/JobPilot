import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/log";
import type { AiErrorCode } from "@/lib/ai/errors";
import { hashDescription } from "../domain/description-hash";
import type { GroundedRequirements } from "../domain/requirements";
import { createMemoryRepository } from "../memory-repository.testkit";
import type { AnalysisRecord } from "../repository";
import { createAnalysisProcessor } from "./process-analysis";
import type { ExtractionResult } from "./extract";

const ALICE = "user-alice";
const BOB = "user-bob";
const ANALYSIS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DESCRIPTION = "We need Go and PostgreSQL. SECRET-JOB-TEXT-MARKER";
const NOW = new Date("2026-10-16T10:00:00Z");

const REQUIREMENTS: GroundedRequirements = {
  schemaVersion: 1,
  dictionaryVersion: "skills-v1",
  requiredSkills: [{ key: "go", name: "Go", mapped: true, quote: "We need Go" }],
  preferredSkills: [],
  minYearsExperience: null,
  languages: [],
  workMode: null,
  locations: [],
  droppedUngrounded: 0,
};

const META = {
  provider: "ollama" as const,
  model: "qwen",
  latencyMs: 12,
  promptVersion: "extract-job-requirements.v1",
  demo: false,
};
const OK: ExtractionResult = { ok: true, requirements: REQUIREMENTS, meta: META };
const FAIL = (code: AiErrorCode | "empty_input"): ExtractionResult => ({ ok: false, code });

function row(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: ANALYSIS_ID,
    userId: ALICE,
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
    queuedAt: NOW,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setup(
  options: {
    clock?: { now: Date };
    rows?: AnalysisRecord[];
    extract?: (text: string) => Promise<ExtractionResult>;
    job?: { description: string } | null;
  } = {},
) {
  const lines: string[] = [];
  const logger = createLogger((_level, line) => lines.push(line));
  const clock = options.clock ?? { now: NOW };
  const memory = createMemoryRepository(options.rows ?? [row()], () => clock.now);
  const extract = vi.fn(options.extract ?? (async () => OK));
  // Like the real reader: only the owner of the job gets it.
  const findJob = vi.fn(async (userId: string, jobId: string) =>
    userId === ALICE && jobId === JOB_ID
      ? options.job === undefined
        ? { description: DESCRIPTION }
        : options.job
      : null,
  );
  const processor = createAnalysisProcessor({
    repository: memory.repository,
    jobs: { findJob },
    extract,
    llmTimeoutMs: 60_000,
    now: () => clock.now,
    logger,
  });
  const run = (payload: unknown = { analysisId: ANALYSIS_ID, userId: ALICE }) =>
    processor.process(payload);
  return { ...memory, extract, findJob, run, lines };
}

describe("processing a run", () => {
  it("claims, extracts from the job text only, and saves the validated result", async () => {
    const t = setup();
    expect(await t.run()).toEqual({ kind: "completed" });

    expect(t.extract).toHaveBeenCalledTimes(1);
    // The model port receives exactly the job description: no profile, no other argument.
    expect(t.extract.mock.calls[0]).toEqual([DESCRIPTION]);
    const saved = t.rows.get(ANALYSIS_ID)!;
    expect(saved.status).toBe("completed");
    expect(saved.attempts).toBe(1);
    expect(saved.descriptionHash).toBe(hashDescription(DESCRIPTION));
    expect(saved.provider).toBe("ollama");
    expect(saved.requirements).toEqual(REQUIREMENTS);
  });

  it("never writes the job text into the logs", async () => {
    const t = setup();
    await t.run();
    await setup({ extract: async () => FAIL("provider_unavailable") }).run();
    expect(t.lines.join("\n")).not.toContain("SECRET-JOB-TEXT-MARKER");
    expect(t.lines.length).toBeGreaterThan(0);
  });
});

describe("failures fail closed", () => {
  it.each(["provider_unavailable", "model_unavailable", "timeout", "invalid_output"] as const)(
    "%s with attempts left asks for a retry and saves nothing",
    async (code) => {
      const t = setup({ extract: async () => FAIL(code) });
      expect(await t.run()).toEqual({ kind: "retry", code });
      const stored = t.rows.get(ANALYSIS_ID)!;
      // Handed back to pending (attempt counted) so the queue's next delivery can claim it.
      expect(stored).toMatchObject({ status: "pending", attempts: 1 });
      expect(stored.requirements).toBeNull();
      expect(t.calls.complete).toBe(0);
    },
  );

  it("an unavailable model ends the run failed after the last attempt, never completed", async () => {
    const t = setup({ extract: async () => FAIL("model_unavailable") });
    expect(await t.run()).toMatchObject({ kind: "retry" });
    expect(await t.run()).toMatchObject({ kind: "retry" });
    expect(await t.run()).toEqual({ kind: "failed", code: "model_unavailable" });
    const stored = t.rows.get(ANALYSIS_ID)!;
    expect(stored).toMatchObject({
      status: "failed",
      failureCode: "model_unavailable",
      attempts: 3,
    });
    expect(stored.requirements).toBeNull();
    // The queue's late fourth delivery changes nothing.
    expect(await t.run()).toEqual({ kind: "skipped", reason: "not_claimable" });
    expect(t.extract).toHaveBeenCalledTimes(3);
  });

  it("an incomplete or invalid model answer (invalid_output) is retried, then failed", async () => {
    const t = setup({ extract: async () => FAIL("invalid_output") });
    await t.run();
    await t.run();
    expect(await t.run()).toEqual({ kind: "failed", code: "invalid_output" });
    expect(t.rows.get(ANALYSIS_ID)!.requirements).toBeNull();
  });

  it("a result that does not match the stored schema is refused, not saved", async () => {
    const bad = { ...REQUIREMENTS, extra: "x" } as unknown as GroundedRequirements;
    const t = setup({ extract: async () => ({ ok: true, requirements: bad, meta: META }) });
    expect(await t.run()).toEqual({ kind: "retry", code: "invalid_output" });
    expect(t.rows.get(ANALYSIS_ID)!.requirements).toBeNull();
    expect(t.calls.complete).toBe(0);
  });

  it("too_long is permanent: failed at once, no retry", async () => {
    const t = setup({ extract: async () => FAIL("too_long") });
    expect(await t.run()).toEqual({ kind: "failed", code: "too_long" });
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "failed", failureCode: "too_long" });
  });

  it("a description with no usable text is a permanent empty_input, not job_missing", async () => {
    const t = setup({ extract: async () => FAIL("empty_input") });
    expect(await t.run()).toEqual({ kind: "failed", code: "empty_input" });
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "failed", failureCode: "empty_input" });
    expect(t.calls.release).toBe(0);
  });

  it("a deleted job fails the run without calling the model", async () => {
    const t = setup({ job: null });
    expect(await t.run()).toEqual({ kind: "failed", code: "job_missing" });
    expect(t.extract).not.toHaveBeenCalled();
  });

  it("an unexpected error is rethrown and leaves the run processing, not completed", async () => {
    const t = setup({
      extract: async () => {
        throw new Error("boom");
      },
    });
    await expect(t.run()).rejects.toThrow("boom");
    expect(t.rows.get(ANALYSIS_ID)!.status).toBe("processing");
    expect(t.calls.complete).toBe(0);
  });

  it("a redelivery past the attempt limit fails the run without calling the model", async () => {
    const idle = new Date(NOW.getTime() - 3_600_000); // its worker is long gone
    const t = setup({ rows: [row({ status: "processing", attempts: 3, updatedAt: idle })] });
    expect(await t.run()).toEqual({ kind: "failed", code: "retries_exhausted" });
    expect(t.extract).not.toHaveBeenCalled();
  });
});

describe("duplicate and late deliveries", () => {
  it("a second delivery of a completed run does nothing", async () => {
    const t = setup();
    await t.run();
    const before = { ...t.rows.get(ANALYSIS_ID)! };
    expect(await t.run()).toEqual({ kind: "skipped", reason: "not_claimable" });
    expect(t.extract).toHaveBeenCalledTimes(1);
    expect(t.rows.get(ANALYSIS_ID)).toEqual(before);
  });

  it("a late delivery cannot reopen a failed run", async () => {
    const t = setup({ rows: [row({ status: "failed", failureCode: "timeout", attempts: 3 })] });
    expect(await t.run()).toEqual({ kind: "skipped", reason: "not_claimable" });
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "failed", failureCode: "timeout" });
    expect(t.extract).not.toHaveBeenCalled();
  });

  it("two simultaneous deliveries produce exactly one completed result", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.run(), t.run()]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["completed", "skipped"]);
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "completed" });
  });

  it("a duplicate delivery during a live attempt is refused: no second model call, no extra attempt", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = setup({
      extract: async () => {
        await gate;
        return OK;
      },
    });
    const first = t.run();
    await vi.waitFor(() => expect(t.extract).toHaveBeenCalledTimes(1));
    expect(await t.run()).toEqual({ kind: "skipped", reason: "not_claimable" });
    expect(t.extract).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toEqual({ kind: "completed" });
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "completed", attempts: 1 });
  });

  it("a worker presumed dead is replaced; if it wakes up, it cannot overwrite the result", async () => {
    const clock = { now: NOW };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const t = setup({
      clock,
      extract: async () => {
        calls += 1;
        if (calls === 1) await gate; // the first delivery stalls inside the model call
        return OK;
      },
    });
    const slow = t.run();
    await vi.waitFor(() => expect(calls).toBe(1));
    clock.now = new Date(NOW.getTime() + 10 * 60_000); // far past one model call
    expect(await t.run()).toEqual({ kind: "completed" });
    release();
    expect(await slow).toEqual({ kind: "skipped", reason: "lost_race" });
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "completed", attempts: 2 });
  });

  it("never moves a completed run back to processing or pending", async () => {
    const t = setup();
    await t.run();
    for (let i = 0; i < 3; i += 1) await t.run();
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "completed", attempts: 1 });
  });
});

describe("ownership and payload", () => {
  it("a payload naming another user's id cannot reach the run", async () => {
    const t = setup();
    expect(await t.run({ analysisId: ANALYSIS_ID, userId: BOB })).toEqual({
      kind: "skipped",
      reason: "not_found",
    });
    expect(t.rows.get(ANALYSIS_ID)).toMatchObject({ status: "pending", attempts: 0 });
    expect(t.calls.claim).toBe(0);
    expect(t.extract).not.toHaveBeenCalled();
  });

  it("a run whose job is not the payload user's cannot be read for it", async () => {
    // The row belongs to bob but points at alice's job id: the job read is scoped to bob.
    const t = setup({ rows: [row({ userId: BOB })] });
    expect(await t.run({ analysisId: ANALYSIS_ID, userId: BOB })).toEqual({
      kind: "failed",
      code: "job_missing",
    });
    expect(t.extract).not.toHaveBeenCalled();
  });

  it.each([
    ["not an object", "x"],
    ["null", null],
    ["missing user", { analysisId: ANALYSIS_ID }],
    ["bad id", { analysisId: "nope", userId: ALICE }],
    ["extra field", { analysisId: ANALYSIS_ID, userId: ALICE, description: "injected" }],
  ])("drops an invalid payload (%s) without touching anything", async (_label, payload) => {
    const t = setup();
    expect(await t.run(payload)).toEqual({ kind: "skipped", reason: "invalid_payload" });
    expect(t.calls.claim).toBe(0);
    expect(t.findJob).not.toHaveBeenCalled();
  });

  it("an unknown run id is skipped", async () => {
    const t = setup();
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(await t.run({ analysisId: other, userId: ALICE })).toEqual({
      kind: "skipped",
      reason: "not_found",
    });
  });
});
