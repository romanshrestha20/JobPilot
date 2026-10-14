import type { ZodIssue } from "zod";

/** String-only shape used to echo the form back after a validation error. */
export type JobFormValues = {
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
  description: string;
};

export type JobFormState =
  | { status: "idle"; values: JobFormValues }
  | { status: "error"; values: JobFormValues; fieldErrors: Record<string, string> };

export const EMPTY_JOB_FORM: JobFormValues = {
  title: "",
  company: "",
  location: "",
  sourceUrl: "",
  description: "",
};

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

/**
 * Reads named fields only, so unexpected form fields (including `userId` or `id`) are never
 * forwarded. The service's Zod schema does the real validation.
 */
export function readJobForm(formData: FormData): JobFormValues {
  return {
    title: text(formData, "title"),
    company: text(formData, "company"),
    location: text(formData, "location"),
    sourceUrl: text(formData, "sourceUrl"),
    description: text(formData, "description"),
  };
}

export function toFieldErrors(issues: readonly ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    errors[field] ??= issue.message;
  }
  return errors;
}
