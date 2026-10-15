import { describe, expect, it, vi } from "vitest";
import { AiError } from "./errors";
import {
  CONTEXT_FULL_RATIO,
  DEFAULT_NUM_CTX,
  MAX_RESPONSE_CHARS,
  createOllamaProvider,
} from "./ollama-provider";
import { OUTPUT_RESERVE_TOKENS } from "./token-estimate";
import type { ProviderRequest } from "./types";

const request = (overrides: Partial<ProviderRequest> = {}): ProviderRequest => ({
  task: "extract_job_requirements",
  system: "SYSTEM",
  user: "USER",
  sourceText: "SOURCE",
  jsonSchema: { type: "object" },
  signal: new AbortController().signal,
  ...overrides,
});

// A complete, ordinary response by default; `extra` overrides or (as undefined) removes fields.
const chatBody = (content: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: "m",
    message: { role: "assistant", content },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 1200,
    eval_count: 300,
    ...extra,
  });
const respond = (body: string, init: ResponseInit = { status: 200 }) =>
  vi.fn(async () => new Response(body, init));

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiError);
    return (error as AiError).code;
  }
  return "no error";
}

const provider = (fetchImpl: typeof fetch, baseUrl = "http://ollama.test:11434") =>
  createOllamaProvider({ baseUrl, model: "qwen-test", fetch: fetchImpl });

describe("ollama provider", () => {
  it("posts a non-streaming chat request with the configured model, schema and temperature 0", async () => {
    const fetchMock = respond(chatBody('{"ok":true}'));
    const result = await provider(fetchMock as never).generateStructured(request());

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://ollama.test:11434/api/chat");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "qwen-test",
      stream: false,
      format: { type: "object" },
      options: { temperature: 0 },
    });
    expect(body.options.num_ctx).toBeGreaterThanOrEqual(8192);
    expect(body.messages).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "USER" },
    ]);
    // The source text travels only inside the user message the caller built.
    expect(init.body as string).not.toContain("SOURCE");
  });

  it("uses the configured model and base URL, tolerating a trailing slash", async () => {
    const fetchMock = respond(chatBody("{}"));
    await createOllamaProvider({
      baseUrl: "http://h:1/",
      model: "other",
      fetch: fetchMock as never,
    }).generateStructured(request());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://h:1/api/chat");
    expect(JSON.parse(init.body as string).model).toBe("other");
  });

  it("passes the abort signal to fetch", async () => {
    const fetchMock = respond(chatBody("{}"));
    const controller = new AbortController();
    await provider(fetchMock as never).generateStructured(request({ signal: controller.signal }));
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(
      controller.signal,
    );
  });

  it("maps HTTP 404 to model_unavailable", async () => {
    const f = respond('{"error":"model \\"x\\" not found, try pulling it first"}', { status: 404 });
    expect(await codeOf(provider(f as never).generateStructured(request()))).toBe(
      "model_unavailable",
    );
  });

  it.each([400, 401, 500, 502, 503])("maps HTTP %i to provider_unavailable", async (status) => {
    const f = respond('{"error":"internal path /secret/leak"}', { status });
    expect(await codeOf(provider(f as never).generateStructured(request()))).toBe(
      "provider_unavailable",
    );
  });

  it("maps a refused connection to provider_unavailable", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: new Error("ECONNREFUSED 127.0.0.1:11434") });
    });
    expect(await codeOf(provider(f as never).generateStructured(request()))).toBe(
      "provider_unavailable",
    );
  });

  it("maps an abort or timeout to timeout", async () => {
    for (const name of ["AbortError", "TimeoutError"]) {
      const f = vi.fn(async () => {
        throw new DOMException("aborted", name);
      });
      expect(await codeOf(provider(f as never).generateStructured(request()))).toBe("timeout");
    }
  });

  it("maps an abort while reading the body to timeout", async () => {
    const f = vi.fn(async () => ({
      status: 200,
      ok: true,
      body: null,
      text: async () => {
        throw new DOMException("aborted", "TimeoutError");
      },
    }));
    expect(await codeOf(provider(f as never).generateStructured(request()))).toBe("timeout");
  });

  it.each([
    ["not JSON at all", "<html>proxy error</html>"],
    ["JSON that is not a chat response", JSON.stringify({ hello: "world" })],
    ["a message without content", JSON.stringify({ message: { role: "assistant" } })],
    ["content that is not a string", JSON.stringify({ message: { content: { a: 1 } } })],
    ["content that is not JSON", chatBody("Sure! Here is the JSON: {")],
    ["empty content", chatBody("")],
  ])("maps %s to invalid_output", async (_name, body) => {
    expect(await codeOf(provider(respond(body) as never).generateStructured(request()))).toBe(
      "invalid_output",
    );
  });

  it("rejects an oversized response before parsing it", async () => {
    const huge = chatBody(JSON.stringify({ pad: "a".repeat(MAX_RESPONSE_CHARS) }));
    expect(await codeOf(provider(respond(huge) as never).generateStructured(request()))).toBe(
      "invalid_output",
    );
  });

  it("never puts provider text into the error", async () => {
    const f = respond('{"error":"secret detail from the server"}', { status: 500 });
    await expect(provider(f as never).generateStructured(request())).rejects.toSatisfy(
      (error: Error) => !error.message.includes("secret detail"),
    );
  });
});

// Deterministic unit tests with a mocked `fetch`. They exercise our handling of the documented
// `/api/chat` response fields; none of this was observed from a real chat model.
describe("ollama provider: incomplete and oversized responses (mocked fetch)", () => {
  const ask = (body: string) => provider(respond(body) as never).generateStructured(request());
  const full = DEFAULT_NUM_CTX;
  const threshold = Math.ceil(full * CONTEXT_FULL_RATIO);

  it("exposes a prompt budget that leaves room for the answer", () => {
    expect(provider(respond("") as never).promptTokenBudget).toBe(
      DEFAULT_NUM_CTX - OUTPUT_RESERVE_TOKENS,
    );
    const small = createOllamaProvider({ baseUrl: "http://h", model: "m", numCtx: 4096 });
    expect(small.promptTokenBudget).toBe(4096 - OUTPUT_RESERVE_TOKENS);
  });

  it("accepts a normal complete response", async () => {
    expect(await ask(chatBody('{"ok":true}'))).toEqual({ ok: true });
  });

  it("rejects an answer that stopped at a length limit as invalid_output", async () => {
    const body = chatBody('{"requiredSkills":[{"name":"Ty', {
      done_reason: "length",
      prompt_eval_count: 900,
      eval_count: 600,
    });
    expect(await codeOf(ask(body))).toBe("invalid_output");
  });

  it("never returns a length-stopped answer even when its JSON happens to be complete", async () => {
    const body = chatBody('{"ok":true}', { done_reason: "length" });
    expect(await codeOf(ask(body))).toBe("invalid_output");
  });

  it.each(["load", "unload", "", "STOP", "other"])(
    "rejects done_reason %j as invalid_output",
    async (reason) => {
      expect(await codeOf(ask(chatBody("{}", { done_reason: reason })))).toBe("invalid_output");
    },
  );

  it("rejects a response with no done_reason: completion cannot be confirmed", async () => {
    expect(await codeOf(ask(chatBody("{}", { done_reason: undefined })))).toBe("invalid_output");
  });

  it("reports a length stop with a full window as too_long, because the input is the problem", async () => {
    const body = chatBody("{", {
      done_reason: "length",
      prompt_eval_count: full - 10,
      eval_count: 10,
    });
    expect(await codeOf(ask(body))).toBe("too_long");
  });

  it("rejects a near-full window as too_long even when generation finished normally", async () => {
    const body = chatBody('{"ok":true}', { prompt_eval_count: threshold - 300, eval_count: 300 });
    expect(await codeOf(ask(body))).toBe("too_long");
  });

  it("accepts usage just below the near-full threshold", async () => {
    const body = chatBody('{"ok":true}', { prompt_eval_count: threshold - 301, eval_count: 300 });
    expect(await ask(body)).toEqual({ ok: true });
  });

  it("uses the prompt count alone when eval_count is missing", async () => {
    expect(
      await codeOf(ask(chatBody("{}", { prompt_eval_count: full, eval_count: undefined }))),
    ).toBe("too_long");
    expect(await ask(chatBody("{}", { prompt_eval_count: 500, eval_count: undefined }))).toEqual(
      {},
    );
  });

  it("skips the window check when token counts are missing, and still requires a stop", async () => {
    const noUsage = { prompt_eval_count: undefined, eval_count: undefined };
    expect(await ask(chatBody("{}", noUsage))).toEqual({});
    expect(await codeOf(ask(chatBody("{}", { ...noUsage, done_reason: "length" })))).toBe(
      "invalid_output",
    );
  });

  it.each([
    ["negative prompt_eval_count", { prompt_eval_count: -1 }],
    ["fractional eval_count", { eval_count: 1.5 }],
    ["string prompt_eval_count", { prompt_eval_count: "1200" }],
    ["non-string done_reason", { done_reason: 1 }],
  ])("rejects malformed usage metadata (%s) as invalid_output", async (_name, extra) => {
    expect(await codeOf(ask(chatBody("{}", extra)))).toBe("invalid_output");
  });

  it("checks completeness before parsing the content, so truncated JSON is not misreported", async () => {
    const body = chatBody("not even json {", { done_reason: "length" });
    expect(await codeOf(ask(body))).toBe("invalid_output");
    const full_ = chatBody("not even json {", { prompt_eval_count: full });
    expect(await codeOf(ask(full_))).toBe("too_long");
  });

  it("still maps malformed JSON content and a schema-shape failure to invalid_output", async () => {
    expect(await codeOf(ask(chatBody("{broken")))).toBe("invalid_output");
    expect(
      await codeOf(ask(JSON.stringify({ message: { content: {} }, done_reason: "stop" }))),
    ).toBe("invalid_output");
  });

  it("keeps the existing error mappings and size limit", async () => {
    expect(
      await codeOf(provider(respond("{}", { status: 404 }) as never).generateStructured(request())),
    ).toBe("model_unavailable");
    expect(
      await codeOf(provider(respond("{}", { status: 500 }) as never).generateStructured(request())),
    ).toBe("provider_unavailable");
    const huge = chatBody(JSON.stringify({ pad: "a".repeat(MAX_RESPONSE_CHARS) }));
    expect(await codeOf(ask(huge))).toBe("invalid_output");
  });
});
