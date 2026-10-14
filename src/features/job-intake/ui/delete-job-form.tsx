"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteJobAction } from "../actions";

/** Two-step delete: the first click asks for confirmation, the second submits. */
export function DeleteJobForm({ jobId }: { jobId: string }) {
  const [confirming, setConfirming] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hasToggled = useRef(false);

  // Swapping the controls would drop keyboard focus on <body>; move it to the control that
  // replaces the one just activated (Cancel when asking, Delete job after cancelling).
  useEffect(() => {
    if (!hasToggled.current) {
      hasToggled.current = true;
      return;
    }
    (confirming ? cancelRef : deleteRef).current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button ref={deleteRef} variant="secondary" onClick={() => setConfirming(true)}>
        Delete job
      </Button>
    );
  }

  return (
    <form action={deleteJobAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={jobId} />
      <p role="alert" className="text-body-sm text-destructive">
        Delete this job permanently?
      </p>
      <Button type="submit" variant="destructive">
        Yes, delete
      </Button>
      <Button ref={cancelRef} variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
