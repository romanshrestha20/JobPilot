import { z } from "zod";

/** Bump when the shape changes, so stored or evaluated results can be told apart. */
export const REQUIREMENTS_SCHEMA_VERSION = 1;

export const REQUIREMENT_LIMITS = {
  skills: 30,
  skillName: 80,
  quote: 200,
  languages: 10,
  language: 50,
  locations: 5,
  location: 120,
  maxYears: 60,
} as const;

// Control and format characters never belong in extracted text.
const cleanText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Remove special characters.");

const skillSchema = z.strictObject({
  name: cleanText(REQUIREMENT_LIMITS.skillName),
  // Text copied from the job description; grounding checks it really appears there.
  quote: cleanText(REQUIREMENT_LIMITS.quote),
});

/**
 * What the model is asked to return, and the only shape accepted from it. Strict: unknown
 * keys are rejected. "Not stated" is `null` or `[]`, never a guess. It contains no candidate
 * data and no free-form prose.
 */
export const jobRequirementsSchema = z.strictObject({
  schemaVersion: z.literal(REQUIREMENTS_SCHEMA_VERSION),
  requiredSkills: z.array(skillSchema).max(REQUIREMENT_LIMITS.skills),
  preferredSkills: z.array(skillSchema).max(REQUIREMENT_LIMITS.skills),
  minYearsExperience: z.number().int().min(0).max(REQUIREMENT_LIMITS.maxYears).nullable(),
  languages: z
    .array(
      z.strictObject({
        language: cleanText(REQUIREMENT_LIMITS.language),
        required: z.boolean(),
      }),
    )
    .max(REQUIREMENT_LIMITS.languages),
  workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
  locations: z.array(cleanText(REQUIREMENT_LIMITS.location)).max(REQUIREMENT_LIMITS.locations),
});

export type JobRequirements = z.output<typeof jobRequirementsSchema>;
export type WorkMode = NonNullable<JobRequirements["workMode"]>;

/** A requirement skill after grounding and normalization. */
export type GroundedSkill = {
  /** Canonical key from the dictionary, or the normalized name when `mapped` is false. */
  key: string;
  name: string;
  /** False when the name is not in the dictionary: shown, but not comparable yet. */
  mapped: boolean;
  quote: string;
};

export type GroundedRequirements = {
  schemaVersion: typeof REQUIREMENTS_SCHEMA_VERSION;
  dictionaryVersion: string;
  requiredSkills: GroundedSkill[];
  preferredSkills: GroundedSkill[];
  minYearsExperience: number | null;
  languages: { language: string; required: boolean }[];
  workMode: WorkMode | null;
  locations: string[];
  /** Items the model claimed that the job text does not support. They are removed, not kept. */
  droppedUngrounded: number;
};

const groundedSkillSchema = z.strictObject({
  key: z.string().min(1).max(REQUIREMENT_LIMITS.skillName),
  name: cleanText(REQUIREMENT_LIMITS.skillName),
  mapped: z.boolean(),
  quote: cleanText(REQUIREMENT_LIMITS.quote),
});

/**
 * The shape stored in `job_analysis.requirements`. The worker validates a result against it
 * before saving, and reading validates again, so a damaged or hand-edited row is refused
 * instead of being scored.
 */
export const groundedRequirementsSchema = z.strictObject({
  schemaVersion: z.literal(REQUIREMENTS_SCHEMA_VERSION),
  dictionaryVersion: z.string().min(1).max(50),
  requiredSkills: z.array(groundedSkillSchema).max(REQUIREMENT_LIMITS.skills),
  preferredSkills: z.array(groundedSkillSchema).max(REQUIREMENT_LIMITS.skills),
  minYearsExperience: z.number().int().min(0).max(REQUIREMENT_LIMITS.maxYears).nullable(),
  languages: z
    .array(
      z.strictObject({
        language: cleanText(REQUIREMENT_LIMITS.language),
        required: z.boolean(),
      }),
    )
    .max(REQUIREMENT_LIMITS.languages),
  workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
  locations: z.array(cleanText(REQUIREMENT_LIMITS.location)).max(REQUIREMENT_LIMITS.locations),
  droppedUngrounded: z.number().int().min(0),
});
