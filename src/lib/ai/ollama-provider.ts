import { z } from "zod";
import { AiError } from "./errors";
import { OUTPUT_RESERVE_TOKENS } from "./token-estimate";
import type { LlmProvider, ProviderRequest } from "./types";

export type OllamaProviderOptions = {
  /** Base URL, e.g. http://localhost:11434. */
  baseUrl: string;
  /** The configured model. There is no default: a hardcoded model name would hide misconfiguration. */
  model: string;
  /** Context window. Ollama silently truncates input beyond it, so it is set explicitly. */
  numCtx?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

export const DEFAULT_NUM_CTX = 8192;
/** A structured extraction is a few KB; anything near this is not a valid answer. */
export const MAX_RESPONSE_CHARS = 64_000;

/**
 * A response whose prompt tokens plus generated tokens reach this share of the context window
 * is rejected as `too_long`. Ollama cuts input that exceeds the window, and the counts it
 * reports can only show that the window was full, never that all of the input was read. They
 * may also exclude tokens served from its prompt cache, so a count below the threshold is not
 * proof of anything either. The share is a safety policy, not a measurement.
 */
export const CONTEXT_FULL_RATIO = 0.95;

// Only what we rely on; extra fields from Ollama are ignored. The three optional fields are
// documented for `/api/chat` but have not been observed on this installation (no chat model);
// when present they must be well-formed, and their absence is handled explicitly below.
const chatResponseSchema = z.looseObject({
  message: z.looseObject({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().min(0).optional(),
  eval_count: z.number().int().min(0).optional(),
});

type ChatResponse = z.output<typeof chatResponseSchema>;

/**
 * Decides whether a completed response can be trusted, before its content is parsed.
 *
 * - Window full (prompt plus answer tokens near `numCtx`): `too_long`. Checked first, so a
 *   `length` stop caused by a full window reports the input as the problem.
 * - Any stop reason other than "stop", including a missing one: `invalid_output`. A `length`
 *   stop means the answer was cut off; a missing reason means we cannot confirm the model
 *   finished, so a possibly partial extraction is never returned as success.
 * - Missing token counts: the window check is skipped (an absent `prompt_eval_count` can occur
 *   when nothing was evaluated, for example after a cache hit) and the gateway's preflight
 *   estimate is the only input guard. Without `eval_count`, only the prompt count is used.
 */
function assertComplete(response: ChatResponse, numCtx: number): void {
  if (response.prompt_eval_count !== undefined) {
    const used = response.prompt_eval_count + (response.eval_count ?? 0);
    if (used >= numCtx * CONTEXT_FULL_RATIO) throw new AiError("too_long");
  }
  if (response.done_reason !== "stop") throw new AiError("invalid_output");
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/**
 * Local Ollama through `POST /api/chat` with `stream: false`. The JSON Schema goes in the
 * `format` field so the model is constrained to the shape; the gateway still validates the
 * result. No prompt, job text, model output or exception detail is logged here.
 */
export function createOllamaProvider(options: OllamaProviderOptions): LlmProvider {
  const doFetch = options.fetch ?? fetch;
  const numCtx = options.numCtx ?? DEFAULT_NUM_CTX;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/api/chat`;

  return {
    name: "ollama",
    model: options.model,
    // The window is shared by prompt and answer; keep room for a typical answer.
    promptTokenBudget: Math.max(0, numCtx - OUTPUT_RESERVE_TOKENS),

    async generateStructured(request: ProviderRequest) {
      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // A redirect would send the prompt somewhere the configuration did not name.
          redirect: "error",
          signal: request.signal,
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            stream: false,
            format: request.jsonSchema,
            options: { temperature: 0, num_ctx: numCtx },
          }),
        });
      } catch (error) {
        throw new AiError(isAbort(error) ? "timeout" : "provider_unavailable");
      }

      // Ollama answers 404 when the model has not been pulled.
      if (response.status === 404) {
        await response.body?.cancel().catch(() => undefined);
        throw new AiError("model_unavailable");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new AiError("provider_unavailable");
      }

      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw new AiError(isAbort(error) ? "timeout" : "provider_unavailable");
      }
      if (text.length > MAX_RESPONSE_CHARS) throw new AiError("invalid_output");

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AiError("invalid_output");
      }
      const parsed = chatResponseSchema.safeParse(body);
      if (!parsed.success) throw new AiError("invalid_output");

      assertComplete(parsed.data, numCtx);

      const content = parsed.data.message.content;
      if (content.length > MAX_RESPONSE_CHARS) throw new AiError("invalid_output");
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new AiError("invalid_output");
      }
    },
  };
}
