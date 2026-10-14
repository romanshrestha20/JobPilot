"use client";

import { useActionState } from "react";
import { saveProfileAction } from "../actions";
import type { ProfileFormState, ProfileFormValues } from "../form";

const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:ring-zinc-100";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function ProfileForm({ initialValues }: { initialValues: ProfileFormValues }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    saveProfileAction,
    { status: "idle", values: initialValues },
  );
  const errors = state.status === "error" ? state.fieldErrors : {};
  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="headline" className={labelClass}>
          Headline
        </label>
        <input
          id="headline"
          name="headline"
          maxLength={120}
          defaultValue={values.headline}
          aria-invalid={!!errors.headline}
          aria-describedby={errors.headline ? "headline-error" : undefined}
          placeholder="Backend engineer with 5 years of experience"
          className={inputClass}
        />
        <FieldError id="headline-error" message={errors.headline} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="summary" className={labelClass}>
          Summary
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={4}
          maxLength={2000}
          defaultValue={values.summary}
          aria-invalid={!!errors.summary}
          aria-describedby={errors.summary ? "summary-error" : undefined}
          className={inputClass}
        />
        <FieldError id="summary-error" message={errors.summary} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="location" className={labelClass}>
            Location
          </label>
          <input
            id="location"
            name="location"
            maxLength={120}
            defaultValue={values.location}
            aria-invalid={!!errors.location}
            aria-describedby={errors.location ? "location-error" : undefined}
            className={inputClass}
          />
          <FieldError id="location-error" message={errors.location} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="yearsOfExperience" className={labelClass}>
            Years of experience
          </label>
          <input
            id="yearsOfExperience"
            name="yearsOfExperience"
            type="number"
            min={0}
            max={60}
            step={1}
            defaultValue={values.yearsOfExperience}
            aria-invalid={!!errors.yearsOfExperience}
            aria-describedby={errors.yearsOfExperience ? "yearsOfExperience-error" : undefined}
            className={inputClass}
          />
          <FieldError id="yearsOfExperience-error" message={errors.yearsOfExperience} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="languages" className={labelClass}>
          Languages
        </label>
        <input
          id="languages"
          name="languages"
          defaultValue={values.languages}
          aria-invalid={!!errors.languages}
          aria-describedby="languages-hint languages-error"
          placeholder="English, Nepali"
          className={inputClass}
        />
        <p id="languages-hint" className="text-xs text-zinc-500">
          Separate languages with commas.
        </p>
        <FieldError id="languages-error" message={errors.languages} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Preferred work modes</legend>
        <div className="flex flex-wrap gap-4">
          {WORK_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <input
                type="checkbox"
                name="workModes"
                value={option.value}
                defaultChecked={values.workModes.includes(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldError id="workModes-error" message={errors.workModes} />
      </fieldset>

      <div aria-live="polite" className="min-h-5 text-sm">
        {state.status === "success" && (
          <p className="text-green-700 dark:text-green-400">Profile saved.</p>
        )}
        {state.status === "error" && (
          <p className="text-red-600 dark:text-red-400">Please fix the highlighted fields.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
