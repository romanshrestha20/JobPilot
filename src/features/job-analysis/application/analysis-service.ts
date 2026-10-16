import { z } from "zod";
import { type Logger, log as defaultLogger } from "@/lib/log";
import {
  ANALYSIS_DAILY_LIMIT,
  type AnalysisProvider,
  type AnalysisStatus,
  type FailureCode,
  userCanRetry,
} from "../domain/analysis-state";
import { hashDescription } from "../domain/description-hash";
import { type GroundedRequirements, groundedRequirementsSchema } from "../domain/requirements";
import type { AnalysisRecord, AnalysisRepository } from "../repository";

/** How the service reads a job: through the job-intake public API, scoped to the owner. */
export interface JobReader {
  findJob(userId: string, jobId: string): Promise<{ description: string } | null>;
}

/** The queue carries ids only: no job text, no profile data, no model output. */
export interface AnalysisQueue {
  enqueue(payload: { analysisId: string; userId: string }): Promise<void>;
}

/** What callers receive. Deliberately omits `userId`, the description hash and the model. */
export type AnalysisDto = {
  id: string;
  jobId: string;
  status: AnalysisStatus;
  failureCode: FailureCode | null;
  /** True when a failed run may be started again; false for permanent causes. */
  canRetry: boolean;
  attempts: number;
  provider: AnalysisProvider | null;
  /** True when the result is from the keyword-based demo extractor, not a model. */
  demo: boolean;
  requirements: GroundedRequirements | null;
  droppedUngrounded: number;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type RequestAnalysisResult =
  /** `created` is false when a run was already active and no second one was started. */
  | { ok: true; analysis: AnalysisDto; created: boolean }
  /** A missing job, a malformed id and someone else's job are all the same answer. */
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "quota_exceeded"; limit: number }
  | { ok: false; reason: "enqueue_failed" };

export type JobAnalysisView = {
  /** The newest run of any status: pending, processing, completed or failed. */
  latest: AnalysisDto | null;
  /** The newest completed run, which stays visible while a re-run is pending or failed. */
  current: AnalysisDto | null;
  /** The job description changed after `current` was made. */
  stale: boolean;
};

const idSchema = z.uuid();

function constraintCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = cause?.code ?? (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export type AnalysisServiceDeps = {
  repository: AnalysisRepository;
  jobs: JobReader;
  queue: AnalysisQueue;
  dailyLimit?: number;
  logger?: Logger;
};

/**
 * Use cases for the signed-in user's own analyses. Callers pass the authenticated user (from
 * `requireUser`); the owner id is never taken from input. Every read and write is scoped to
 * that user in SQL, and the job is read through the job-intake port as that same user, so an
 * id belonging to someone else behaves exactly like one that does not exist.
 */
export function createAnalysisService(deps: AnalysisServiceDeps) {
  const { repository, jobs, queue } = deps;
  const dailyLimit = deps.dailyLimit ?? ANALYSIS_DAILY_LIMIT;
  const logger = deps.logger ?? defaultLogger;

  function toDto(record: AnalysisRecord): AnalysisDto {
    let status = record.status as AnalysisStatus;
    let failureCode = record.failureCode as FailureCode | null;
    let requirements: GroundedRequirements | null = null;

    if (status === "completed") {
      const parsed = groundedRequirementsSchema.safeParse(record.requirements);
      if (parsed.success) {
        requirements = parsed.data;
      } else {
        // A stored result that no longer matches the schema is never scored or shown.
        logger.error({ event: "analysis.stored_result_invalid", analysisId: record.id });
        status = "failed";
        failureCode = "invalid_output";
      }
    }

    return {
      id: record.id,
      jobId: record.jobId,
      status,
      failureCode,
      canRetry: status === "failed" && failureCode !== null && userCanRetry(failureCode),
      attempts: record.attempts,
      provider: record.provider as AnalysisProvider | null,
      demo: record.provider === "demo",
      requirements,
      droppedUngrounded: record.droppedUngrounded,
      queuedAt: record.queuedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
    };
  }

  return {
    /**
     * Starts an analysis of one of the user's jobs, or returns the one already running.
     * Also the Retry path: a failed run is never reopened, a new one is created.
     */
    async requestAnalysis(user: { id: string }, jobId: unknown): Promise<RequestAnalysisResult> {
      const parsedId = idSchema.safeParse(jobId);
      if (!parsedId.success) return { ok: false, reason: "not_found" };

      const job = await jobs.findJob(user.id, parsedId.data);
      if (!job) return { ok: false, reason: "not_found" };

      let outcome;
      try {
        outcome = await repository.createPendingForUser(user.id, parsedId.data, { dailyLimit });
      } catch (error) {
        // The job vanished between the read and the insert; the composite foreign key refused.
        if (constraintCode(error) === "23503") return { ok: false, reason: "not_found" };
        throw error;
      }

      if (outcome.kind === "quota_exceeded") {
        logger.warn({ event: "analysis.quota_exceeded", userId: user.id, jobId: parsedId.data });
        return { ok: false, reason: "quota_exceeded", limit: dailyLimit };
      }
      if (outcome.kind === "already_active") {
        return { ok: true, analysis: toDto(outcome.record), created: false };
      }

      try {
        await queue.enqueue({ analysisId: outcome.record.id, userId: user.id });
      } catch {
        // Fail at once so the user sees a failure instead of waiting for a job that never runs.
        await repository.fail(user.id, outcome.record.id, "enqueue_failed");
        logger.error({
          event: "analysis.enqueue_failed",
          code: "enqueue_failed",
          userId: user.id,
          jobId: parsedId.data,
          analysisId: outcome.record.id,
        });
        return { ok: false, reason: "enqueue_failed" };
      }
      return { ok: true, analysis: toDto(outcome.record), created: true };
    },

    /** The state of a job's analysis, or null when the job is not the user's. */
    async getMyAnalysisView(user: { id: string }, jobId: unknown): Promise<JobAnalysisView | null> {
      const parsedId = idSchema.safeParse(jobId);
      if (!parsedId.success) return null;
      const job = await jobs.findJob(user.id, parsedId.data);
      if (!job) return null;

      const { latest, latestCompleted } = await repository.latestForJob(user.id, parsedId.data);
      const current = latestCompleted ? toDto(latestCompleted) : null;
      return {
        latest: latest ? toDto(latest) : null,
        current,
        stale:
          latestCompleted !== null &&
          latestCompleted.descriptionHash !== hashDescription(job.description),
      };
    },
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
