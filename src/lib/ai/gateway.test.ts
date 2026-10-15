import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError } from "./errors";
import { createAiGateway } from "./gateway";
import { createLogger } from "@/lib/log";
import type { LlmProvider, ProviderRequest } from "./types";

const schema = z.strictObject({ n: z.number().int().max(10), tags: z.array(z.string()).max(2) });
const silent = createLogger(() => {});

function fake(impl: (request: ProviderRequest) => Promise<unknown>): LlmProvider & {
  calls: ProviderRequest[];
} {
  const calls: ProviderRequest[] = [];
  return {
    name: "ollama",
    model: "qwen-test",
    calls,
    generateStructured: async (request) => {
      calls.push(request);
      return impl(request);
    },
  };
}

const ask = (
  gateway: ReturnType<typeof createAiGateway>,
  overrides: { system?: string; user?: string } = {},
) =>
  gateway.generateStructured({
    task: "extract_job_requirements",
    system: overrides.system ?? "sys",
    user: overrides.user ?? "user",
    sourceText: "src",
    schema,
  });

describe("AI gateway", () => {
  it("returns validated data with provider metadata", async () => {
    const provider = fake(async () => ({ n: 3, tags: ["a"] }));
    const result = await ask(createAiGateway({ provider, timeoutMs: 1000, logger: silent }));
    expect(result).toMatchObject({
      ok: true,
      data: { n: 3, tags: ["a"] },
      meta: { provider: "ollama", model: "qwen-test" },
    });
    expect(provider.calls).toHaveLength(1);
  });

  it("hands the provider a JSON Schema derived from the Zod schema, without $schema", async () => {
    const provider = fake(async () => ({ n: 1, tags: [] }));
    await ask(createAiGateway({ provider, timeoutMs: 1000, logger: silent }));
    const jsonSchema = provider.calls[0].jsonSchema;
    expect(jsonSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(jsonSchema).not.toHaveProperty("$schema");
  });

  it.each([
    ["wrong type", { n: "3", tags: [] }],
    ["out of range", { n: 11, tags: [] }],
    ["extra field", { n: 1, tags: [], isAdmin: true }],
    ["missing field", { n: 1 }],
    ["oversized array", { n: 1, tags: ["a", "b", "c"] }],
    ["not an object", "n=1"],
    ["null", null],
  ])("rejects %s as invalid_output", async (_name, output) => {
    const result = await ask(
      createAiGateway({ provider: fake(async () => output), timeoutMs: 1000, logger: silent }),
    );
    expect(result).toMatchObject({ ok: false, code: "invalid_output" });
  });

  it("does not retry or repair invalid output", async () => {
    const provider = fake(async () => ({ n: "bad" }));
    await ask(createAiGateway({ provider, timeoutMs: 1000, logger: silent }));
    expect(provider.calls).toHaveLength(1);
  });

  it("rejects an oversized prompt before calling the provider", async () => {
    const provider = fake(async () => ({ n: 1, tags: [] }));
    const gateway = createAiGateway({
      provider,
      timeoutMs: 1000,
      maxPromptChars: 100,
      logger: silent,
    });
    expect(await ask(gateway, { system: "s".repeat(60), user: "u".repeat(60) })).toMatchObject({
      ok: false,
      code: "too_long",
    });
    expect(provider.calls).toHaveLength(0);
    expect((await ask(gateway, { system: "s".repeat(50), user: "u".repeat(50) })).ok).toBe(true);
  });

  it.each(["provider_unavailable", "model_unavailable", "timeout", "invalid_output"] as const)(
    "passes through the provider's %s code",
    async (code) => {
      const gateway = createAiGateway({
        provider: fake(async () => {
          throw new AiError(code);
        }),
        timeoutMs: 1000,
        logger: silent,
      });
      expect(await ask(gateway)).toMatchObject({ ok: false, code });
    },
  );

  it("turns unexpected exceptions into provider_unavailable without leaking them", async () => {
    const lines: string[] = [];
    const gateway = createAiGateway({
      provider: fake(async () => {
        throw new Error("ECONNRESET at /srv/secret/path with token abc123");
      }),
      timeoutMs: 1000,
      logger: createLogger((_level, line) => lines.push(line)),
    });
    const result = await ask(gateway);
    expect(result).toMatchObject({ ok: false, code: "provider_unavailable" });
    expect(JSON.stringify(result)).not.toContain("abc123");
    expect(lines.join("\n")).not.toMatch(/abc123|secret|ECONNRESET/);
  });

  it("times out a provider that honours the signal", async () => {
    const provider = fake(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new AiError("timeout")));
        }),
    );
    const result = await ask(createAiGateway({ provider, timeoutMs: 1000, logger: silent }));
    expect(result).toMatchObject({ ok: false, code: "timeout" });
  }, 5000);

  it("times out a provider that ignores the signal", async () => {
    const provider = fake(() => new Promise(() => {}));
    const started = Date.now();
    const result = await ask(createAiGateway({ provider, timeoutMs: 1000, logger: silent }));
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(Date.now() - started).toBeLessThan(4000);
  }, 6000);

  it("logs only safe fields", async () => {
    const lines: string[] = [];
    const gateway = createAiGateway({
      provider: fake(async () => ({ n: 1, tags: [] })),
      timeoutMs: 1000,
      logger: createLogger((_l, line) => lines.push(line)),
    });
    await gateway.generateStructured({
      task: "extract_job_requirements",
      system: "SYSTEM-PROMPT-TEXT",
      user: "USER-JOB-TEXT",
      sourceText: "SOURCE-JOB-TEXT",
      schema,
    });
    const text = lines.join("\n");
    expect(text).toContain("ai.generate");
    expect(text).not.toMatch(/SYSTEM-PROMPT|USER-JOB|SOURCE-JOB/);
  });

  it("does not fall back to another provider when the first one fails", async () => {
    const demoSpy = vi.fn(async () => ({ n: 1, tags: [] }));
    const demo: LlmProvider = { name: "demo", model: null, generateStructured: demoSpy };
    const failing = fake(async () => {
      throw new AiError("provider_unavailable");
    });
    const result = await ask(
      createAiGateway({ provider: failing, timeoutMs: 1000, logger: silent }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: "provider_unavailable",
      meta: { provider: "ollama" },
    });
    expect(demoSpy).not.toHaveBeenCalled();
    expect(demo.name).toBe("demo");
  });
});
