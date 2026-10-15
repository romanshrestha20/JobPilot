/**
 * The only failures the gateway reports. Provider error bodies, status lines and exception
 * messages are never passed on: callers, logs and users see the code and the fixed message.
 */
export const AI_ERROR_CODES = [
  "provider_unavailable",
  "model_unavailable",
  "timeout",
  "invalid_output",
  "too_long",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  provider_unavailable: "The AI provider could not be reached.",
  model_unavailable: "The configured AI model is not available.",
  timeout: "The AI provider did not answer in time.",
  invalid_output: "The AI provider returned output that could not be used.",
  too_long: "The text is too long to analyse.",
};

/** Thrown by providers; the gateway turns it into a result. The message is always the fixed one. */
export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode) {
    super(AI_ERROR_MESSAGES[code]);
    this.name = "AiError";
    this.code = code;
  }
}
