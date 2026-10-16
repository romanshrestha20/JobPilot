import {
  COMPONENT_LABELS,
  INSUFFICIENT_INFORMATION_MESSAGE,
  JOB_NOT_STATED_TEXT,
  MISSING_PROFILE_TEXT,
  NOT_ASSESSABLE_TEXT,
  NO_REQUIREMENTS_MESSAGE,
  SKILL_STATE_REASONS,
  type MatchBreakdown,
  type SkillState,
} from "@/features/job-analysis";

/** Visible text for each skill state. The state is always words, never colour alone. */
export const SKILL_STATE_LABELS: Record<SkillState, string> = {
  matched: "Matched",
  listed: "Listed",
  absent: "Not in your profile",
  unmapped: "Not compared",
  no_profile_skills: "Needs profile skills",
};

export type SkillRow = {
  key: string;
  name: string;
  stateLabel: string;
  reason: string;
  /** Text copied from the job description (untrusted; rendered as plain text). */
  quote: string;
  /** What the user's own entry says, e.g. "Advanced · 4 years"; null when not listed. */
  yourEntry: string | null;
};

export type ComponentRow = {
  id: string;
  label: string;
  weightText: string;
  /** "75%" for an assessed component, "Not assessed" otherwise. */
  resultText: string;
  /** Why it was not assessed; null when it was. */
  note: string | null;
};

export type MatchView = {
  status: MatchBreakdown["status"];
  headline: string;
  /** Screen-reader sentence for the headline. */
  summary: string;
  label: string | null;
  coverageText: string;
  versionText: string;
  disclaimer: string;
  components: ComponentRow[];
  required: SkillRow[];
  preferred: SkillRow[];
  /** What to add to the profile; each item is a prompt, the page links them to the profile. */
  missingProfile: string[];
  jobNotStated: string[];
  /** Requirements that are not in the skill list, so they were not compared. */
  unmappedNames: string[];
};

function yourEntry(candidate: MatchBreakdown["skills"][number]["candidate"]): string | null {
  if (!candidate) return null;
  const parts = [
    candidate.level ?? null,
    candidate.yearsOfExperience === null
      ? null
      : `${candidate.yearsOfExperience} year${candidate.yearsOfExperience === 1 ? "" : "s"}`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "Listed without level or years";
}

function toRow(skill: MatchBreakdown["skills"][number]): SkillRow {
  return {
    key: `${skill.list}:${skill.key}`,
    name: skill.name,
    stateLabel: SKILL_STATE_LABELS[skill.state],
    reason: SKILL_STATE_REASONS[skill.state],
    quote: skill.quote,
    yourEntry: yourEntry(skill.candidate),
  };
}

/** Turns a `match-v1` breakdown into display text. No scoring happens here. */
export function presentMatch(breakdown: MatchBreakdown): MatchView {
  const scored = breakdown.status === "scored" && breakdown.score !== null;
  const headline = scored
    ? `${breakdown.score} out of 100`
    : breakdown.status === "no_requirements"
      ? NO_REQUIREMENTS_MESSAGE
      : INSUFFICIENT_INFORMATION_MESSAGE;

  return {
    status: breakdown.status,
    headline,
    summary: scored ? `Match score ${breakdown.score} out of 100, ${breakdown.label}` : headline,
    label: scored ? breakdown.label : null,
    coverageText: `${breakdown.coverage}% of the scoring weight could be assessed`,
    versionText: `Scoring ${breakdown.version}, skill list ${breakdown.dictionaryVersion}`,
    disclaimer: breakdown.disclaimer,
    components: breakdown.components.map((component) => ({
      id: component.id,
      label: COMPONENT_LABELS[component.id],
      weightText: `${component.weight}%`,
      resultText: component.assessable ? `${Math.round(component.score * 100)}%` : "Not assessed",
      note: component.assessable ? null : NOT_ASSESSABLE_TEXT[component.reason],
    })),
    required: breakdown.skills.filter((s) => s.list === "required").map(toRow),
    preferred: breakdown.skills.filter((s) => s.list === "preferred").map(toRow),
    missingProfile: breakdown.missingProfileData.map((item) => MISSING_PROFILE_TEXT[item]),
    jobNotStated: breakdown.jobNotStated.map((item) => JOB_NOT_STATED_TEXT[item]),
    unmappedNames: breakdown.skills.filter((s) => !s.mapped).map((s) => s.name),
  };
}
