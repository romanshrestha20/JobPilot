import { type Logger, log as defaultLogger } from "@/lib/log";
import { type FailureCode, isRetryableFailure } from "../domain/analysis-state";
import { hashDescription } from "../domain/description-hash";
import { ANALYSIS_MAX_ATTEMPTS, reclaimProcessingAfterSeconds } from "../domain/processing-policy";
import { groundedRequirementsSchema } from "../domain/requirements";
import type { AnalysisRepository } from "../repository";
import { type AnalysisPayload, analysisPayloadSchema } from "./analysis-queue";
import type { ExtractionResult } from "./extract";
import type { JobReader } from "./analysis-service";

/** Extraction of one job description. The only argument is the job text: no profile data. */
export type ExtractPort = (jobText: string) => Promise<ExtractionResult>;

export type ProcessOutcome =
  | { kind: "completed" }
  /** The run ended `failed`; the queue job is finished and must not be retried. */
  | { kind: "failed"; code: FailureCode }
  /** Nothing was done: bad payload, unknown or foreign row, or a run already finished. */
  | { kind: "skipped"; reason: "invalid_payload" | "not_found" | "not_claimable" | "lost_race" }
  /** A retryable failure with attempts left: the caller must make the queue deliver it again. */
  | { kind: "retry"; code: FailureCode };

export type ProcessorDeps = {
  repository: AnalysisRepository;
  jobs: JobReader;
  extract: ExtractPort;
  /** The configured model timeout; decides when an idle `processing` run may be claimed again. */
  llmTimeoutMs: number;
  maxAttempts?: number;
  now?: () => Date;
  logger?: Logger;
};

/**
 * The worker use case (docs/ai-architecture.md section 10.2). Safe to run twice for the same
 * delivery: every write is a conditional transition, so a duplicate or late delivery finds the
 * run already claimed, completed or failed and changes nothing. It never throws for an expected
 * failure; it returns an outcome. Anything it does throw (a database error) is unexpected, the
 * run stays `processing`, and the queue retries or stale recovery ends it.
 *
 * Only the job description is sent to the model. The processor has no access to candidate data.
 */
export function createAnalysisProcessor(deps: ProcessorDeps) {
  const { repository, jobs, extract } = deps;
  const maxAttempts = deps.maxAttempts ?? ANALYSIS_MAX_ATTEMPTS;
  const logger = deps.logger ?? defaultLogger;
  const now = deps.now ?? (() => new Date());
  const reclaimAfterMs = reclaimProcessingAfterSeconds(deps.llmTimeoutMs) * 1000;

  return {
    async process(rawPayload: unknown): Promise<ProcessOutcome> {
      const payload = analysisPayloadSchema.safeParse(rawPayload);
      if (!payload.success) {
        // A malformed payload can never succeed, so it is dropped, not retried.
        logger.warn({ event: "analysis.invalid_payload" });
        return { kind: "skipped", reason: "invalid_payload" };
      }
      const { analysisId, userId }: AnalysisPayload = payload.data;

      const existing = await repository.findForUser(userId, analysisId);
      if (!existing) return { kind: "skipped", reason: "not_found" };
      if (existing.status === "completed" || existing.status === "failed") {
        return { kind: "skipped", reason: "not_claimable" };
      }

      const claimed = await repository.claim(userId, analysisId, {
        reclaimBefore: new Date(now().getTime() - reclaimAfterMs),
      });
      if (!claimed) return { kind: "skipped", reason: "not_claimable" };
      const attempt = claimed.attempts;
      const ids = { userId, analysisId, jobId: claimed.jobId, attempt };

      const failRun = async (code: FailureCode): Promise<ProcessOutcome> => {
        const row = await repository.fail(userId, analysisId, code);
        if (!row) return { kind: "skipped", reason: "lost_race" };
        logger.warn({ event: "analysis.failed", code, ...ids });
        return { kind: "failed", code };
      };
      const retryOrFail = async (code: FailureCode): Promise<ProcessOutcome> => {
        if (isRetryableFailure(code) && attempt < maxAttempts) {
          // Hand the run back so the queue's next delivery can claim it. Only this attempt can.
          const released = await repository.release(userId, analysisId, attempt);
          if (!released) return { kind: "skipped", reason: "lost_race" };
          logger.warn({ event: "analysis.retry", code, ...ids });
          return { kind: "retry", code };
        }
        return failRun(code);
      };

      // Redelivery past the limit (the queue and the counter disagree): stop, do not call the model.
      if (attempt > maxAttempts) return failRun("retries_exhausted");

      const job = await jobs.findJob(userId, claimed.jobId);
      if (!job) return failRun("job_missing");

      const extraction = await extract(job.description);
      if (!extraction.ok) return retryOrFail(extraction.code);

      // The extractor already validated the model output; the stored shape is checked again so
      // nothing but the strict schema is ever saved.
      const requirements = groundedRequirementsSchema.safeParse(extraction.requirements);
      if (!requirements.success) return retryOrFail("invalid_output");

      const done = await repository.complete(userId, analysisId, {
        descriptionHash: hashDescription(job.description),
        promptVersion: extraction.meta.promptVersion,
        provider: extraction.meta.provider,
        model: extraction.meta.model,
        requirements: requirements.data,
        droppedUngrounded: requirements.data.droppedUngrounded,
      });
      if (!done) {
        // Another delivery finished or failed this run first; its result stands.
        return { kind: "skipped", reason: "lost_race" };
      }
      logger.info({
        event: "analysis.completed",
        provider: extraction.meta.provider,
        durationMs: extraction.meta.latencyMs,
        droppedUngrounded: requirements.data.droppedUngrounded,
        ...ids,
      });
      return { kind: "completed" };
    },
  };
}

export type AnalysisProcessor = ReturnType<typeof createAnalysisProcessor>;
