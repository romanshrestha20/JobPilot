/**
 * Approximate prompt-size estimate, used to refuse input that cannot fit a model's context
 * window before any request is made. It is deliberately conservative and deliberately simple:
 * a per-character cost by character class, times a safety factor. No tokenizer is involved.
 *
 * The weights were calibrated against token counts reported by the installed `bge-m3` model
 * (a proxy: not the chat model's tokenizer) for 20 000-character samples of English prose,
 * German prose, a dense skill list, Chinese prose and random symbols and digits. With the
 * safety factor the estimate stayed above each proxy count. That says nothing exact about
 * the configured chat model (for example a Qwen model): treat the estimate as approximate
 * until it has been re-calibrated against that model's tokenizer.
 */
export const TOKEN_ESTIMATE = {
  /** ASCII letters. English prose measured about 0.2 token per character. */
  letter: 0.22,
  /** Spaces, tabs and line breaks. Mostly absorbed into neighbouring tokens, never free. */
  whitespace: 0.05,
  /** ASCII digits and punctuation or symbols. Dense skill lists and symbol runs measured 0.5 to 0.75. */
  digitOrSymbol: 1.2,
  /** Everything outside ASCII (CJK, accents, emoji). Chinese prose measured about 0.57. */
  nonAscii: 0.6,
  /** Margin on top of the sum: the weights are fitted to a proxy tokenizer. */
  safetyFactor: 1.25,
} as const;

/** Chat-template markers and role tokens around each message, counted once per request. */
export const CHAT_TEMPLATE_OVERHEAD_TOKENS = 64;

/**
 * Context kept free for the answer. A typical extraction is well under this; the answer is
 * not capped (that is a separate setting), so this is a planning figure, not a limit.
 */
export const OUTPUT_RESERVE_TOKENS = 1536;

/** Estimated tokens for one string. Linear time, safe on very long input. */
export function estimateTokens(text: string): number {
  const { letter, whitespace, digitOrSymbol, nonAscii, safetyFactor } = TOKEN_ESTIMATE;
  let sum = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 127) sum += nonAscii;
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) sum += letter;
    else if (code === 32 || (code >= 9 && code <= 13)) sum += whitespace;
    else sum += digitOrSymbol;
  }
  return Math.ceil(sum * safetyFactor);
}

/** Estimated tokens for a system plus user prompt, including chat-template overhead. */
export function estimatePromptTokens(system: string, user: string): number {
  return estimateTokens(system) + estimateTokens(user) + CHAT_TEMPLATE_OVERHEAD_TOKENS;
}
