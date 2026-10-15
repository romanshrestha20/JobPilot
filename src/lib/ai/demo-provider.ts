import { AiError } from "./errors";
import type { AiTask, LlmProvider, ProviderRequest } from "./types";

/** Deterministic extractor for one task: reads the source text, returns the output value. */
export type DemoHandler = (sourceText: string) => unknown;
export type DemoHandlers = Partial<Record<AiTask, DemoHandler>>;

/**
 * Deterministic stand-in for development and automated tests. It runs no model and makes no
 * network call: each task is answered by a handler the feature supplies (keyword rules).
 * Its output is not AI output; results carry `provider: "demo"` so callers can label them.
 * It is never selected automatically and is rejected when `NODE_ENV=production`.
 */
export function createDemoProvider(handlers: DemoHandlers): LlmProvider {
  return {
    name: "demo",
    model: null,

    async generateStructured(request: ProviderRequest) {
      const handler = handlers[request.task];
      if (!handler) throw new AiError("provider_unavailable");
      return handler(request.sourceText);
    },
  };
}
