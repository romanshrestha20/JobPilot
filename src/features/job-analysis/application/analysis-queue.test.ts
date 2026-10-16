import { describe, expect, it, vi } from "vitest";
import { ANALYSIS_QUEUE_NAME, analysisPayloadSchema, createAnalysisQueue } from "./analysis-queue";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("analysis queue adapter", () => {
  it("sends ids only, with the analysis id as the singleton key", async () => {
    const send = vi.fn(async () => {});
    await createAnalysisQueue({ send }).enqueue({ analysisId: ID, userId: "user-1" });
    expect(send).toHaveBeenCalledWith(
      ANALYSIS_QUEUE_NAME,
      { analysisId: ID, userId: "user-1" },
      { singletonKey: ID },
    );
  });

  it("strips nothing silently: extra fields (such as job text) are rejected, not sent", async () => {
    const send = vi.fn(async () => {});
    const queue = createAnalysisQueue({ send });
    await expect(
      queue.enqueue({ analysisId: ID, userId: "u", description: "text" } as never),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("propagates a failed send so the caller can mark the run enqueue_failed", async () => {
    const queue = createAnalysisQueue({
      send: async () => {
        throw new Error("down");
      },
    });
    await expect(queue.enqueue({ analysisId: ID, userId: "u" })).rejects.toThrow("down");
  });

  it("the payload schema is strict", () => {
    expect(analysisPayloadSchema.safeParse({ analysisId: ID, userId: "u" }).success).toBe(true);
    expect(analysisPayloadSchema.safeParse({ analysisId: ID, userId: "u", x: 1 }).success).toBe(
      false,
    );
  });
});
