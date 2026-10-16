"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/identity/server";
import { quotaMessage } from "./messages";
import { getAnalysisService } from "./server";

export type AnalysisActionState = { status: "idle" } | { status: "error"; message: string };

/**
 * Starts (or retries) the analysis of one job. Server Actions are reachable by direct POST, so
 * authentication is checked here, the owner is always the session user, and the job id from the
 * form is untrusted: the service validates it and reads the job as that user, so a missing,
 * malformed and foreign id are all a plain 404. Only the job id is read from the form.
 */
export async function requestAnalysisAction(
  _previous: AnalysisActionState,
  formData: FormData,
): Promise<AnalysisActionState> {
  const user = await requireUser();
  const jobId = formData.get("jobId");
  const result = await getAnalysisService().requestAnalysis(
    user,
    typeof jobId === "string" ? jobId : "",
  );

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    if (result.reason === "quota_exceeded") {
      return { status: "error", message: quotaMessage(result.limit) };
    }
    revalidatePath(`/jobs/${String(jobId)}`);
    return {
      status: "error",
      message: "The analysis could not be started. Try again in a moment.",
    };
  }
  revalidatePath(`/jobs/${result.analysis.jobId}`);
  return { status: "idle" };
}
