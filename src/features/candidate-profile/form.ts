import type { ZodIssue } from "zod";
import type { CandidateProfileDto } from "./validation";

/** String-only shape used to populate and echo the profile form. */
export type ProfileFormValues = {
  headline: string;
  summary: string;
  location: string;
  yearsOfExperience: string;
  languages: string;
  workModes: string[];
};

export type ProfileFormState =
  | { status: "idle"; values: ProfileFormValues }
  | { status: "success"; values: ProfileFormValues }
  | { status: "error"; values: ProfileFormValues; fieldErrors: Record<string, string> };

export const EMPTY_FORM_VALUES: ProfileFormValues = {
  headline: "",
  summary: "",
  location: "",
  yearsOfExperience: "",
  languages: "",
  workModes: [],
};

export function toFormValues(profile: CandidateProfileDto | null): ProfileFormValues {
  if (!profile) return EMPTY_FORM_VALUES;
  return {
    headline: profile.headline ?? "",
    summary: profile.summary ?? "",
    location: profile.location ?? "",
    yearsOfExperience: profile.yearsOfExperience === null ? "" : String(profile.yearsOfExperience),
    languages: profile.languages.join(", "),
    workModes: profile.workModes,
  };
}

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export function readFormValues(formData: FormData): ProfileFormValues {
  return {
    headline: text(formData, "headline"),
    summary: text(formData, "summary"),
    location: text(formData, "location"),
    yearsOfExperience: text(formData, "yearsOfExperience"),
    languages: text(formData, "languages"),
    workModes: formData.getAll("workModes").filter((v): v is string => typeof v === "string"),
  };
}

/**
 * Builds the raw input for the profile service from named form fields only, so
 * unexpected form fields (including `userId`) are never forwarded. The service's
 * Zod schema does the real validation.
 */
export function parseProfileForm(formData: FormData): unknown {
  const values = readFormValues(formData);
  const years = values.yearsOfExperience.trim();
  return {
    headline: values.headline,
    summary: values.summary,
    location: values.location,
    yearsOfExperience: years === "" ? null : Number(years),
    languages: values.languages
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean),
    workModes: values.workModes,
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
