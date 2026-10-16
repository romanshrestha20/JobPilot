/**
 * Lifecycle of one analysis run (docs/ai-architecture.md section 8.2). Shared by the table's
 * CHECK constraints and the state machine, so the database and the code cannot disagree.
 */
export const ANALYSIS_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/** A run that has not reached a terminal state; at most one per job exists at a time. */
export const ACTIVE_STATUSES = [
  "pending",
  "processing",
] as const satisfies readonly AnalysisStatus[];

/** Why a run ended in `failed`. Never carries provider text, only this code. */
export const FAILURE_CODES = [
  "provider_unavailable",
  "model_unavailable",
  "timeout",
  "invalid_output",
  "too_long",
  "enqueue_failed",
  "job_missing",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** Where the extraction came from; `demo` results are labelled as such in the UI. */
export const ANALYSIS_PROVIDERS = ["ollama", "demo"] as const;
export type AnalysisProvider = (typeof ANALYSIS_PROVIDERS)[number];

/** Failures a new attempt could fix. The others are permanent for this input. */
export const RETRYABLE_FAILURES = [
  "provider_unavailable",
  "model_unavailable",
  "timeout",
  "invalid_output",
] as const satisfies readonly FailureCode[];

export function isRetryableFailure(code: FailureCode): boolean {
  return (RETRYABLE_FAILURES as readonly string[]).includes(code);
}
