import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/log";
import { RetryDelivery, createAnalysisWorker, type WorkerQueuePort } from "./analysis-worker";

const SETTINGS = {
  policy: "short" as const,
  retryLimit: 2,
  retryDelaySeconds: 30,
  retryDelayMaxSeconds: 300,
  expireInSeconds: 90,
};

function setup(
  process: (payload: unknown) => Promise<{ kind: string }>,
  recover = async () => ({}),
) {
  let handler: ((payload: unknown, ctx: never) => Promise<void>) | undefined;
  const queue = {
    start: vi.fn(async () => {}),
    ensureQueue: vi.fn(async () => {}),
    work: vi.fn(async (_name, _options, h) => {
      handler = h;
    }),
    stop: vi.fn(async () => {}),
  } satisfies WorkerQueuePort;
  const lines: string[] = [];
  const recovery = { recover: vi.fn(recover) };
  const worker = createAnalysisWorker({
    queue,
    queueName: "job-analysis.extract",
    queueSettings: SETTINGS,
    processor: { process: vi.fn(process) },
    recovery,
    logger: createLogger((_l, line) => lines.push(line)),
    recoveryIntervalMs: 1_000,
  });
  return { worker, queue, recovery, lines, deliver: (p: unknown) => handler!(p, {} as never) };
}

describe("analysis worker", () => {
  it("creates the queue with the retry policy, registers the handler, and sweeps on start", async () => {
    const t = setup(async () => ({ kind: "completed" }));
    await t.worker.start();
    expect(t.queue.ensureQueue).toHaveBeenCalledWith("job-analysis.extract", SETTINGS);
    expect(t.queue.work).toHaveBeenCalledTimes(1);
    expect(t.recovery.recover).toHaveBeenCalledTimes(1);
    await t.worker.stop();
  });

  it("finishes the queue job for completed, failed and skipped outcomes", async () => {
    for (const kind of ["completed", "failed", "skipped"]) {
      const t = setup(async () => ({ kind }));
      await t.worker.start();
      await expect(t.deliver({})).resolves.toBeUndefined();
      await t.worker.stop();
    }
  });

  it("throws on a retry outcome so the queue delivers the job again", async () => {
    const t = setup(async () => ({ kind: "retry" }));
    await t.worker.start();
    await expect(t.deliver({})).rejects.toBeInstanceOf(RetryDelivery);
    await t.worker.stop();
  });

  it("lets an unexpected error reach the queue (which retries) instead of swallowing it", async () => {
    const t = setup(async () => {
      throw new Error("db down");
    });
    await t.worker.start();
    await expect(t.deliver({})).rejects.toThrow("db down");
    await t.worker.stop();
  });

  it("a failing recovery pass is logged by code and does not stop the worker", async () => {
    const t = setup(
      async () => ({ kind: "completed" }),
      async () => {
        throw new Error("secret detail");
      },
    );
    await t.worker.start();
    await t.worker.sweep();
    expect(t.lines.join("\n")).toContain("analysis.recovery_failed");
    expect(t.lines.join("\n")).not.toContain("secret detail");
    await t.worker.stop();
  });

  it("runs recovery on a timer, never overlapping, and stops the timer on shutdown", async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      let calls = 0;
      const t = setup(
        async () => ({ kind: "completed" }),
        () => {
          calls += 1;
          return calls === 2 ? new Promise((r) => (release = () => r({}))) : Promise.resolve({});
        },
      );
      await t.worker.start(); // call 1
      await vi.advanceTimersByTimeAsync(1_000); // call 2 starts and stays in flight
      await vi.advanceTimersByTimeAsync(3_000); // ticks while in flight are skipped
      expect(t.recovery.recover).toHaveBeenCalledTimes(2);
      release();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(t.recovery.recover).toHaveBeenCalledTimes(3);
      await t.worker.stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(t.recovery.recover).toHaveBeenCalledTimes(3);
      expect(t.queue.stop).toHaveBeenCalledWith(30_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
