import type { FailureCode } from "@/features/job-analysis";

/**
 * What the user reads for each failure code. Fixed text only: provider messages, model output
 * and exception text never reach the page. Every message says nothing was saved, because a
 * failed run never stores a partial or unchecked result.
 */
export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  provider_unavailable: "The AI service could not be reached. Nothing was saved.",
  model_unavailable: "The configured AI model is not available right now. Nothing was saved.",
  timeout: "The analysis took too long and was stopped. Nothing was saved.",
  invalid_output: "The AI returned an answer that could not be used, so it was discarded.",
  too_long: "This job description is too long to analyse.",
  empty_input: "This job has no description text to analyse.",
  job_missing: "This job is no longer available to analyse.",
  enqueue_failed:
    "The analysis could not be started because the background service is not running.",
  retries_exhausted: "The analysis did not finish after several attempts. Nothing was saved.",
};

/** Failures fixed by editing the job, after which the user may analyse again. */
export const EDIT_THEN_RETRY: readonly FailureCode[] = ["too_long", "empty_input"];

export function quotaMessage(limit: number): string {
  return `You have reached the limit of ${limit} analyses in 24 hours. Try again later.`;
}
