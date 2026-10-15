import { LANGUAGE_NAMES, SCAN_TERMS } from "./skill-dictionary";
import {
  REQUIREMENT_LIMITS,
  REQUIREMENTS_SCHEMA_VERSION,
  type JobRequirements,
  type WorkMode,
} from "./requirements";
import { NUMBER_WORDS, normalizeText } from "./text";

/** Shown wherever a result came from this extractor. It is keyword matching, not AI. */
export const DEMO_LABEL = "Demo extraction (no AI model)";

const PREFERRED_CUE = /nice[- ]to[- ]have|preferred|bonus|a plus|is a plus|desirable/iu;
const REQUIRED_CUE =
  /requirements?|required|must[- ]have|qualifications|responsibilities|you have/iu;

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");

const SKILL_PATTERNS = SCAN_TERMS.map((entry) => ({
  ...entry,
  // Not preceded or followed by letters, digits, "+" or "#": "Java" must not match "JavaScript".
  pattern: new RegExp(`(?<![\\p{L}\\p{N}_+#])${escape(entry.term)}(?![\\p{L}\\p{N}_+#])`, "iu"),
}));

const YEARS = new RegExp(
  `(?<![\\p{L}\\p{N}])(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})\\+?\\s*(?:years?|yrs?)(?![\\p{L}])`,
  "iu",
);

/**
 * Deterministic keyword extractor behind the demo provider. It finds dictionary skills, the
 * first "N years" phrase, language names and work-mode words. Everything it returns is copied
 * from the text, so it also passes grounding. It cannot understand context: treat its output
 * only as a stand-in for a model.
 */
export function demoExtractRequirements(jobText: string): JobRequirements {
  const required: JobRequirements["requiredSkills"] = [];
  const preferred: JobRequirements["preferredSkills"] = [];
  const seen = new Set<string>();
  const languages: JobRequirements["languages"] = [];
  let minYears: number | null = null;
  let workMode: WorkMode | null = null;

  let inPreferred = false;
  for (const line of jobText.split(/\r?\n/u)) {
    if (PREFERRED_CUE.test(line)) inPreferred = true;
    else if (REQUIRED_CUE.test(line)) inPreferred = false;

    // Longest terms first; blank out what matched so "Node.js" is not also read as "Node".
    let rest = line;
    for (const { pattern, key, name } of SKILL_PATTERNS) {
      const match = pattern.exec(rest);
      if (!match) continue;
      rest =
        rest.slice(0, match.index) +
        " ".repeat(match[0].length) +
        rest.slice(match.index + match[0].length);
      if (seen.has(key)) continue;
      seen.add(key);
      const skill = { name, quote: match[0].slice(0, REQUIREMENT_LIMITS.quote) };
      (inPreferred ? preferred : required).push(skill);
    }

    if (minYears === null) {
      const years = YEARS.exec(line);
      if (years) {
        const value = NUMBER_WORDS[years[1].toLowerCase()] ?? Number(years[1]);
        minYears = Math.min(value, REQUIREMENT_LIMITS.maxYears);
      }
    }

    const lower = normalizeText(line);
    for (const language of LANGUAGE_NAMES) {
      if (new RegExp(`(?<![\\p{L}])${language.toLowerCase()}(?![\\p{L}])`, "u").test(lower)) {
        if (!languages.some((entry) => entry.language === language)) {
          languages.push({ language, required: !inPreferred });
        }
      }
    }

    if (workMode === null) {
      if (/\bhybrid\b/u.test(lower)) workMode = "hybrid";
      else if (/\bremote(?:ly)?\b/u.test(lower)) workMode = "remote";
      else if (/\bon[- ]?site\b|\bin[- ]office\b/u.test(lower)) workMode = "onsite";
    }
  }

  return {
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    requiredSkills: required.slice(0, REQUIREMENT_LIMITS.skills),
    preferredSkills: preferred.slice(0, REQUIREMENT_LIMITS.skills),
    minYearsExperience: minYears,
    languages: languages.slice(0, REQUIREMENT_LIMITS.languages),
    workMode,
    locations: [],
  };
}
