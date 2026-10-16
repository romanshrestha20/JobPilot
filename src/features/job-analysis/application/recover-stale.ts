import { type Logger, log as defaultLogger } from "@/lib/log";
import {
  ABANDONED_PENDING_SECONDS,
  ANALYSIS_MAX_ATTEMPTS,
  STALE_PENDING_SECONDS,
  STALE_SWEEP_LIMIT,
  staleProcessingSeconds,
} from "../domain/processing-policy";
import type { AnalysisRepository } from "../repository";
import type { AnalysisQueue } from "./analysis-service";

export type RecoveryResult = { reenqueued: number; failed: number; skipped: number };

export type RecoveryDeps = {
  repository: AnalysisRepository;
  queue: AnalysisQueue;
  llmTimeoutMs: number;
  maxAttempts?: number;
  now?: () => Date;
  logger?: Logger;
};

/**
 * Finds runs that stopped changing and either sends them to the queue again or ends them.
 *
 * - `pending` for a few minutes: the queue job was probably lost, so enqueue it again (the
 *   singleton key makes a still-waiting job a no-op, and the processor's conditional claim makes
 *   a double delivery harmless).
 * - `pending` for far too long, or `processing` with every attempt used: fail it, so the user
 *   sees a failure and can retry instead of waiting forever.
 * - `processing` with attempts left whose queue job is gone (the worker died): enqueue again.
 *
 * Safe to run from several workers at once: each decision is a conditional update or a deduped
 * send, and a run that changed after it was listed is left alone.
 */
export function createStaleRecovery(deps: RecoveryDeps) {
  const { repository, queue, llmTimeoutMs } = deps;
  const maxAttempts = deps.maxAttempts ?? ANALYSIS_MAX_ATTEMPTS;
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? defaultLogger;
  const ago = (from: Date, seconds: number) => new Date(from.getTime() - seconds * 1000);

  return {
    async recover(): Promise<RecoveryResult> {
      const at = now();
      const pendingBefore = ago(at, STALE_PENDING_SECONDS);
      const abandonedBefore = ago(at, ABANDONED_PENDING_SECONDS);
      const processingBefore = ago(at, staleProcessingSeconds(llmTimeoutMs));

      const stale = await repository.listStale({
        pendingBefore,
        processingBefore,
        limit: STALE_SWEEP_LIMIT,
      });

      const result: RecoveryResult = { reenqueued: 0, failed: 0, skipped: 0 };
      for (const run of stale) {
        const ids = { userId: run.userId, analysisId: run.id, attempt: run.attempts };
        const exhausted = run.status === "processing" && run.attempts >= maxAttempts;
        const abandoned = run.status === "pending";

        if (exhausted) {
          const row = await repository.failIfStale(
            run.userId,
            run.id,
            "retries_exhausted",
            processingBefore,
          );
          if (row) {
            result.failed += 1;
            logger.warn({ event: "analysis.recovered_failed", code: "retries_exhausted", ...ids });
          } else {
            result.skipped += 1;
          }
          continue;
        }

        if (abandoned) {
          // `pending` rows past the abandon age are failed first; younger ones are re-enqueued.
          const row = await repository.failIfStale(
            run.userId,
            run.id,
            "enqueue_failed",
            abandonedBefore,
          );
          if (row) {
            result.failed += 1;
            logger.warn({ event: "analysis.recovered_failed", code: "enqueue_failed", ...ids });
            continue;
          }
        }

        try {
          await queue.enqueue({ analysisId: run.id, userId: run.userId });
          result.reenqueued += 1;
          logger.info({ event: "analysis.reenqueued", ...ids });
        } catch {
          // Leave the run as it is; the next pass tries again, and the abandon age ends it.
          result.skipped += 1;
          logger.error({ event: "analysis.reenqueue_failed", code: "enqueue_failed", ...ids });
        }
      }
      return result;
    },
  };
}

export type StaleRecovery = ReturnType<typeof createStaleRecovery>;
