import { z } from "zod";
import { AI_ERROR_CODES, AiError, type AiErrorCode } from "./errors";
import { type Logger, log as defaultLogger } from "@/lib/log";
import { estimatePromptTokens } from "./token-estimate";
import type { AiGateway, AiResult, AiResultMeta, GenerateRequest, LlmProvider } from "./types";

export type GatewayOptions = {
  provider: LlmProvider;
  /** Upper bound for one provider call. */
  timeoutMs: number;
  /** Outer bound on the prompt (system plus user, in characters), whatever the provider. */
  maxPromptChars?: number;
  /**
   * Largest estimated prompt in tokens. Defaults to the provider's own budget; providers
   * without a context limit are not token-checked.
   */
  maxPromptTokens?: number;
  logger?: Logger;
};

/** About 7 000 tokens: a 20 000-character job text plus the instructions, with margin. */
export const DEFAULT_MAX_PROMPT_CHARS = 30_000;

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  // Ollama's `format` takes the schema itself, without the meta-schema declaration.
  delete jsonSchema.$schema;
  return jsonSchema;
}

function isErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && (AI_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The one place features reach a model. It enforces the input limit, applies the timeout,
 * validates the output with the caller's Zod schema and reports only sanitized codes.
 * There is no retry, no output "repair" and no fallback to another provider: retries belong
 * to the queue (Phase 2B), and a failed provider must look like a failure.
 */
export function createAiGateway(options: GatewayOptions): AiGateway {
  const { provider, timeoutMs } = options;
  const maxPromptChars = options.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS;
  const maxPromptTokens = options.maxPromptTokens ?? provider.promptTokenBudget ?? null;
  const logger = options.logger ?? defaultLogger;

  return {
    async generateStructured<T>(request: GenerateRequest<T>): Promise<AiResult<T>> {
      const startedAt = Date.now();
      const meta = (): AiResultMeta => ({
        provider: provider.name,
        model: provider.model,
        latencyMs: Date.now() - startedAt,
      });
      const fail = (code: AiErrorCode): AiResult<T> => {
        const result = meta();
        logger.warn({
          event: "ai.generate_failed",
          code,
          provider: provider.name,
          model: provider.model ?? undefined,
          durationMs: result.latencyMs,
        });
        return { ok: false, code, meta: result };
      };

      if (request.system.length + request.user.length > maxPromptChars) return fail("too_long");
      // Refuse, never truncate: input that cannot fit the context is reported, not cut down.
      if (
        maxPromptTokens !== null &&
        estimatePromptTokens(request.system, request.user) > maxPromptTokens
      ) {
        return fail("too_long");
      }

      const signal = AbortSignal.timeout(timeoutMs);
      let raw: unknown;
      try {
        // A provider that ignores the signal must not hold the caller past the timeout.
        raw = await Promise.race([
          provider.generateStructured({
            task: request.task,
            system: request.system,
            user: request.user,
            sourceText: request.sourceText,
            jsonSchema: toJsonSchema(request.schema),
            signal,
          }),
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(new AiError("timeout")), { once: true });
          }),
        ]);
      } catch (error) {
        // Only our own typed errors are trusted; anything else is reported as unavailable
        // without its message.
        const code = error instanceof AiError && isErrorCode(error.code) ? error.code : null;
        return fail(code ?? "provider_unavailable");
      }

      const parsed = request.schema.safeParse(raw);
      if (!parsed.success) return fail("invalid_output");

      const result = meta();
      logger.info({
        event: "ai.generate",
        provider: provider.name,
        model: provider.model ?? undefined,
        durationMs: result.latencyMs,
      });
      return { ok: true, data: parsed.data, meta: result };
    },
  };
}
