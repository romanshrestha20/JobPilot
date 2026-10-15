import { z } from "zod";
import { AiError } from "./errors";
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

// Only what we rely on; extra fields from Ollama are ignored.
const chatResponseSchema = z.looseObject({
  message: z.looseObject({ content: z.string() }),
});

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
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/api/chat`;

  return {
    name: "ollama",
    model: options.model,

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
            options: { temperature: 0, num_ctx: options.numCtx ?? DEFAULT_NUM_CTX },
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
