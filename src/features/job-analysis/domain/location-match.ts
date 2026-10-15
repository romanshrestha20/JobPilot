/**
 * Comparison form for place names: accents removed, lowercase, punctuation and runs of
 * whitespace collapsed to single spaces. "Zürich, CH" and "zurich ch" fold to the same text.
 */
export function foldPlace(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * True when `place` appears in `profileLocation` as whole words ("Helsinki" is in
 * "Helsinki, Finland", "Oslo" is not in "Moslo"). An empty place never matches.
 */
export function placeAppearsIn(place: string, profileLocation: string): boolean {
  const needle = foldPlace(place);
  if (needle === "") return false;
  return ` ${foldPlace(profileLocation)} `.includes(` ${needle} `);
}
