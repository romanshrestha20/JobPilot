import { describe, expect, it } from "vitest";
import { createDemoProvider } from "@/lib/ai/demo-provider";
import { createAiGateway } from "@/lib/ai/gateway";
import { createLogger } from "@/lib/log";
import { demoExtractRequirements } from "./domain/demo-extraction";
import { evaluateFixtures } from "./evaluation";
import { EVAL_FIXTURES } from "./fixtures";

const demoGateway = createAiGateway({
  provider: createDemoProvider({ extract_job_requirements: demoExtractRequirements }),
  timeoutMs: 1000,
  logger: createLogger(() => {}),
});

// The CI evaluation: it proves the pipeline and the fixtures with the deterministic demo
// provider. It says nothing about the accuracy of a real model.
describe("evaluation fixtures (demo provider)", () => {
  it("passes every fixture", async () => {
    const results = await evaluateFixtures(demoGateway, EVAL_FIXTURES);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results).toHaveLength(EVAL_FIXTURES.length);
  });

  it("includes injection fixtures", () => {
    expect(
      EVAL_FIXTURES.filter((f) => f.id.startsWith("injection-")).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("reports a failing expectation and a failing provider as failures", async () => {
    const [fixture] = EVAL_FIXTURES;
    const wrong = await evaluateFixtures(demoGateway, [
      { ...fixture, expect: { required: ["rust"] } },
    ]);
    expect(wrong[0].ok).toBe(false);
    expect(wrong[0].problems[0]).toMatch(/missing required skill: rust/);

    const broken = createAiGateway({
      provider: createDemoProvider({}),
      timeoutMs: 1000,
      logger: createLogger(() => {}),
    });
    const failed = await evaluateFixtures(broken, [fixture]);
    expect(failed[0]).toMatchObject({ ok: false, code: "provider_unavailable" });
  });
});
