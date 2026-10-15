import { placeAppearsIn } from "./location-match";
import {
  COMPONENT_IDS,
  COMPONENT_WEIGHTS,
  LABEL_BANDS,
  MATCH_DISCLAIMER,
  MATCH_VERSION,
  MIN_COVERAGE,
  type ComponentId,
  type JobNotStatedItem,
  type MatchLabel,
  type MissingProfileItem,
  type NotAssessableReason,
} from "./match-v1";
import type { GroundedRequirements, WorkMode } from "./requirements";
import {
  SKILL_DICTIONARY_VERSION,
  normalizeLanguage,
  normalizeSkillName,
} from "./skill-dictionary";
import {
  classifyRequirementSkill,
  indexCandidateSkills,
  type CandidateSkillFacts,
  type CandidateSkillIndex,
  type MatchSkill,
  type SkillState,
} from "./skill-state";
import { normalizeText } from "./text";

/** The candidate data the scorer reads. It is compared locally and never sent to a model. */
export type MatchProfile = {
  skills: readonly MatchSkill[];
  yearsOfExperience: number | null;
  languages: readonly string[];
  workModes: readonly WorkMode[];
  location: string | null;
};

export type ComponentResult =
  | { id: ComponentId; weight: number; assessable: true; score: number }
  | { id: ComponentId; weight: number; assessable: false; reason: NotAssessableReason };

export type SkillResult = {
  list: "required" | "preferred";
  key: string;
  name: string;
  mapped: boolean;
  state: SkillState;
  /** 1, 0.5 or 0; null when the skill could not be assessed. */
  credit: 1 | 0.5 | 0 | null;
  /** The sentence of the job description the requirement came from. */
  quote: string;
  /** What the candidate's own profile says about this skill; null when it does not list it. */
  candidate: Pick<CandidateSkillFacts, "name" | "level" | "yearsOfExperience" | "evidence"> | null;
};

export type MatchStatus = "scored" | "insufficient_information" | "no_requirements";

export type MatchBreakdown = {
  version: typeof MATCH_VERSION;
  dictionaryVersion: string;
  status: MatchStatus;
  /** Integer 0 to 100, or null unless `status` is "scored". */
  score: number | null;
  /** Percent of the total weight that could be assessed. */
  coverage: number;
  label: MatchLabel | null;
  components: ComponentResult[];
  skills: SkillResult[];
  missingProfileData: MissingProfileItem[];
  jobNotStated: JobNotStatedItem[];
  disclaimer: typeof MATCH_DISCLAIMER;
};

/** An exact share, so no floating-point value ever decides a rounding. */
type Fraction = { numerator: number; denominator: number };

type Evaluated =
  { assessable: true; fraction: Fraction } | { assessable: false; reason: NotAssessableReason };

const notAssessable = (reason: NotAssessableReason): Evaluated => ({ assessable: false, reason });
const assessed = (numerator: number, denominator: number): Evaluated => ({
  assessable: true,
  fraction: { numerator, denominator },
});

type JobSkill = { list: "required" | "preferred"; name: string; quote: string };

/** Drops repeats by comparison key; a skill named as required and preferred counts as required. */
function collectJobSkills(requirements: GroundedRequirements): JobSkill[] {
  const seen = new Set<string>();
  const result: JobSkill[] = [];
  const add = (list: JobSkill["list"], skills: GroundedRequirements["requiredSkills"]) => {
    for (const skill of skills) {
      const { key } = normalizeSkillName(skill.name);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ list, name: skill.name, quote: skill.quote });
    }
  };
  add("required", requirements.requiredSkills);
  add("preferred", requirements.preferredSkills);
  return result;
}

function evaluateSkillList(
  results: readonly SkillResult[],
  list: SkillResult["list"],
  index: CandidateSkillIndex,
): Evaluated {
  const items = results.filter((skill) => skill.list === list);
  if (items.length === 0) return notAssessable("job_lists_none");
  if (index.count === 0 && items.some((skill) => skill.state === "no_profile_skills")) {
    return notAssessable("profile_has_no_skills");
  }
  const assessable = items.filter((skill) => skill.credit !== null);
  if (assessable.length === 0) return notAssessable("no_comparable_skills");
  const halves = assessable.reduce((sum, skill) => sum + (skill.credit ?? 0) * 2, 0);
  return assessed(halves, 2 * assessable.length);
}

function evaluateExperience(minYears: number | null, profileYears: number | null): Evaluated {
  if (minYears === null) return notAssessable("job_states_no_minimum");
  if (profileYears === null) return notAssessable("profile_has_no_years");
  // No bonus above the minimum; a minimum of 0 is always met.
  if (minYears === 0 || profileYears >= minYears) return assessed(1, 1);
  return assessed(profileYears, minYears);
}

function evaluateLanguages(
  job: GroundedRequirements["languages"],
  profileLanguages: readonly string[],
): Evaluated {
  const fold = (language: string) => normalizeText(normalizeLanguage(language));
  const required = [...new Set(job.filter((l) => l.required).map((l) => fold(l.language)))];
  if (required.length === 0) return notAssessable("job_requires_no_languages");
  const known = new Set(profileLanguages.map(fold).filter((language) => language !== ""));
  if (known.size === 0) return notAssessable("profile_lists_no_languages");
  return assessed(required.filter((language) => known.has(language)).length, required.length);
}

/**
 * How well one profile work mode fits the job's, in half units: the same mode is 2, hybrid
 * against either remote or onsite is 1, remote against onsite is 0.
 */
function modeFitHalves(job: WorkMode, profile: WorkMode): number {
  if (job === profile) return 2;
  return job === "hybrid" || profile === "hybrid" ? 1 : 0;
}

function evaluateLocationAndMode(
  requirements: GroundedRequirements,
  profile: MatchProfile,
): Evaluated {
  const { workMode, locations } = requirements;
  // Without a stated work mode there is nothing to score, even if a place is named.
  if (workMode === null) return notAssessable("job_states_no_work_mode");
  if (profile.workModes.length === 0) return notAssessable("profile_has_no_work_modes");

  const modeHalves = Math.max(...profile.workModes.map((mode) => modeFitHalves(workMode, mode)));
  const profileLocation = profile.location?.trim() ?? "";
  const penalised =
    workMode !== "remote" &&
    locations.length > 0 &&
    profileLocation !== "" &&
    !locations.some((place) => placeAppearsIn(place, profileLocation));
  return penalised ? assessed(modeHalves, 4) : assessed(modeHalves, 2);
}

/** round_half_up(100 * sum(weight * share) / assessableWeight), in exact integer arithmetic. */
function roundedScore(parts: readonly { weight: number; fraction: Fraction }[]): number {
  // Every value is a small integer (weights sum to 100, denominators are at most 60, 10 or 4),
  // so the products stay far below 2^53 and nothing is ever rounded before the final step.
  const assessableWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const common = parts.reduce((product, part) => product * part.fraction.denominator, 1);
  const numerator = parts.reduce(
    (sum, part) =>
      sum + part.weight * part.fraction.numerator * (common / part.fraction.denominator),
    0,
  );
  const denominator = assessableWeight * common;
  const scaled = 200 * numerator + denominator;
  if (!Number.isSafeInteger(scaled)) throw new Error("Score arithmetic left the exact range.");
  // Integer division without a floating-point quotient: (a - a % b) / b is exact.
  const divisor = 2 * denominator;
  return (scaled - (scaled % divisor)) / divisor;
}

function labelFor(score: number): MatchLabel {
  return (LABEL_BANDS.find((band) => score >= band.min) ?? LABEL_BANDS[LABEL_BANDS.length - 1])
    .label;
}

const byListThenKey = (a: SkillResult, b: SkillResult) =>
  a.list === b.list ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.list === "required" ? -1 : 1;

/**
 * `match-v1`: how much of the requirements stated in a job description the candidate's own
 * profile covers. Pure and deterministic: no database, model, clock or locale. Components that
 * cannot be assessed (because the job or the profile does not say) are removed from the
 * calculation, so missing information neither raises nor lowers the score; below
 * `MIN_COVERAGE` no number is given at all. It is not a prediction of being hired.
 */
export function scoreMatch(
  requirements: GroundedRequirements,
  profile: MatchProfile,
): MatchBreakdown {
  const index = indexCandidateSkills(profile.skills);

  const skills: SkillResult[] = collectJobSkills(requirements)
    .map((job): SkillResult => {
      const result = classifyRequirementSkill({ name: job.name }, index);
      return {
        list: job.list,
        key: result.key,
        name: result.name,
        mapped: result.mapped,
        state: result.state,
        credit: result.creditHalves === null ? null : ((result.creditHalves / 2) as 1 | 0.5 | 0),
        quote: job.quote,
        candidate: result.candidate && {
          name: result.candidate.name,
          level: result.candidate.level,
          yearsOfExperience: result.candidate.yearsOfExperience,
          evidence: result.candidate.evidence,
        },
      };
    })
    .sort(byListThenKey);

  const evaluated: Record<ComponentId, Evaluated> = {
    required_skills: evaluateSkillList(skills, "required", index),
    preferred_skills: evaluateSkillList(skills, "preferred", index),
    experience: evaluateExperience(requirements.minYearsExperience, profile.yearsOfExperience),
    languages: evaluateLanguages(requirements.languages, profile.languages),
    location_work_mode: evaluateLocationAndMode(requirements, profile),
  };

  const components: ComponentResult[] = COMPONENT_IDS.map((id) => {
    const result = evaluated[id];
    const weight = COMPONENT_WEIGHTS[id];
    return result.assessable
      ? {
          id,
          weight,
          assessable: true,
          score: result.fraction.numerator / result.fraction.denominator,
        }
      : { id, weight, assessable: false, reason: result.reason };
  });

  const assessableParts = COMPONENT_IDS.flatMap((id) => {
    const result = evaluated[id];
    return result.assessable ? [{ weight: COMPONENT_WEIGHTS[id], fraction: result.fraction }] : [];
  });
  const totalWeight = COMPONENT_IDS.reduce((sum, id) => sum + COMPONENT_WEIGHTS[id], 0);
  const coverage = Math.round(
    (assessableParts.reduce((sum, part) => sum + part.weight, 0) * 100) / totalWeight,
  );

  const lists = new Set(skills.map((skill) => skill.list));
  const comparableSkills = skills.some((skill) => skill.mapped);
  const requiredLanguages = requirements.languages.some((language) => language.required);
  const statesNothing =
    skills.length === 0 &&
    requirements.minYearsExperience === null &&
    !requiredLanguages &&
    requirements.workMode === null &&
    requirements.locations.length === 0;

  const missingProfileData: MissingProfileItem[] = [];
  if (index.count === 0 && comparableSkills) missingProfileData.push("skills");
  if (profile.yearsOfExperience === null && requirements.minYearsExperience !== null) {
    missingProfileData.push("years_of_experience");
  }
  if (requiredLanguages && !profile.languages.some((l) => normalizeText(l) !== "")) {
    missingProfileData.push("languages");
  }
  if (requirements.workMode !== null && profile.workModes.length === 0) {
    missingProfileData.push("work_modes");
  }
  if (
    requirements.workMode !== null &&
    requirements.workMode !== "remote" &&
    requirements.locations.length > 0 &&
    (profile.location ?? "").trim() === ""
  ) {
    missingProfileData.push("location");
  }

  const jobNotStated: JobNotStatedItem[] = [];
  if (!lists.has("required")) jobNotStated.push("required_skills");
  if (!lists.has("preferred")) jobNotStated.push("preferred_skills");
  if (requirements.minYearsExperience === null) jobNotStated.push("minimum_experience");
  if (!requiredLanguages) jobNotStated.push("required_languages");
  if (requirements.workMode === null) jobNotStated.push("work_mode");

  const base = {
    version: MATCH_VERSION,
    dictionaryVersion: SKILL_DICTIONARY_VERSION,
    components,
    skills,
    missingProfileData,
    jobNotStated,
    disclaimer: MATCH_DISCLAIMER,
  } as const;

  if (statesNothing) {
    return { ...base, status: "no_requirements", score: null, coverage: 0, label: null };
  }
  if (coverage < MIN_COVERAGE || assessableParts.length === 0) {
    return { ...base, status: "insufficient_information", score: null, coverage, label: null };
  }
  const score = roundedScore(assessableParts);
  return { ...base, status: "scored", score, coverage, label: labelFor(score) };
}
