"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { updateJobStatusAction } from "../actions";
import type { JobStatusFormState } from "../form";
import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from "../validation";

/** Changes the application status of one job without leaving the detail page. */
export function JobStatusForm({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [state, formAction, pending] = useActionState<JobStatusFormState, FormData>(
    updateJobStatusAction,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={jobId} />
      <div className="flex flex-wrap items-end gap-2">
        <FormField id="status" label="Change status" className="min-w-0 flex-1 sm:max-w-56">
          {(control) => (
            // `key` re-syncs the control when the server renders a new current status.
            <Select {...control} key={status} name="status" defaultValue={status}>
              {JOB_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {JOB_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? "Updating…" : "Update status"}
        </Button>
      </div>
      <div aria-live="polite" className="min-h-5">
        {state.status === "success" && <Alert variant="success">{state.message}</Alert>}
        {state.status === "error" && <Alert variant="destructive">{state.message}</Alert>}
      </div>
    </form>
  );
}
