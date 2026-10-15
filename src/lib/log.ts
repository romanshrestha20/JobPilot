/**
 * Structured logger with an allowlist. Only the fields below are written; every other key is
 * dropped, and only strings, finite numbers and booleans are accepted as values. Nothing that
 * can carry user content (prompts, job text, model output, CV data, tokens, raw exceptions)
 * has a field, so it cannot be logged by accident. Add a field here only after checking that
 * it can never hold such content.
 */
export type LogFields = {
  /** Machine-readable event name, e.g. "ai.generate". */
  event: string;
  /** A sanitized error code such as "timeout". Never an exception message. */
  code?: string;
  durationMs?: number;
  provider?: string;
  /** Configured model name (configuration, not content). */
  model?: string;
  promptVersion?: string;
  /** Opaque internal identifiers only. */
  userId?: string;
  jobId?: string;
  analysisId?: string;
  attempt?: number;
  droppedUngrounded?: number;
};

export type LogLevel = "info" | "warn" | "error";

const ALLOWED_FIELDS = new Set<string>([
  "event",
  "code",
  "durationMs",
  "provider",
  "model",
  "promptVersion",
  "userId",
  "jobId",
  "analysisId",
  "attempt",
  "droppedUngrounded",
]);

const MAX_STRING_LENGTH = 100;
const EVENT_PATTERN = /^[a-z0-9_.:-]{1,64}$/;

function sanitizeValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    // No control characters (log injection) and a hard length cap.
    return value.replace(/[\p{Cc}\p{Cf}]/gu, " ").slice(0, MAX_STRING_LENGTH);
  }
  return undefined;
}

/** Returns the safe subset of `fields`, or the same object shape with unknown keys removed. */
export function redact(fields: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    const value = sanitizeValue(raw);
    if (value !== undefined) out[key] = value;
  }
  if (typeof out.event !== "string" || !EVENT_PATTERN.test(out.event)) out.event = "invalid_event";
  return out;
}

export type LogSink = (level: LogLevel, line: string) => void;

const consoleSink: LogSink = (level, line) => {
  console[level](line);
};

export function createLogger(sink: LogSink = consoleSink) {
  const write = (level: LogLevel, fields: LogFields) => {
    sink(level, JSON.stringify({ level, time: new Date().toISOString(), ...redact(fields) }));
  };
  return {
    info: (fields: LogFields) => write("info", fields),
    warn: (fields: LogFields) => write("warn", fields),
    error: (fields: LogFields) => write("error", fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export const log: Logger = createLogger();
