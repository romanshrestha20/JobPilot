"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteSkillAction, updateSkillAction } from "../skills/actions";
import { type SkillFormState, toSkillFormValues } from "../skills/form";
import { type CandidateSkillDto, SKILL_LEVEL_LABELS } from "../skills/validation";
import { SkillFields } from "./skill-fields";

export const SKILLS_HEADING_ID = "skills-heading";

/** One skill: a read view with Edit and a two-step Delete, or the inline edit form. */
export function SkillItem({ skill }: { skill: CandidateSkillDto }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dismissed, setDismissed] = useState<SkillFormState | null>(null);
  const [state, formAction, pending] = useActionState<SkillFormState, FormData>(updateSkillAction, {
    status: "idle",
    values: toSkillFormValues(skill),
  });

  // Close the editor once the save succeeded (derived from the action result, not an effect).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "success") setEditing(false);
  }

  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteSubmitted = useRef(false);
  const wasEditing = useRef(false);
  const wasConfirming = useRef(false);

  // Swapping controls would drop keyboard focus on <body>; send it to the control that
  // replaces the one just used. Comparing with the previous value keeps this from firing on
  // mount (including the development double-run of effects).
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    if (wasConfirming.current !== confirmingDelete) {
      (confirmingDelete ? cancelDeleteRef : deleteRef).current?.focus();
    }
    wasConfirming.current = confirmingDelete;
  }, [confirmingDelete]);

  // Once a delete went through, this item unmounts; hand focus to the section heading.
  useEffect(
    () => () => {
      if (deleteSubmitted.current) document.getElementById(SKILLS_HEADING_ID)?.focus();
    },
    [],
  );

  if (editing) {
    // A previous failed attempt is not shown again after Cancel and Edit.
    const failed = state.status === "error" && state !== dismissed ? state : null;
    const errors = failed ? failed.fieldErrors : {};
    return (
      <li className="rounded-md border border-border p-4">
        <form action={formAction} className="flex flex-col gap-4" aria-label={`Edit ${skill.name}`}>
          <input type="hidden" name="id" value={skill.id} />
          <SkillFields
            idPrefix={`skill-${skill.id}`}
            values={failed ? failed.values : toSkillFormValues(skill)}
            errors={errors}
            autoFocusName
          />
          <div aria-live="polite" className="empty:hidden">
            {failed && (
              <Alert variant="destructive">
                {failed.formError ?? "Please fix the highlighted fields."}
              </Alert>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save skill"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDismissed(state);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-h3 wrap-anywhere">{skill.name}</h3>
        {skill.level && <Badge tone="neutral">{SKILL_LEVEL_LABELS[skill.level]}</Badge>}
        {skill.yearsOfExperience !== null && (
          <Badge tone="tag">
            {skill.yearsOfExperience} {skill.yearsOfExperience === 1 ? "year" : "years"}
          </Badge>
        )}
      </div>
      {skill.evidence && (
        <p className="text-body-sm text-muted-foreground wrap-anywhere whitespace-pre-line">
          {skill.evidence}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-body-sm text-success">
          {state.message}
        </p>
      )}

      {confirmingDelete ? (
        <form
          action={deleteSkillAction}
          onSubmit={() => {
            deleteSubmitted.current = true;
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="id" value={skill.id} />
          <p role="alert" className="text-body-sm text-destructive wrap-anywhere">
            Remove {skill.name} from your profile?
          </p>
          <Button type="submit" variant="destructive" size="sm">
            Yes, remove
          </Button>
          <Button
            ref={cancelDeleteRef}
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingDelete(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            ref={editRef}
            variant="secondary"
            size="sm"
            aria-label={`Edit ${skill.name}`}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            ref={deleteRef}
            variant="ghost"
            size="sm"
            aria-label={`Remove ${skill.name}`}
            onClick={() => setConfirmingDelete(true)}
          >
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}
