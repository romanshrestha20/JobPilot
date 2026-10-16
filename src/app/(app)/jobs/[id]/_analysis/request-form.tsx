"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type AnalysisActionState, requestAnalysisAction } from "./actions";

/** One button that starts, re-runs or retries the analysis of a job. */
export function RequestAnalysisForm({
  jobId,
  label,
  variant = "primary",
}: {
  jobId: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState<AnalysisActionState, FormData>(
    requestAnalysisAction,
    { status: "idle" },
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div>
        <Button type="submit" variant={variant} loading={pending}>
          {pending ? "Starting…" : label}
        </Button>
      </div>
      <div aria-live="polite">
        {state.status === "error" && <Alert variant="destructive">{state.message}</Alert>}
      </div>
    </form>
  );
}
