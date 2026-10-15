/** Collapses runs of whitespace and trims; the form a skill name is displayed and stored in. */
export function cleanSkillName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/**
 * Canonical comparison key: the cleaned name, lowercased. "TypeScript", " typescript " and
 * "TYPESCRIPT" share a key, so the per-user uniqueness rule cannot be dodged by casing or
 * spacing. Punctuation is kept on purpose ("C++", "C#" and "C" stay different skills).
 *
 * This is the placeholder for the versioned skill dictionary planned for the matching domain
 * (docs/ai-architecture.md section 6): until aliases such as "postgres" and "postgresql" are
 * mapped, they are two different keys.
 */
export function toSkillKey(name: string): string {
  return cleanSkillName(name).toLowerCase();
}
