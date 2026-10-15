import "server-only";
import { createConfiguredGateway } from "@/lib/ai";
import { extractRequirements } from "./application/extract";
import { demoExtractRequirements } from "./domain/demo-extraction";

let gateway: ReturnType<typeof createConfiguredGateway> | undefined;

/**
 * Composition root for Phase 2A: binds the configured provider to the extraction use case.
 * Callers (the Phase 2B worker) must already have checked who owns the job and pass only its
 * description. Nothing calls this yet.
 */
export function extractJobRequirements(jobText: string) {
  gateway ??= createConfiguredGateway({ extract_job_requirements: demoExtractRequirements });
  return extractRequirements(gateway, jobText);
}

export { DEMO_LABEL } from "./domain/demo-extraction";
export { MAX_JOB_TEXT_CHARS } from "./application/extract";
export type { ExtractionErrorCode, ExtractionResult } from "./application/extract";
export type { GroundedRequirements, GroundedSkill } from "./domain/requirements";
