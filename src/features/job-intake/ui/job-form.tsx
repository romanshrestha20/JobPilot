"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction } from "../actions";
import { EMPTY_JOB_FORM, type JobFormState } from "../form";
import { JOB_LIMITS } from "../validation";

export function JobForm() {
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(createJobAction, {
    status: "idle",
    values: EMPTY_JOB_FORM,
  });
  const errors = state.status === "error" ? state.fieldErrors : {};
  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField id="title" label="Job title" error={errors.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            required
            maxLength={JOB_LIMITS.title}
            defaultValue={values.title}
            placeholder="Senior backend engineer"
          />
        )}
      </FormField>

      <FormField id="company" label="Company" error={errors.company}>
        {(control) => (
          <Input
            {...control}
            name="company"
            required
            maxLength={JOB_LIMITS.company}
            defaultValue={values.company}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="location" label="Location (optional)" error={errors.location}>
          {(control) => (
            <Input
              {...control}
              name="location"
              maxLength={JOB_LIMITS.location}
              defaultValue={values.location}
              placeholder="Helsinki, hybrid"
            />
          )}
        </FormField>

        <FormField
          id="sourceUrl"
          label="Original posting link (optional)"
          hint="Saved as a link only. JobPilot does not open it."
          error={errors.sourceUrl}
        >
          {(control) => (
            <Input
              {...control}
              name="sourceUrl"
              type="url"
              inputMode="url"
              maxLength={JOB_LIMITS.sourceUrl}
              defaultValue={values.sourceUrl}
              placeholder="https://"
            />
          )}
        </FormField>
      </div>

      <FormField
        id="description"
        label="Job description"
        hint="Paste the full posting."
        error={errors.description}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            required
            rows={12}
            maxLength={JOB_LIMITS.description}
            defaultValue={values.description}
          />
        )}
      </FormField>

      <div aria-live="polite" className="min-h-5">
        {state.status === "error" && (
          <Alert variant="destructive">Please fix the highlighted fields.</Alert>
        )}
      </div>

      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save job"}
      </Button>
    </form>
  );
}
