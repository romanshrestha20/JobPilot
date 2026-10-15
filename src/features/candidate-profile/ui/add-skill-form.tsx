"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { addSkillAction } from "../skills/actions";
import { EMPTY_SKILL_FORM_VALUES, type SkillFormState } from "../skills/form";
import { SkillFields } from "./skill-fields";

export function AddSkillForm() {
  const [state, formAction, pending] = useActionState<SkillFormState, FormData>(addSkillAction, {
    status: "idle",
    values: EMPTY_SKILL_FORM_VALUES,
  });
  const errors = state.status === "error" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-label="Add a skill">
      <SkillFields idPrefix="new-skill" values={state.values} errors={errors} />

      <div aria-live="polite" className="empty:hidden">
        {state.status === "success" && <Alert variant="success">{state.message}</Alert>}
        {state.status === "error" && state.formError && (
          <Alert variant="destructive">{state.formError}</Alert>
        )}
        {state.status === "error" && !state.formError && (
          <Alert variant="destructive">Please fix the highlighted fields.</Alert>
        )}
      </div>

      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Adding…" : "Add skill"}
        </Button>
      </div>
    </form>
  );
}
