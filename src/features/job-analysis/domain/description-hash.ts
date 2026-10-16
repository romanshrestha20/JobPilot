import { createHash } from "node:crypto";

/**
 * Whitespace-insensitive form of a job description: Unicode NFC, runs of whitespace
 * collapsed, ends trimmed. Case is kept, so a real wording change always changes the hash.
 */
export function normalizeDescription(description: string): string {
  return description.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** sha256 (lowercase hex) of the normalized description; stored with a run to detect staleness. */
export function hashDescription(description: string): string {
  return createHash("sha256").update(normalizeDescription(description), "utf8").digest("hex");
}
