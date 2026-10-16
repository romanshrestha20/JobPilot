import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/log";
import {
  ABANDONED_PENDING_SECONDS,
  STALE_PENDING_SECONDS,
  staleProcessingSeconds,
} from "../domain/processing-policy";
import { createMemoryRepository } from "../memory-repository.testkit";
import type { AnalysisRecord } from "../repository";
import { createStaleRecovery } from "./recover-stale";

const NOW = new Date("2026-10-16T12:00:00Z");
const LLM_TIMEOUT_MS = 60_000;
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

function row(id: string, overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id,
    userId: "user-alice",
    jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

function setup(rows: AnalysisRecord[], enqueue = vi.fn(async () => {})) {
  const lines: string[] = [];
  const memory = createMemoryRepository(rows, () => NOW);
  const recovery = createStaleRecovery({
    repository: memory.repository,
    queue: { enqueue },
    llmTimeoutMs: LLM_TIMEOUT_MS,
    now: () => NOW,
    logger: createLogger((_level, line) => lines.push(line)),
  });
  return { ...memory, enqueue, recover: () => recovery.recover(), lines };
}

describe("stale-pending recovery", () => {
  it("re-enqueues a pending run whose queue job was lost", async () => {
    const t = setup([row(A, { updatedAt: ago(STALE_PENDING_SECONDS + 5) })]);
    expect(await t.recover()).toEqual({ reenqueued: 1, failed: 0, skipped: 0 });
    expect(t.enqueue).toHaveBeenCalledWith({ analysisId: A, userId: "user-alice" });
    expect(t.rows.get(A)!.status).toBe("pending");
  });

  it("leaves a fresh pending run alone", async () => {
    const t = setup([row(A, { updatedAt: ago(STALE_PENDING_SECONDS - 30) })]);
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 0, skipped: 0 });
    expect(t.enqueue).not.toHaveBeenCalled();
  });

  it("fails a pending run that stayed pending far too long (enqueue_failed), retryable by the user", async () => {
    const t = setup([row(A, { updatedAt: ago(ABANDONED_PENDING_SECONDS + 5) })]);
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 1, skipped: 0 });
    expect(t.rows.get(A)).toMatchObject({ status: "failed", failureCode: "enqueue_failed" });
    expect(t.enqueue).not.toHaveBeenCalled();
  });

  it("when the queue is down the run stays pending and the pass reports it", async () => {
    const enqueue = vi.fn(async () => {
      throw new Error("connection string leaked here");
    });
    const t = setup([row(A, { updatedAt: ago(STALE_PENDING_SECONDS + 5) })], enqueue);
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 0, skipped: 1 });
    expect(t.rows.get(A)!.status).toBe("pending");
    expect(t.lines.join("\n")).not.toContain("leaked");
  });
});

describe("stale-processing recovery", () => {
  const stale = (seconds = 10) => ago(staleProcessingSeconds(LLM_TIMEOUT_MS) + seconds);

  it("re-enqueues a processing run with attempts left whose worker died", async () => {
    const t = setup([row(A, { status: "processing", attempts: 1, updatedAt: stale() })]);
    expect(await t.recover()).toEqual({ reenqueued: 1, failed: 0, skipped: 0 });
    expect(t.rows.get(A)!.status).toBe("processing");
  });

  it("fails a stale processing run that used every attempt", async () => {
    const t = setup([row(A, { status: "processing", attempts: 3, updatedAt: stale() })]);
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 1, skipped: 0 });
    expect(t.rows.get(A)).toMatchObject({ status: "failed", failureCode: "retries_exhausted" });
    expect(t.enqueue).not.toHaveBeenCalled();
  });

  it("leaves a processing run alone while its attempt or retry wait could still be running", async () => {
    const t = setup([
      row(A, {
        status: "processing",
        attempts: 1,
        updatedAt: ago(staleProcessingSeconds(LLM_TIMEOUT_MS) - 20),
      }),
    ]);
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 0, skipped: 0 });
  });

  it("never touches finished runs", async () => {
    const old = ago(86_400);
    const t = setup([
      row(A, { status: "completed", updatedAt: old }),
      row(B, { status: "failed", failureCode: "timeout", updatedAt: old }),
    ]);
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 0, skipped: 0 });
    expect(t.rows.get(A)!.status).toBe("completed");
    expect(t.rows.get(B)!.status).toBe("failed");
  });

  it("does not fail a run that was claimed again after it was listed", async () => {
    const t = setup([row(A, { status: "processing", attempts: 3, updatedAt: stale() })]);
    const realList = t.repository.listStale;
    // Between the listing and the decision, a delivery claims the run (its updatedAt moves on).
    t.repository.listStale = async (cutoffs) => {
      const listed = await realList(cutoffs);
      t.rows.get(A)!.updatedAt = NOW;
      return listed;
    };
    expect(await t.recover()).toEqual({ reenqueued: 0, failed: 0, skipped: 1 });
    expect(t.rows.get(A)!.status).toBe("processing");
  });

  it("handles runs of several users one by one and is bounded by the sweep limit", async () => {
    const t = setup([
      row(A, { updatedAt: ago(STALE_PENDING_SECONDS + 10) }),
      row(B, { userId: "user-bob", updatedAt: ago(STALE_PENDING_SECONDS + 20) }),
      row(C, { status: "processing", attempts: 2, updatedAt: stale() }),
    ]);
    expect(await t.recover()).toEqual({ reenqueued: 3, failed: 0, skipped: 0 });
    expect(t.enqueue).toHaveBeenCalledWith({ analysisId: B, userId: "user-bob" });
  });
});
