import { z } from "zod";

export const JOB_LIMITS = {
  title: 200,
  company: 200,
  location: 200,
  sourceUrl: 2048,
  description: 20_000,
} as const;

// Single-line fields: no control characters (newlines, NUL, ...).
const CONTROL = /[\u0000-\u001f\u007f]/;
// Descriptions may contain tabs and line breaks, but never NUL or other control characters
// (PostgreSQL rejects NUL, and the others have no place in a posting).
const DESCRIPTION_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const requiredLine = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`)
    .refine((value) => !CONTROL.test(value), `${label} must be a single line of plain text.`);

const optionalLine = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .refine((value) => !CONTROL.test(value), `${label} must be a single line of plain text.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const optionalHttpUrl = z
  .string()
  .trim()
  .max(JOB_LIMITS.sourceUrl, `Link must be at most ${JOB_LIMITS.sourceUrl} characters.`)
  .refine((value) => !CONTROL.test(value) && !/\s/.test(value), "Enter a valid web address.")
  .refine((value) => {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      );
    } catch {
      return false;
    }
  }, "Enter a link starting with http:// or https:// (without a username or password).")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const description = z
  .string()
  // Normalize line endings only; the rest of the text is kept as written.
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .min(1, "Description is required.")
      .max(
        JOB_LIMITS.description,
        `Description must be at most ${JOB_LIMITS.description} characters.`,
      )
      .refine(
        (value) => !DESCRIPTION_CONTROL.test(value),
        "Description contains invalid characters.",
      ),
  );

/**
 * Fields a user may submit. Strict on purpose: `id`, `userId`, timestamps and any other
 * unknown key are rejected instead of ignored, so ownership can never come from client input.
 */
export const jobInputSchema = z.strictObject({
  title: requiredLine("Title", JOB_LIMITS.title),
  company: requiredLine("Company", JOB_LIMITS.company),
  location: optionalLine("Location", JOB_LIMITS.location),
  sourceUrl: optionalHttpUrl,
  description,
});

export type JobInput = z.output<typeof jobInputSchema>;

export const jobIdSchema = z.uuid();

/** Full posting as returned to the owner. */
export type JobDto = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  sourceUrl: string | null;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

/** List rows omit the (large) description. */
export type JobSummaryDto = Omit<JobDto, "description" | "updatedAt">;
