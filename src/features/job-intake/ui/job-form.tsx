"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction, updateJobAction } from "../actions";
import { EMPTY_JOB_FORM, type JobFormState, type JobFormValues } from "../form";
import { JOB_LIMITS } from "../validation";

export interface JobFormProps {
  /** Present when editing: the saved job's id and current values. Absent when adding a job. */
  job?: { id: string; values: JobFormValues };
}

export function JobForm({ job }: JobFormProps) {
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(
    job ? updateJobAction : createJobAction,
    { status: "idle", values: job?.values ?? EMPTY_JOB_FORM },
  );
  const errors = state.status === "error" ? state.fieldErrors : {};
  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {job ? <input type="hidden" name="id" value={job.id} /> : null}
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : job ? "Save changes" : "Save job"}
        </Button>
        {job ? (
          <Link href={`/jobs/${job.id}`} className={buttonVariants({ variant: "secondary" })}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
