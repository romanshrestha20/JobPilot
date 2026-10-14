/** Joins class names, skipping falsy values. Variants are mutually exclusive, so no merging is needed. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
