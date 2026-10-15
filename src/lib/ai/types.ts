import type { ZodType } from "zod";
import type { AiErrorCode } from "./errors";

/** Tasks the gateway knows about. Each one has a schema owned by the feature that asks. */
export type AiTask = "extract_job_requirements";

export type ProviderName = "ollama" | "demo";

/** What a provider receives. `jsonSchema` is derived from the caller's Zod schema. */
export type ProviderRequest = {
  task: AiTask;
  system: string;
  user: string;
  /**
   * The untrusted text the prompt was built from. Model providers ignore it (they use
   * `system` and `user`); the deterministic demo provider reads it.
   */
  sourceText: string;
  jsonSchema: Record<string, unknown>;
  /** Aborts when the gateway's timeout elapses. */
  signal: AbortSignal;
};

/**
 * A model backend. It returns the parsed JSON value and nothing else; the gateway validates it.
 * Providers throw `AiError` (never raw exceptions) and must not log prompts or output.
 */
export interface LlmProvider {
  readonly name: ProviderName;
  /** Configured model name; null when no model is involved (demo). */
  readonly model: string | null;
  /**
   * Largest estimated prompt (system plus user, see `token-estimate.ts`) this provider can take
   * while leaving room for the answer. The gateway refuses anything larger before calling the
   * provider. Absent or null means the provider has no context limit (the demo provider).
   */
  readonly promptTokenBudget?: number | null;
  generateStructured(request: ProviderRequest): Promise<unknown>;
}

export type GenerateRequest<T> = {
  task: AiTask;
  system: string;
  user: string;
  sourceText: string;
  /** The output contract. Anything that does not satisfy it is rejected as `invalid_output`. */
  schema: ZodType<T>;
};

export type AiResultMeta = {
  provider: ProviderName;
  model: string | null;
  latencyMs: number;
};

export type AiResult<T> =
  { ok: true; data: T; meta: AiResultMeta } | { ok: false; code: AiErrorCode; meta: AiResultMeta };

/** The single entry point features use to reach a model. */
export interface AiGateway {
  generateStructured<T>(request: GenerateRequest<T>): Promise<AiResult<T>>;
}
