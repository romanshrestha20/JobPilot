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

/** Failures a new run cannot fix, so the UI does not offer Retry for them. */
export const PERMANENT_FAILURES = [
  "too_long",
  "job_missing",
] as const satisfies readonly FailureCode[];

/** Whether the user may start a new run after this failure (including a lost queue). */
export function userCanRetry(code: FailureCode): boolean {
  return !(PERMANENT_FAILURES as readonly string[]).includes(code);
}

/**
 * Runs one user may request in a rolling 24-hour window: any run created in the last 24 hours
 * counts, so there is no midnight reset (docs/ai-architecture.md section 13, item 8).
 */
export const ANALYSIS_DAILY_LIMIT = 20;
