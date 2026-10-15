import { z } from "zod";
import { cleanSkillName, toSkillKey } from "./skill-key";

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

export const SKILL_LIMITS = {
  maxSkills: 50,
  nameMax: 80,
  evidenceMax: 500,
  yearsMax: 60,
} as const;

// Control characters (other than line breaks and tabs in evidence) never belong in a skill.
const hasControlCharacters = (value: string, allowWhitespace: boolean) =>
  (allowWhitespace ? /[^\P{Cc}\n\r\t]/u : /\p{Cc}/u).test(value) || /\p{Cf}/u.test(value);

/**
 * Editable skill fields. Strict on purpose: `id`, `userId`, `skillKey`, timestamps and any other
 * unknown key are rejected instead of silently ignored, so ownership and the canonical key can
 * never be set through client input. An edit replaces all four fields.
 */
export const skillInputSchema = z.strictObject({
  name: z
    .string()
    .refine((value) => !hasControlCharacters(value, false), "Remove special characters.")
    .transform(cleanSkillName)
    .pipe(
      z
        .string()
        .min(1, "Enter a skill name.")
        .max(SKILL_LIMITS.nameMax, `Use at most ${SKILL_LIMITS.nameMax} characters.`)
        // Lowercasing can lengthen a few characters; the stored key has the same limit.
        .refine(
          (value) => toSkillKey(value).length <= SKILL_LIMITS.nameMax,
          `Use at most ${SKILL_LIMITS.nameMax} characters.`,
        ),
    ),
  level: z.enum(SKILL_LEVELS, "Choose a level from the list.").nullable(),
  yearsOfExperience: z
    .number("Enter a whole number of years.")
    .int("Enter a whole number of years.")
    .min(0, "Years cannot be negative.")
    .max(SKILL_LIMITS.yearsMax, `Use ${SKILL_LIMITS.yearsMax} years or fewer.`)
    .nullable(),
  evidence: z
    .string()
    .refine((value) => !hasControlCharacters(value, true), "Remove special characters.")
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(SKILL_LIMITS.evidenceMax, `Use at most ${SKILL_LIMITS.evidenceMax} characters.`),
    )
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

export type SkillInput = z.output<typeof skillInputSchema>;
/** Input plus the canonical key derived on the server from the name. */
export type SkillWrite = SkillInput & { skillKey: string };

export function toSkillWrite(input: SkillInput): SkillWrite {
  return { ...input, skillKey: toSkillKey(input.name) };
}

export const skillIdSchema = z.uuid();

/** What callers receive. Deliberately omits `userId`. */
export type CandidateSkillDto = {
  id: string;
  name: string;
  level: SkillLevel | null;
  yearsOfExperience: number | null;
  evidence: string | null;
  updatedAt: Date;
};
