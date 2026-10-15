import { describe, expect, it, vi } from "vitest";
import { AiError } from "./errors";
import { MAX_RESPONSE_CHARS, createOllamaProvider } from "./ollama-provider";
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

const chatBody = (content: string) =>
  JSON.stringify({ model: "m", message: { role: "assistant", content }, done: true });
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
