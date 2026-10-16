import "server-only";
import { createConfiguredGateway } from "@/lib/ai";
import { extractRequirements } from "./application/extract";
import { demoExtractRequirements } from "./domain/demo-extraction";

let gateway: ReturnType<typeof createConfiguredGateway> | undefined;

/**
 * Composition root for Phase 2A: binds the configured provider to the extraction use case.
 * Callers (the Phase 2B worker) must already have checked who owns the job and pass only its
 * description. Nothing calls this yet.
 */
export function extractJobRequirements(jobText: string) {
  gateway ??= createConfiguredGateway({ extract_job_requirements: demoExtractRequirements });
  return extractRequirements(gateway, jobText);
}

export { DEMO_LABEL } from "./domain/demo-extraction";
export { MAX_JOB_TEXT_CHARS } from "./application/extract";
export type { ExtractionErrorCode, ExtractionResult } from "./application/extract";
export type { GroundedRequirements, GroundedSkill } from "./domain/requirements";

// Public surface for the worker's composition root (src/worker). The pure parts take their
// dependencies as arguments; only the repository needs a database, supplied by the caller.
export { createAnalysisRepository } from "./repository";
export type { AnalysisRepository } from "./repository";
export { createAnalysisService } from "./application/analysis-service";
export type {
  AnalysisDto,
  AnalysisQueue,
  JobAnalysisView,
  JobReader,
  RequestAnalysisResult,
} from "./application/analysis-service";
export type { AnalysisStatus, FailureCode } from "./domain/analysis-state";
export {
  ANALYSIS_QUEUE_NAME,
  analysisPayloadSchema,
  createAnalysisQueue,
} from "./application/analysis-queue";
export type { QueueSender } from "./application/analysis-queue";
export { createAnalysisProcessor } from "./application/process-analysis";
export type { AnalysisProcessor, ProcessOutcome } from "./application/process-analysis";
export { createStaleRecovery } from "./application/recover-stale";
export type { RecoveryResult, StaleRecovery } from "./application/recover-stale";
export {
  ANALYSIS_RETRY_DELAY_MAX_SECONDS,
  ANALYSIS_RETRY_DELAY_SECONDS,
  ANALYSIS_RETRY_LIMIT,
  analysisExpireInSeconds,
} from "./domain/processing-policy";
