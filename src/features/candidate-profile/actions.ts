"use server";

import { requireUser } from "@/features/identity/server";
import { readFormValues, parseProfileForm, toFieldErrors, toFormValues } from "./form";
import type { ProfileFormState } from "./form";
import { updateMyProfile } from "./index";

/**
 * Server Action behind the profile form. Authentication happens here, server-side
 * (`requireUser` redirects when signed out); the owner is always the session user.
 */
export async function saveProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const result = await updateMyProfile(user, parseProfileForm(formData));

  if (!result.ok) {
    return {
      status: "error",
      values: readFormValues(formData),
      fieldErrors: toFieldErrors(result.errors),
    };
  }
  return { status: "success", values: toFormValues(result.profile) };
}
