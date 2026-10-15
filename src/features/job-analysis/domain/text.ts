/**
 * Comparison form used for grounding and for dictionary lookups: Unicode NFKC, lowercase,
 * whitespace collapsed. Matches how candidate skill keys are derived
 * (`candidate-profile/skills/skill-key.ts`), so the two sides can be compared later.
 */
export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

/** Spelled-out numbers recognised in "N years" phrases. */
export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};
