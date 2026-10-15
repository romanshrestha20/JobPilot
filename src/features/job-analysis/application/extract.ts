import type { AiErrorCode } from "@/lib/ai/errors";
import type { AiGateway, ProviderName } from "@/lib/ai/types";
import { groundRequirements } from "../domain/grounding";
import { PROMPT_VERSION, buildExtractionPrompt } from "../domain/prompt";
import { type GroundedRequirements, jobRequirementsSchema } from "../domain/requirements";

/** Mirrors `JOB_LIMITS.description` in job-intake (the stored description cannot be longer). */
export const MAX_JOB_TEXT_CHARS = 20_000;

export type ExtractionErrorCode = AiErrorCode | "empty_input";

export type ExtractionMeta = {
  provider: ProviderName;
  model: string | null;
  latencyMs: number;
  promptVersion: string;
  /** True when the result came from the keyword-based demo provider, not a model. */
  demo: boolean;
};

export type ExtractionResult =
  | { ok: true; requirements: GroundedRequirements; meta: ExtractionMeta }
  | { ok: false; code: ExtractionErrorCode };

/**
 * Extracts structured requirements from one job description. The only input is the job text:
 * no candidate profile, skills or other user data can reach the model through this function.
 * Pure of persistence, authentication and Next.js; the caller owns those.
 *
 * Steps: enforce the input limit, call the gateway (which validates the output against the
 * strict schema), then ground the result in the text. A provider failure is returned as a
 * code. It is never replaced by a different provider's answer.
 */
export async function extractRequirements(
  gateway: AiGateway,
  jobText: string,
): Promise<ExtractionResult> {
  if (jobText.trim() === "") return { ok: false, code: "empty_input" };
  if (jobText.length > MAX_JOB_TEXT_CHARS) return { ok: false, code: "too_long" };

  const { system, user } = buildExtractionPrompt(jobText);
  const result = await gateway.generateStructured({
    task: "extract_job_requirements",
    system,
    user,
    sourceText: jobText,
    schema: jobRequirementsSchema,
  });
  if (!result.ok) return { ok: false, code: result.code };

  return {
    ok: true,
    requirements: groundRequirements(result.data, jobText),
    meta: {
      provider: result.meta.provider,
      model: result.meta.model,
      latencyMs: result.meta.latencyMs,
      promptVersion: PROMPT_VERSION,
      demo: result.meta.provider === "demo",
    },
  };
}
