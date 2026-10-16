import { z } from "zod";
import type { AnalysisQueue } from "./analysis-service";

/** The one queue this module uses (docs/decisions/0001-pg-boss.md). */
export const ANALYSIS_QUEUE_NAME = "job-analysis.extract";

/**
 * The queue payload: ids only, never job text, profile data or model output. It is not proof of
 * ownership; the worker re-reads the row by both ids.
 */
export const analysisPayloadSchema = z.strictObject({
  analysisId: z.uuid(),
  userId: z.string().min(1).max(200),
});
export type AnalysisPayload = z.infer<typeof analysisPayloadSchema>;

/** The slice of a queue client this module needs; the concrete queue is bound by the caller. */
export interface QueueSender {
  /**
   * Sends one job. `singletonKey` makes a second send with the same key a no-op while the first
   * is still waiting. Resolves when the queue has accepted the job or already holds it.
   */
  send(name: string, payload: object, options: { singletonKey: string }): Promise<void>;
}

/** The enqueue port used by the request service and by stale-run recovery. */
export function createAnalysisQueue(sender: QueueSender): AnalysisQueue {
  return {
    async enqueue(payload) {
      const parsed = analysisPayloadSchema.parse(payload);
      await sender.send(ANALYSIS_QUEUE_NAME, parsed, { singletonKey: parsed.analysisId });
    },
  };
}
