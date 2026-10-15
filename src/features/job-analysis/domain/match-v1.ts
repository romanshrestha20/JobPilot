/**
 * Constants of the `match-v1` scoring version (docs/ai-architecture.md section 7). Changing
 * any value here (weights, credits, thresholds, label bands) requires a new version string and
 * updated tests; the skill dictionary version is part of the scoring version too.
 */
export const MATCH_VERSION = "match-v1";

export const COMPONENT_IDS = [
  "required_skills",
  "preferred_skills",
  "experience",
  "languages",
  "location_work_mode",
] as const;
export type ComponentId = (typeof COMPONENT_IDS)[number];

export const COMPONENT_WEIGHTS: Record<ComponentId, number> = {
  required_skills: 50,
  preferred_skills: 15,
  experience: 15,
  languages: 10,
  location_work_mode: 10,
};

/** Credits in half units, so all arithmetic stays in integers: 1.0 is 2 and 0.5 is 1. */
export const CREDIT_HALVES = { matched: 2, listed: 1, absent: 0 } as const;

/** Below this share of the total weight being assessable, no number is shown. */
export const MIN_COVERAGE = 50;

export const LABEL_BANDS = [
  { min: 80, label: "Strong overlap" },
  { min: 60, label: "Good overlap" },
  { min: 40, label: "Partial overlap" },
  { min: 0, label: "Limited overlap" },
] as const;
export type MatchLabel = (typeof LABEL_BANDS)[number]["label"];

/** Shown wherever a score is shown. The score is overlap with stated requirements only. */
export const MATCH_DISCLAIMER =
  "This measures how much of the requirements stated in this job description your profile covers. It is not a prediction of whether you will be invited or hired.";

export const INSUFFICIENT_INFORMATION_MESSAGE = "Not enough information to score";
export const NO_REQUIREMENTS_MESSAGE = "No requirements found in this job description";

export const COMPONENT_LABELS: Record<ComponentId, string> = {
  required_skills: "Required skills",
  preferred_skills: "Preferred skills",
  experience: "Experience",
  languages: "Languages",
  location_work_mode: "Location and work mode",
};

export type NotAssessableReason =
  | "job_lists_none"
  | "job_states_no_minimum"
  | "job_requires_no_languages"
  | "job_states_no_work_mode"
  | "profile_has_no_skills"
  | "profile_has_no_years"
  | "profile_lists_no_languages"
  | "profile_has_no_work_modes"
  | "no_comparable_skills";

export const NOT_ASSESSABLE_TEXT: Record<NotAssessableReason, string> = {
  job_lists_none: "The job does not list any.",
  job_states_no_minimum: "The job does not state a minimum experience.",
  job_requires_no_languages: "The job does not require a language.",
  job_states_no_work_mode: "The job does not state a work mode.",
  profile_has_no_skills: "Add skills to your profile to compare.",
  profile_has_no_years: "Add your years of experience to your profile.",
  profile_lists_no_languages: "Add your languages to your profile.",
  profile_has_no_work_modes: "Add your preferred work modes to your profile.",
  no_comparable_skills: "None of the listed skills could be compared.",
};

/** Profile information that, if added, would let more of this job be assessed. */
export type MissingProfileItem =
  "skills" | "years_of_experience" | "languages" | "work_modes" | "location";

export const MISSING_PROFILE_TEXT: Record<MissingProfileItem, string> = {
  skills: "Add skills to your profile",
  years_of_experience: "Add your years of experience",
  languages: "Add your languages",
  work_modes: "Add your preferred work modes",
  location: "Add your location",
};

/** Things the job description did not state. Missing is shown as missing, never as a gap. */
export type JobNotStatedItem =
  | "required_skills"
  | "preferred_skills"
  | "minimum_experience"
  | "required_languages"
  | "work_mode";

export const JOB_NOT_STATED_TEXT: Record<JobNotStatedItem, string> = {
  required_skills: "The job does not list required skills",
  preferred_skills: "The job does not list preferred skills",
  minimum_experience: "The job does not state a minimum experience",
  required_languages: "The job does not require a language",
  work_mode: "The job does not state a work mode",
};
