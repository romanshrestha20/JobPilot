import { describe, expect, it } from "vitest";
import { parseEnv } from "./env-schema";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("AI environment rules", () => {
  it("requires LLM_MODEL for the ollama provider", () => {
    expect(() => parseEnv({ ...base, LLM_PROVIDER: "ollama" })).toThrow(/LLM_MODEL/);
    expect(() => parseEnv({ ...base, LLM_PROVIDER: "ollama", LLM_MODEL: "  " })).toThrow(
      /LLM_MODEL/,
    );
  });

  it("defaults to ollama, so a missing model is an error by default", () => {
    expect(() => parseEnv(base)).toThrow(/LLM_MODEL/);
  });

  it("accepts ollama with a model", () => {
    const env = parseEnv({ ...base, LLM_PROVIDER: "ollama", LLM_MODEL: "qwen2.5:7b-instruct" });
    expect(env.LLM_MODEL).toBe("qwen2.5:7b-instruct");
  });

  it("allows the demo provider without LLM_MODEL (unset or blank) outside production", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(parseEnv({ ...base, NODE_ENV, LLM_PROVIDER: "demo" }).LLM_MODEL).toBeUndefined();
      expect(
        parseEnv({ ...base, NODE_ENV, LLM_PROVIDER: "demo", LLM_MODEL: "" }).LLM_MODEL,
      ).toBeUndefined();
    }
  });

  it("rejects the demo provider in production, with or without a model", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", LLM_PROVIDER: "demo" })).toThrow(
      /demo is not allowed/,
    );
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", LLM_PROVIDER: "demo", LLM_MODEL: "x" }),
    ).toThrow(/demo is not allowed/);
  });

  it("has no override that lets demo run in production", () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        LLM_PROVIDER: "demo",
        ALLOW_DEMO_IN_PRODUCTION: "true",
        LLM_ALLOW_DEMO: "1",
      }),
    ).toThrow(/demo is not allowed/);
  });

  it("allows ollama in production", () => {
    expect(
      parseEnv({ ...base, NODE_ENV: "production", LLM_PROVIDER: "ollama", LLM_MODEL: "m" })
        .NODE_ENV,
    ).toBe("production");
  });

  it("validates LLM_TIMEOUT_MS: default 60000, bounded, integer", () => {
    const ok = { ...base, LLM_PROVIDER: "demo" };
    expect(parseEnv(ok).LLM_TIMEOUT_MS).toBe(60_000);
    expect(parseEnv({ ...ok, LLM_TIMEOUT_MS: "5000" }).LLM_TIMEOUT_MS).toBe(5_000);
    for (const bad of ["999", "300001", "abc", "1500.5", "-1", "0"]) {
      expect(() => parseEnv({ ...ok, LLM_TIMEOUT_MS: bad })).toThrow();
    }
  });

  it("keeps the unrelated rules", () => {
    const ok = { ...base, LLM_PROVIDER: "demo" };
    expect(() => parseEnv({ ...ok, BETTER_AUTH_SECRET: "short" })).toThrow();
    expect(() => parseEnv({ ...ok, DATABASE_URL: "not a url" })).toThrow();
    expect(() => parseEnv({ ...ok, LLM_PROVIDER: "openai" })).toThrow();
    expect(parseEnv(ok).OLLAMA_URL).toBe("http://localhost:11434");
    expect(parseEnv(ok).EMBED_MODEL).toBe("bge-m3");
  });
});
