import { CREDIT_HALVES } from "./match-v1";
import type { GroundedSkill } from "./requirements";
import { normalizeSkillName } from "./skill-dictionary";
import { normalizeText } from "./text";

/**
 * One skill from the candidate's own profile, as the scorer sees it. Defined here (not
 * imported from candidate-profile) so the domain stays independent of that module; the caller
 * maps its data into this shape. `level` is free text here because only its presence counts.
 */
export type MatchSkill = {
  name: string;
  level: string | null;
  yearsOfExperience: number | null;
  evidence: string | null;
};

export const SKILL_STATES = [
  "matched",
  "listed",
  "absent",
  "unmapped",
  "no_profile_skills",
] as const;
export type SkillState = (typeof SKILL_STATES)[number];

/** Why a skill has its state, in the words shown to the user (docs/ai-architecture.md 6.2). */
export const SKILL_STATE_REASONS: Record<SkillState, string> = {
  matched: "In your profile with level and detail",
  listed: "In your profile, but without level or evidence. Add detail to count fully.",
  absent: "Not in your profile",
  unmapped: "We could not compare this requirement. Review it yourself.",
  no_profile_skills: "Add skills to your profile to compare",
};

/** What the profile says about a skill; copied from the candidate's own entry, never inferred. */
export type CandidateSkillFacts = {
  name: string;
  level: string | null;
  yearsOfExperience: number | null;
  evidence: string | null;
  described: boolean;
};

export type CandidateSkillIndex = {
  /** Number of usable skills in the profile; zero means nothing can be compared. */
  count: number;
  byKey: ReadonlyMap<string, CandidateSkillFacts>;
};

const hasText = (value: string | null): boolean => value !== null && value.trim() !== "";

/**
 * Described: a level and at least one of years or evidence. Anything less is merely listed.
 */
export function isDescribed(skill: Pick<MatchSkill, "level" | "yearsOfExperience" | "evidence">) {
  return hasText(skill.level) && (skill.yearsOfExperience !== null || hasText(skill.evidence));
}

function betterOf(a: CandidateSkillFacts, b: CandidateSkillFacts): CandidateSkillFacts {
  if (a.described !== b.described) return a.described ? a : b;
  const yearsA = a.yearsOfExperience ?? -1;
  const yearsB = b.yearsOfExperience ?? -1;
  if (yearsA !== yearsB) return yearsA > yearsB ? a : b;
  return normalizeText(a.name) <= normalizeText(b.name) ? a : b;
}

/**
 * Indexes the profile's skills by canonical key, mapping every name through the versioned
 * dictionary at comparison time, so "postgres" and "PostgreSQL" are one skill without the
 * stored rows changing. When several spellings map to one key the most detailed one wins; the
 * choice does not depend on input order.
 */
export function indexCandidateSkills(skills: readonly MatchSkill[]): CandidateSkillIndex {
  const byKey = new Map<string, CandidateSkillFacts>();
  let count = 0;
  for (const skill of skills) {
    if (normalizeText(skill.name) === "") continue;
    count += 1;
    const key = normalizeSkillName(skill.name).key;
    const facts: CandidateSkillFacts = {
      name: skill.name,
      level: skill.level,
      yearsOfExperience: skill.yearsOfExperience,
      evidence: skill.evidence,
      described: isDescribed(skill),
    };
    const existing = byKey.get(key);
    byKey.set(key, existing ? betterOf(existing, facts) : facts);
  }
  return { count, byKey };
}

export type SkillClassification = {
  /** Comparison key and display name after normalizing again through the current dictionary. */
  key: string;
  name: string;
  mapped: boolean;
  state: SkillState;
  /** Credit in half units (2, 1, 0), or null when the skill cannot be assessed. */
  creditHalves: number | null;
  candidate: CandidateSkillFacts | null;
};

/**
 * Classifies one requirement against the profile. The stored `key` and `mapped` flag of the
 * requirement are not trusted: the name is normalized again, so a dictionary update applies
 * to old analyses. Unmapped requirements and an empty profile are "not assessable", never a gap.
 */
export function classifyRequirementSkill(
  skill: Pick<GroundedSkill, "name">,
  index: CandidateSkillIndex,
): SkillClassification {
  const normalized = normalizeSkillName(skill.name);
  const base = { key: normalized.key, name: normalized.name, mapped: normalized.mapped };

  if (!normalized.mapped) {
    return { ...base, state: "unmapped", creditHalves: null, candidate: null };
  }
  if (index.count === 0) {
    return { ...base, state: "no_profile_skills", creditHalves: null, candidate: null };
  }
  const candidate = index.byKey.get(normalized.key) ?? null;
  if (candidate === null) {
    return { ...base, state: "absent", creditHalves: CREDIT_HALVES.absent, candidate: null };
  }
  return candidate.described
    ? { ...base, state: "matched", creditHalves: CREDIT_HALVES.matched, candidate }
    : { ...base, state: "listed", creditHalves: CREDIT_HALVES.listed, candidate };
}
