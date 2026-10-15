import { createDemoProvider, type DemoHandlers } from "./demo-provider";
import { createOllamaProvider } from "./ollama-provider";
import type { LlmProvider, ProviderName } from "./types";

export type ProviderConfig = {
  provider: ProviderName;
  model?: string;
  ollamaUrl: string;
  nodeEnv: string;
};

/**
 * Builds exactly the provider the configuration names. It never substitutes another one:
 * a missing model or a demo provider in production is an error, not a quiet downgrade.
 * (`env-schema.ts` already rejects both; this repeats the checks for callers that build a
 * config by hand.)
 */
export function createProviderFromConfig(
  config: ProviderConfig,
  demoHandlers: DemoHandlers,
): LlmProvider {
  if (config.provider === "demo") {
    if (config.nodeEnv === "production") {
      throw new Error("The demo AI provider is not allowed in production.");
    }
    return createDemoProvider(demoHandlers);
  }
  if (!config.model) throw new Error("LLM_MODEL is required for the ollama provider.");
  return createOllamaProvider({ baseUrl: config.ollamaUrl, model: config.model });
}
