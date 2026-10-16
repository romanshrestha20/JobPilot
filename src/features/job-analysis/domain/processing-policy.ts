/**
 * Retry and recovery policy for background analysis (docs/ai-architecture.md section 10).
 * Pure values: the queue options and the stale-run thresholds both derive from these, so the
 * database counter and the queue cannot disagree about the last attempt.
 */

/** Attempts in total for one run: the first try plus two retries. */
export const ANALYSIS_MAX_ATTEMPTS = 3;
/** The queue's retry limit (retries after the first attempt). */
export const ANALYSIS_RETRY_LIMIT = ANALYSIS_MAX_ATTEMPTS - 1;
/** Exponential backoff starts here and is capped by the maximum below. */
export const ANALYSIS_RETRY_DELAY_SECONDS = 30;
export const ANALYSIS_RETRY_DELAY_MAX_SECONDS = 300;

/** A queue job is considered stuck slightly after the model call itself would have timed out. */
const EXPIRY_MARGIN_SECONDS = 30;
export function analysisExpireInSeconds(llmTimeoutMs: number): number {
  return Math.ceil(llmTimeoutMs / 1000) + EXPIRY_MARGIN_SECONDS;
}

/**
 * A `processing` run can be claimed again by a later delivery once it has been idle this long:
 * longer than one model call can take, shorter than the queue's own expiry, so the delivery
 * that follows a dead worker is accepted while a duplicate during a live attempt is not.
 */
export function reclaimProcessingAfterSeconds(llmTimeoutMs: number): number {
  return Math.ceil(llmTimeoutMs / 1000) + 10;
}

/** A `pending` run this old has probably lost its queue job and is enqueued again. */
export const STALE_PENDING_SECONDS = 6 * 60;
/** A `pending` run this old is failed (`enqueue_failed`) so the user sees it and can retry. */
export const ABANDONED_PENDING_SECONDS = 30 * 60;
/**
 * A `processing` row is only idle for the length of one attempt plus the longest backoff before
 * the queue redelivers it, so it is stale once it has not changed for longer than both.
 */
export function staleProcessingSeconds(llmTimeoutMs: number): number {
  return analysisExpireInSeconds(llmTimeoutMs) + ANALYSIS_RETRY_DELAY_MAX_SECONDS + 60;
}

/** Most stale runs handled in one recovery pass (the query is bounded). */
export const STALE_SWEEP_LIMIT = 50;
