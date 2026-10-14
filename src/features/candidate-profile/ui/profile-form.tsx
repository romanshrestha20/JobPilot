"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveProfileAction } from "../actions";
import type { ProfileFormState, ProfileFormValues } from "../form";

const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export function ProfileForm({ initialValues }: { initialValues: ProfileFormValues }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    saveProfileAction,
    { status: "idle", values: initialValues },
  );
  const errors = state.status === "error" ? state.fieldErrors : {};
  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField id="headline" label="Headline" error={errors.headline}>
        {(control) => (
          <Input
            {...control}
            name="headline"
            maxLength={120}
            defaultValue={values.headline}
            placeholder="Backend engineer with 5 years of experience"
          />
        )}
      </FormField>

      <FormField id="summary" label="Summary" error={errors.summary}>
        {(control) => (
          <Textarea {...control} name="summary" maxLength={2000} defaultValue={values.summary} />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="location" label="Location" error={errors.location}>
          {(control) => (
            <Input {...control} name="location" maxLength={120} defaultValue={values.location} />
          )}
        </FormField>

        <FormField
          id="yearsOfExperience"
          label="Years of experience"
          error={errors.yearsOfExperience}
        >
          {(control) => (
            <Input
              {...control}
              name="yearsOfExperience"
              type="number"
              min={0}
              max={60}
              step={1}
              defaultValue={values.yearsOfExperience}
            />
          )}
        </FormField>
      </div>

      <FormField
        id="languages"
        label="Languages"
        hint="Separate languages with commas."
        error={errors.languages}
      >
        {(control) => (
          <Input
            {...control}
            name="languages"
            defaultValue={values.languages}
            placeholder="English, Nepali"
          />
        )}
      </FormField>

      <FieldGroup id="workModes" legend="Preferred work modes" error={errors.workModes}>
        <div className="flex flex-wrap gap-4">
          {WORK_MODE_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              name="workModes"
              value={option.value}
              label={option.label}
              defaultChecked={values.workModes.includes(option.value)}
            />
          ))}
        </div>
      </FieldGroup>

      <div aria-live="polite" className="min-h-5">
        {state.status === "success" && <Alert variant="success">Profile saved.</Alert>}
        {state.status === "error" && (
          <Alert variant="destructive">Please fix the highlighted fields.</Alert>
        )}
      </div>

      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
