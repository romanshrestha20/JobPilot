import { describe, expect, it } from "vitest";
import { createDemoProvider } from "./demo-provider";
import { createProviderFromConfig } from "./factory";
import type { ProviderRequest } from "./types";

const handlers = { extract_job_requirements: (text: string) => ({ echoed: text }) };
const request: ProviderRequest = {
  task: "extract_job_requirements",
  system: "s",
  user: "u",
  sourceText: "the job text",
  jsonSchema: {},
  signal: new AbortController().signal,
};

describe("provider factory", () => {
  it("builds the demo provider outside production", async () => {
    const provider = createProviderFromConfig(
      { provider: "demo", ollamaUrl: "", nodeEnv: "test" },
      handlers,
    );
    expect(provider.name).toBe("demo");
    expect(provider.model).toBeNull();
    expect(await provider.generateStructured(request)).toEqual({ echoed: "the job text" });
  });

  it("refuses the demo provider in production", () => {
    expect(() =>
      createProviderFromConfig(
        { provider: "demo", ollamaUrl: "", nodeEnv: "production" },
        handlers,
      ),
    ).toThrow(/not allowed in production/);
  });

  it("requires a model for ollama and never falls back to demo", () => {
    expect(() =>
      createProviderFromConfig(
        { provider: "ollama", ollamaUrl: "http://x", nodeEnv: "development" },
        handlers,
      ),
    ).toThrow(/LLM_MODEL/);
  });

  it("builds ollama with the configured model", () => {
    const provider = createProviderFromConfig(
      { provider: "ollama", model: "qwen-test", ollamaUrl: "http://x", nodeEnv: "production" },
      handlers,
    );
    expect(provider).toMatchObject({ name: "ollama", model: "qwen-test" });
  });
});

describe("demo provider", () => {
  it("fails for a task it has no handler for instead of inventing output", async () => {
    await expect(createDemoProvider({}).generateStructured(request)).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("makes no network calls", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network used");
    }) as never;
    try {
      await expect(createDemoProvider(handlers).generateStructured(request)).resolves.toBeDefined();
    } finally {
      globalThis.fetch = original;
    }
  });
});
