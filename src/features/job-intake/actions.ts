"use server";

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/identity/server";
import { readJobForm, toFieldErrors } from "./form";
import type { JobFormState } from "./form";
import { createMyJob, deleteMyJob } from "./index";

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

/** Deletes one of the signed-in user's jobs. Someone else's or a missing id is a plain 404. */
export async function deleteJobAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  const deleted = await deleteMyJob(user, typeof id === "string" ? id : "");
  if (!deleted) notFound();
  redirect("/jobs?deleted=1");
}
