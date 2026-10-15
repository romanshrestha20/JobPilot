import { describe, expect, it, vi } from "vitest";
import { createAiGateway } from "@/lib/ai/gateway";
import { DEFAULT_NUM_CTX, createOllamaProvider } from "@/lib/ai/ollama-provider";
import {
  OUTPUT_RESERVE_TOKENS,
  estimatePromptTokens,
  estimateTokens,
} from "@/lib/ai/token-estimate";
import { createLogger } from "@/lib/log";
import { PROMPT_VERSION, buildExtractionPrompt } from "../domain/prompt";
import { MAX_JOB_TEXT_CHARS, extractRequirements } from "./extract";

// The real Ollama provider and the real gateway, with a mocked `fetch` that counts requests.
// Deterministic unit tests: they show what we send and refuse, not how a model behaves.
const validAnswer = {
  schemaVersion: 1,
  requiredSkills: [],
  preferredSkills: [],
  minYearsExperience: null,
  languages: [],
  workMode: null,
  locations: [],
};

function setup(responseExtra: Record<string, unknown> = {}, numCtx?: number) {
  const bodies: string[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body));
    return new Response(
      JSON.stringify({
        message: { role: "assistant", content: JSON.stringify(validAnswer) },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 1500,
        eval_count: 200,
        ...responseExtra,
      }),
      { status: 200 },
    );
  });
  const provider = createOllamaProvider({
    baseUrl: "http://ollama.test:11434",
    model: "qwen-test",
    numCtx,
    fetch: fetchMock as never,
  });
  const gateway = createAiGateway({ provider, timeoutMs: 2000, logger: createLogger(() => {}) });
  return { gateway, fetchMock, bodies };
}

const repeatTo = (unit: string, length: number) =>
  unit.repeat(Math.ceil(length / unit.length)).slice(0, length);

const english = (length: number) =>
  repeatTo(
    "About the role: you will design, build and operate backend services that power our hiring platform. You will work closely with product managers and designers, review code, mentor colleagues and take part in an on-call rotation. We value clear communication, ownership and curiosity. ",
    length,
  );
const dense = (length: number) =>
  repeatTo(
    "TypeScript, C++ 5+ yrs, Node.js, k8s, CI/CD, .NET, PostgreSQL 3+ yrs, gRPC, scikit-learn, OAuth2, ",
    length,
  );
const chinese = (length: number) =>
  repeatTo(
    "我们正在寻找一位拥有五年以上经验的后端工程师，熟悉分布式系统、数据库和云平台，具备良好的沟通能力与团队合作精神。",
    length,
  );
const symbols = (length: number) => repeatTo("a1-_/=+#%b2c3d4e5f6g7h8i9j0k", length);

describe("long job descriptions through the real Ollama provider (mocked fetch)", () => {
  it("processes an ordinary 20 000-character English posting (the storage limit)", async () => {
    const { gateway, fetchMock } = setup();
    const result = await extractRequirements(gateway, english(MAX_JOB_TEXT_CHARS));
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a dense skill list", dense(20_000)],
    ["symbol-heavy content", symbols(20_000)],
    ["non-Latin text", chinese(11_200)],
    ["a long dense skill list under the storage limit", dense(12_000)],
  ])("refuses %s as too_long without sending any request", async (_name, text) => {
    const { gateway, fetchMock } = setup();
    expect(await extractRequirements(gateway, text)).toEqual({ ok: false, code: "too_long" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the same kinds of content when they are short enough", async () => {
    for (const text of [dense(3000), symbols(2500), chinese(4000), english(15_000)]) {
      const { gateway, fetchMock } = setup();
      expect((await extractRequirements(gateway, text)).ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("decides on the whole prompt, not on the job text alone", async () => {
    // A small context makes the boundary reachable with ordinary English.
    const numCtx = 3000;
    const budget = numCtx - OUTPUT_RESERVE_TOKENS;
    const promptFor = (length: number) => buildExtractionPrompt(english(length));

    let low = 1;
    let high = 20_000;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const { system, user } = promptFor(mid);
      if (estimatePromptTokens(system, user) <= budget) low = mid;
      else high = mid - 1;
    }
    expect(low).toBeGreaterThan(500);
    expect(low).toBeLessThan(MAX_JOB_TEXT_CHARS);

    const fits = setup({}, numCtx);
    expect((await extractRequirements(fits.gateway, english(low))).ok).toBe(true);
    expect(fits.fetchMock).toHaveBeenCalledTimes(1);

    // One more character of the same text no longer fits.
    const refused = setup({}, numCtx);
    expect(await extractRequirements(refused.gateway, english(low + 1))).toEqual({
      ok: false,
      code: "too_long",
    });
    expect(refused.fetchMock).not.toHaveBeenCalled();

    // The job text alone is under the budget at the boundary: the system prompt and the
    // chat-template overhead are what push it over.
    expect(estimateTokens(english(low + 1))).toBeLessThanOrEqual(budget);
    expect(
      estimatePromptTokens(promptFor(low + 1).system, promptFor(low + 1).user),
    ).toBeGreaterThan(budget);
  });

  it("does not rewrite or truncate what it does send", async () => {
    const { gateway, bodies } = setup();
    const text = english(6000);
    await extractRequirements(gateway, text);
    const sent = JSON.parse(bodies[0]);
    expect(sent.messages[1].content).toContain(text);
    expect(sent.options.num_ctx).toBe(DEFAULT_NUM_CTX);
    expect(sent.options).not.toHaveProperty("num_predict");
  });

  it("keeps the storage-limit check separate from the analysis budget", async () => {
    const { gateway, fetchMock } = setup();
    // One character over the storage limit: refused by the extractor itself.
    expect(await extractRequirements(gateway, "a".repeat(MAX_JOB_TEXT_CHARS + 1))).toEqual({
      ok: false,
      code: "too_long",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(MAX_JOB_TEXT_CHARS).toBe(20_000);
  });

  it("rejects an answer that stopped at a length limit instead of returning a partial extraction", async () => {
    const { gateway } = setup({
      done_reason: "length",
      message: { role: "assistant", content: '{"schemaVersion":1,"requiredSkills":[{"name":"Ty' },
    });
    expect(await extractRequirements(gateway, english(2000))).toEqual({
      ok: false,
      code: "invalid_output",
    });
  });

  it("rejects a near-full context reported by the provider as too_long", async () => {
    const { gateway } = setup({ prompt_eval_count: DEFAULT_NUM_CTX - 100, eval_count: 50 });
    expect(await extractRequirements(gateway, english(2000))).toEqual({
      ok: false,
      code: "too_long",
    });
  });

  it("returns a result with provider metadata when usage metadata is missing (documented policy)", async () => {
    const { gateway } = setup({ prompt_eval_count: undefined, eval_count: undefined });
    const result = await extractRequirements(gateway, english(2000));
    expect(result).toMatchObject({
      ok: true,
      meta: { provider: "ollama", demo: false, promptVersion: PROMPT_VERSION },
    });
  });

  it("never falls back to another provider when the model is unavailable", async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"error":"model not found"}', { status: 404 }),
    );
    const gateway = createAiGateway({
      provider: createOllamaProvider({
        baseUrl: "http://x",
        model: "m",
        fetch: fetchMock as never,
      }),
      timeoutMs: 1000,
      logger: createLogger(() => {}),
    });
    expect(await extractRequirements(gateway, english(500))).toEqual({
      ok: false,
      code: "model_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
