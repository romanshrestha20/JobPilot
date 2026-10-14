"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/identity/server";
import { readJobForm, toFieldErrors } from "./form";
import type { JobFormState, JobStatusFormState } from "./form";
import { createMyJob, deleteMyJob, updateMyJob, updateMyJobStatus } from "./index";
import { JOB_STATUS_LABELS } from "./validation";

/**
 * Server Action behind the "add job" form. Authentication happens here, server-side
 * (`requireUser` redirects when signed out); the owner is always the session user.
 */
export async function createJobAction(
  _previous: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await requireUser();
  const values = readJobForm(formData);
  const result = await createMyJob(user, values);

  if (!result.ok) {
    return { status: "error", values, fieldErrors: toFieldErrors(result.errors) };
  }
  // redirect() throws, so it must stay outside any try/catch.
  redirect(`/jobs/${result.job.id}?saved=1`);
}

/**
 * Server Action behind the "edit job" form. The job id arrives as a form field, so it is
 * treated as untrusted: the service validates it and the update is scoped to the session
 * user in SQL. Someone else's, a missing and a malformed id are all a plain 404.
 */
export async function updateJobAction(
  _previous: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await requireUser();
  const id = formData.get("id");
  const values = readJobForm(formData);
  const result = await updateMyJob(user, typeof id === "string" ? id : "", values);

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return { status: "error", values, fieldErrors: toFieldErrors(result.errors) };
  }
  redirect(`/jobs/${result.job.id}?updated=1`);
}

/**
 * Dedicated status change, separate from editing so an ordinary edit can never reset the
 * application status. Only `id` and `status` are read from the form; the update is scoped to
 * the session user in SQL, and someone else's, a missing and a malformed id are a plain 404.
 */
export async function updateJobStatusAction(
  _previous: JobStatusFormState,
  formData: FormData,
): Promise<JobStatusFormState> {
  const user = await requireUser();
  const id = formData.get("id");
  const status = formData.get("status");
  const result = await updateMyJobStatus(user, typeof id === "string" ? id : "", {
    status: typeof status === "string" ? status : undefined,
  });

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return {
      status: "error",
      message: result.errors[0]?.message ?? "Choose a status from the list.",
    };
  }
  // Re-render the detail page and the list with the new status; the user stays where they are.
  revalidatePath(`/jobs/${result.job.id}`);
  revalidatePath("/jobs");
  return {
    status: "success",
    message: `Status changed to ${JOB_STATUS_LABELS[result.job.status]}.`,
  };
}

/** Deletes one of the signed-in user's jobs. Someone else's or a missing id is a plain 404. */
export async function deleteJobAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  const deleted = await deleteMyJob(user, typeof id === "string" ? id : "");
  if (!deleted) notFound();
  redirect("/jobs?deleted=1");
}
