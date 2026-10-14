import { z } from "zod";

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/**
 * Editable profile fields. Strict on purpose: `id`, `userId`, timestamps and any other
 * unknown key are rejected instead of silently ignored, so ownership can never be
 * changed through client input. Every field is optional (partial update).
 */
export const profileInputSchema = z.strictObject({
  headline: optionalText(120).optional(),
  summary: optionalText(2000).optional(),
  location: optionalText(120).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).nullable().optional(),
  languages: z
    .array(z.string().trim().min(1).max(50))
    .max(20)
    .transform((values) => unique(values))
    .optional(),
  workModes: z
    .array(z.enum(WORK_MODES))
    .max(WORK_MODES.length)
    .transform((values) => unique(values))
    .optional(),
});

export type ProfileInput = z.output<typeof profileInputSchema>;

/** What callers receive. Deliberately omits `id` and `userId`. */
export type CandidateProfileDto = {
  headline: string | null;
  summary: string | null;
  location: string | null;
  yearsOfExperience: number | null;
  languages: string[];
  workModes: WorkMode[];
  updatedAt: Date;
};
