import "server-only";
import { env } from "@/lib/env";
import type { DemoHandlers } from "./demo-provider";
import { createProviderFromConfig } from "./factory";
import { createAiGateway } from "./gateway";
import type { AiGateway } from "./types";

/**
 * Gateway for the configured provider (`LLM_PROVIDER`). Feature modules call this instead of
 * building provider clients. `demoHandlers` are only used when the demo provider is
 * configured. Created on demand, so importing this module never touches the model.
 */
export function createConfiguredGateway(demoHandlers: DemoHandlers): AiGateway {
  return createAiGateway({
    provider: createProviderFromConfig(
      {
        provider: env.LLM_PROVIDER,
        model: env.LLM_MODEL,
        ollamaUrl: env.OLLAMA_URL,
        nodeEnv: env.NODE_ENV,
      },
      demoHandlers,
    ),
    timeoutMs: env.LLM_TIMEOUT_MS,
  });
}

export { AI_ERROR_CODES, AI_ERROR_MESSAGES, AiError } from "./errors";
export type { AiErrorCode } from "./errors";
export type { AiGateway, AiResult, AiTask, LlmProvider } from "./types";
