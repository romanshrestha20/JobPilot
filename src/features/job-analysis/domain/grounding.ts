import {
  SKILL_DICTIONARY_VERSION,
  normalizeLanguage,
  normalizeSkillName,
  spellingsFor,
} from "./skill-dictionary";
import {
  REQUIREMENTS_SCHEMA_VERSION,
  type GroundedRequirements,
  type GroundedSkill,
  type JobRequirements,
} from "./requirements";
import { NUMBER_WORDS, normalizeText } from "./text";

const WORK_MODE_PATTERNS = {
  remote: /\bremote(?:ly)?\b|work from home|\bwfh\b/u,
  hybrid: /\bhybrid\b/u,
  onsite: /\bon[- ]?site\b|\bin[- ]office\b|\bin[- ]person\b/u,
} as const;

/** Whole-word containment, so "en" is not found inside "experience". Both sides are normalized. */
function containsWord(haystack: string, term: string): boolean {
  const needle = normalizeText(term);
  if (needle === "") return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}+#])${escaped}(?![\\p{L}\\p{N}+#])`, "u").test(haystack);
}

function yearsAreStated(text: string, years: number): boolean {
  const words = Object.entries(NUMBER_WORDS)
    .filter(([, value]) => value === years)
    .map(([word]) => word);
  const number = [String(years), ...words].join("|");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${number})\\+?\\s*(?:years?|yrs?)(?![\\p{L}])`,
    "u",
  ).test(text);
}

/**
 * Keeps only what the job text supports. `text` is the original job description; the model's
 * output is never trusted to describe it truthfully.
 *
 * - A skill is kept only if its `quote` appears in the text (normalized the same way on both
 *   sides) and the quote names the skill (its name or a dictionary alias, as a whole word).
 *   Otherwise it is dropped and counted.
 * - Minimum years, languages, work mode and locations are kept only if the text states them.
 * - Skill names map through the dictionary; unknown names are kept and flagged `mapped: false`.
 * - Duplicates collapse by key, and a skill listed as both required and preferred stays required.
 *
 * Limit: grounding proves that the text says something, not that the text is honest. A posting
 * that itself contains "Required: Kubernetes" yields that requirement.
 */
export function groundRequirements(raw: JobRequirements, jobText: string): GroundedRequirements {
  const haystack = normalizeText(jobText);
  let dropped = 0;

  const ground = (skills: JobRequirements["requiredSkills"]): GroundedSkill[] => {
    const kept: GroundedSkill[] = [];
    const seen = new Set<string>();
    for (const skill of skills) {
      const quote = normalizeText(skill.quote);
      if (quote === "" || !haystack.includes(quote)) {
        dropped += 1;
        continue;
      }
      const normalized = normalizeSkillName(skill.name);
      // The quote must be about this skill: a real sentence of the posting attached to an
      // unrelated skill name is not evidence for it.
      const spellings = normalized.mapped ? spellingsFor(normalized.key) : [normalized.key];
      if (!spellings.some((spelling) => containsWord(quote, spelling))) {
        dropped += 1;
        continue;
      }
      if (seen.has(normalized.key)) continue;
      seen.add(normalized.key);
      kept.push({ ...normalized, quote: skill.quote });
    }
    return kept;
  };

  const requiredSkills = ground(raw.requiredSkills);
  const requiredKeys = new Set(requiredSkills.map((skill) => skill.key));
  const preferredSkills = ground(raw.preferredSkills).filter(
    (skill) => !requiredKeys.has(skill.key),
  );

  let minYearsExperience = raw.minYearsExperience;
  if (minYearsExperience !== null && !yearsAreStated(haystack, minYearsExperience)) {
    dropped += 1;
    minYearsExperience = null;
  }

  const languages: GroundedRequirements["languages"] = [];
  for (const entry of raw.languages) {
    const language = normalizeLanguage(entry.language);
    if (!containsWord(haystack, language)) {
      dropped += 1;
    } else if (!languages.some((existing) => existing.language === language)) {
      languages.push({ language, required: entry.required });
    }
  }

  let workMode = raw.workMode;
  if (workMode !== null && !WORK_MODE_PATTERNS[workMode].test(haystack)) {
    dropped += 1;
    workMode = null;
  }

  const locations: string[] = [];
  for (const location of raw.locations) {
    if (!containsWord(haystack, location)) {
      dropped += 1;
    } else if (!locations.includes(location)) {
      locations.push(location);
    }
  }

  return {
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    dictionaryVersion: SKILL_DICTIONARY_VERSION,
    requiredSkills,
    preferredSkills,
    minYearsExperience,
    languages,
    workMode,
    locations,
    droppedUngrounded: dropped,
  };
}
