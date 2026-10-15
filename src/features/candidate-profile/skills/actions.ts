"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/identity/server";
import { toFieldErrors } from "../form";
import { addMySkill, removeMySkill, updateMySkill } from "../index";
import { EMPTY_SKILL_FORM_VALUES, parseSkillForm, readSkillForm, toSkillFormValues } from "./form";
import type { SkillFormState } from "./form";
import { SKILL_LIMITS } from "./validation";

const DUPLICATE_MESSAGE = "You already have this skill. Edit the existing one instead.";
const LIMIT_MESSAGE = `You can keep up to ${SKILL_LIMITS.maxSkills} skills. Remove one to add another.`;

/**
 * Server Action behind the "add skill" form. Authentication happens here, server-side
 * (`requireUser` redirects when signed out); the owner is always the session user.
 */
export async function addSkillAction(
  _previous: SkillFormState,
  formData: FormData,
): Promise<SkillFormState> {
  const user = await requireUser();
  const values = readSkillForm(formData);
  const result = await addMySkill(user, parseSkillForm(formData));

  if (!result.ok) {
    if (result.reason === "invalid") {
      return { status: "error", values, fieldErrors: toFieldErrors(result.errors) };
    }
    if (result.reason === "duplicate") {
      return { status: "error", values, fieldErrors: { name: DUPLICATE_MESSAGE } };
    }
    return { status: "error", values, fieldErrors: {}, formError: LIMIT_MESSAGE };
  }
  revalidatePath("/profile");
  return {
    status: "success",
    values: EMPTY_SKILL_FORM_VALUES,
    message: `Added ${result.skill.name}.`,
  };
}

/**
 * Server Action behind a skill's edit form. The skill id arrives as a form field, so it is
 * untrusted: the service validates it and the update is scoped to the session user in SQL.
 * Someone else's, a missing and a malformed id all end as the same "not found" message.
 */
export async function updateSkillAction(
  _previous: SkillFormState,
  formData: FormData,
): Promise<SkillFormState> {
  const user = await requireUser();
  const id = formData.get("id");
  const values = readSkillForm(formData);
  const result = await updateMySkill(
    user,
    typeof id === "string" ? id : "",
    parseSkillForm(formData),
  );

  if (!result.ok) {
    if (result.reason === "invalid") {
      return { status: "error", values, fieldErrors: toFieldErrors(result.errors) };
    }
    if (result.reason === "duplicate") {
      return { status: "error", values, fieldErrors: { name: DUPLICATE_MESSAGE } };
    }
    revalidatePath("/profile");
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: "This skill no longer exists. Reload the page to see your current skills.",
    };
  }
  revalidatePath("/profile");
  return {
    status: "success",
    values: toSkillFormValues(result.skill),
    message: `Saved ${result.skill.name}.`,
  };
}

/**
 * Deletes one of the signed-in user's skills. Someone else's, a missing and a malformed id are
 * all a no-op, so nothing reveals whether another user's skill exists.
 */
export async function deleteSkillAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  await removeMySkill(user, typeof id === "string" ? id : "");
  revalidatePath("/profile");
}
