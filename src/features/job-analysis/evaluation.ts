import type { AiGateway } from "@/lib/ai/types";
import { extractRequirements } from "./application/extract";
import type { EvalFixture } from "./fixtures";

export type FixtureResult = {
  id: string;
  ok: boolean;
  /** Error code when the extraction itself failed. */
  code?: string;
  problems: string[];
  /** Fraction of expected skill keys found, 0..1 (1 when none were expected). */
  recall: number;
  /** Fraction of returned skill keys that were expected or at least not forbidden. */
  precision: number;
  droppedUngrounded: number;
};

const keys = (skills: { key: string }[]) => skills.map((skill) => skill.key);

/**
 * Runs fixtures through `extractRequirements` and compares the result with the expectations.
 * Deterministic for the demo provider. With a real model the numbers are an accuracy sample
 * and must be reported as such; with the demo provider they only prove the pipeline.
 */
export async function evaluateFixtures(
  gateway: AiGateway,
  fixtures: EvalFixture[],
): Promise<FixtureResult[]> {
  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    const outcome = await extractRequirements(gateway, fixture.text);
    if (!outcome.ok) {
      results.push({
        id: fixture.id,
        ok: false,
        code: outcome.code,
        problems: [`extraction failed: ${outcome.code}`],
        recall: 0,
        precision: 0,
        droppedUngrounded: 0,
      });
      continue;
    }

    const got = outcome.requirements;
    const problems: string[] = [];
    const requiredKeys = keys(got.requiredSkills);
    const preferredKeys = keys(got.preferredSkills);
    const allKeys = [...requiredKeys, ...preferredKeys];
    const { expect } = fixture;

    for (const key of expect.required ?? []) {
      if (!requiredKeys.includes(key)) problems.push(`missing required skill: ${key}`);
    }
    for (const key of expect.preferred ?? []) {
      if (!preferredKeys.includes(key)) problems.push(`missing preferred skill: ${key}`);
    }
    if (expect.required && expect.required.length === 0 && requiredKeys.length > 0) {
      problems.push(`unexpected required skills: ${requiredKeys.join(", ")}`);
    }
    for (const key of fixture.forbid ?? []) {
      if (allKeys.includes(key)) problems.push(`forbidden skill present: ${key}`);
    }
    if (expect.minYears !== undefined && got.minYearsExperience !== expect.minYears) {
      problems.push(`minYears ${String(got.minYearsExperience)} != ${String(expect.minYears)}`);
    }
    if (expect.workMode !== undefined && got.workMode !== expect.workMode) {
      problems.push(`workMode ${String(got.workMode)} != ${String(expect.workMode)}`);
    }
    for (const language of expect.languages ?? []) {
      if (!got.languages.some((entry) => entry.language === language)) {
        problems.push(`missing language: ${language}`);
      }
    }

    const expected = [...(expect.required ?? []), ...(expect.preferred ?? [])];
    const found = expected.filter((key) => allKeys.includes(key));
    const acceptable = allKeys.filter((key) => !(fixture.forbid ?? []).includes(key));
    results.push({
      id: fixture.id,
      ok: problems.length === 0,
      problems,
      recall: expected.length === 0 ? 1 : found.length / expected.length,
      precision: allKeys.length === 0 ? 1 : acceptable.length / allKeys.length,
      droppedUngrounded: got.droppedUngrounded,
    });
  }
  return results;
}
