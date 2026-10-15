import { normalizeText } from "./text";

/**
 * Starter skill dictionary. Small, explicit and versioned on purpose: it maps spellings of
 * well-known skills to one canonical key. Anything else stays "unmapped" (kept, flagged,
 * not comparable). Changing an entry changes what a key means, so bump the version.
 * A larger, maintained dictionary (and `skill` tables) is a later decision.
 */
export const SKILL_DICTIONARY_VERSION = "skills-v1";

type Entry = {
  key: string;
  name: string;
  aliases?: string[];
  /** Spellings that are too ambiguous to find in free text ("go", "r"), though fine as a full name. */
  noScan?: string[];
};

const ENTRIES: Entry[] = [
  { key: "javascript", name: "JavaScript", aliases: ["js", "ecmascript"] },
  { key: "typescript", name: "TypeScript", aliases: ["ts"], noScan: ["ts"] },
  { key: "python", name: "Python", aliases: ["python3"] },
  { key: "java", name: "Java" },
  { key: "kotlin", name: "Kotlin" },
  { key: "swift", name: "Swift" },
  { key: "c", name: "C", noScan: ["c"] },
  { key: "c++", name: "C++", aliases: ["cpp"] },
  { key: "c#", name: "C#", aliases: ["csharp", "c sharp"] },
  { key: "go", name: "Go", aliases: ["golang"], noScan: ["go"] },
  { key: "rust", name: "Rust" },
  { key: "ruby", name: "Ruby" },
  { key: "php", name: "PHP" },
  { key: "sql", name: "SQL" },
  { key: "html", name: "HTML", aliases: ["html5"] },
  { key: "css", name: "CSS", aliases: ["css3"] },
  { key: "react", name: "React", aliases: ["reactjs", "react.js"] },
  { key: "next.js", name: "Next.js", aliases: ["nextjs", "next"], noScan: ["next"] },
  { key: "vue", name: "Vue", aliases: ["vuejs", "vue.js"] },
  { key: "angular", name: "Angular", aliases: ["angularjs"] },
  { key: "node.js", name: "Node.js", aliases: ["node", "nodejs"] },
  { key: "express", name: "Express", aliases: ["expressjs", "express.js"], noScan: ["express"] },
  { key: "django", name: "Django" },
  { key: "flask", name: "Flask" },
  { key: "spring", name: "Spring", aliases: ["spring boot"], noScan: ["spring"] },
  { key: ".net", name: ".NET", aliases: ["dotnet", "dot net"] },
  { key: "graphql", name: "GraphQL" },
  { key: "postgresql", name: "PostgreSQL", aliases: ["postgres", "psql"] },
  { key: "mysql", name: "MySQL" },
  { key: "mongodb", name: "MongoDB", aliases: ["mongo"] },
  { key: "redis", name: "Redis" },
  { key: "elasticsearch", name: "Elasticsearch" },
  { key: "docker", name: "Docker" },
  { key: "kubernetes", name: "Kubernetes", aliases: ["k8s"] },
  { key: "terraform", name: "Terraform" },
  { key: "aws", name: "AWS", aliases: ["amazon web services"] },
  { key: "azure", name: "Azure", aliases: ["microsoft azure"] },
  { key: "gcp", name: "GCP", aliases: ["google cloud", "google cloud platform"] },
  { key: "git", name: "Git" },
  { key: "linux", name: "Linux" },
  { key: "ci/cd", name: "CI/CD", aliases: ["cicd", "continuous integration"] },
  { key: "rest", name: "REST", aliases: ["rest api", "restful", "restful api"] },
  { key: "tailwind css", name: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"] },
  { key: "machine learning", name: "Machine Learning", aliases: ["ml"], noScan: ["ml"] },
];

type Lookup = { key: string; name: string };

const byAlias = new Map<string, Lookup>();
const spellingsByKey = new Map<string, string[]>();
for (const entry of ENTRIES) {
  const spellings = [
    ...new Set([entry.name, entry.key, ...(entry.aliases ?? [])].map(normalizeText)),
  ];
  spellingsByKey.set(entry.key, spellings);
  for (const spelling of spellings) {
    byAlias.set(spelling, { key: entry.key, name: entry.name });
  }
}

/** Every normalized spelling of a dictionary skill (name, key, aliases); empty for unknown keys. */
export function spellingsFor(key: string): string[] {
  return spellingsByKey.get(key) ?? [];
}

export type NormalizedSkill = { key: string; name: string; mapped: boolean };

/** Maps a skill name from the model to a canonical skill, or keeps it flagged as unmapped. */
export function normalizeSkillName(name: string): NormalizedSkill {
  const cleaned = normalizeText(name);
  const hit = byAlias.get(cleaned);
  return hit
    ? { ...hit, mapped: true }
    : { key: cleaned, name: name.normalize("NFKC").replace(/\s+/gu, " ").trim(), mapped: false };
}

/** Terms the demo provider looks for in free text, longest first so "Node.js" beats "node". */
export const SCAN_TERMS: { term: string; key: string; name: string }[] = ENTRIES.flatMap(
  (entry) => {
    const skip = new Set((entry.noScan ?? []).map(normalizeText));
    return [entry.name, ...(entry.aliases ?? [])]
      .filter((spelling) => !skip.has(normalizeText(spelling)))
      .map((term) => ({ term, key: entry.key, name: entry.name }));
  },
).sort((a, b) => b.term.length - a.term.length);

const LANGUAGES: Record<string, string> = {
  english: "English",
  german: "German",
  french: "French",
  spanish: "Spanish",
  italian: "Italian",
  portuguese: "Portuguese",
  dutch: "Dutch",
  polish: "Polish",
  nepali: "Nepali",
  hindi: "Hindi",
  arabic: "Arabic",
  mandarin: "Mandarin",
  japanese: "Japanese",
};

export function normalizeLanguage(language: string): string {
  const cleaned = normalizeText(language);
  return LANGUAGES[cleaned] ?? language.trim();
}

export const LANGUAGE_NAMES = Object.values(LANGUAGES);
