import { describe, expect, it } from "vitest";
import { createLogger, redact } from "./log";

function capture() {
  const lines: { level: string; entry: Record<string, unknown> }[] = [];
  const logger = createLogger((level, line) => lines.push({ level, entry: JSON.parse(line) }));
  return { logger, lines };
}

describe("logger allowlist", () => {
  it("writes allowlisted fields", () => {
    const { logger, lines } = capture();
    logger.warn({
      event: "ai.generate_failed",
      code: "timeout",
      provider: "ollama",
      durationMs: 12,
    });
    expect(lines[0].level).toBe("warn");
    expect(lines[0].entry).toMatchObject({
      level: "warn",
      event: "ai.generate_failed",
      code: "timeout",
      provider: "ollama",
      durationMs: 12,
    });
    expect(typeof lines[0].entry.time).toBe("string");
  });

  it("drops every field that is not on the list", () => {
    const out = redact({
      event: "x",
      prompt: "Summarise this CV",
      jobDescription: "secret job text",
      modelOutput: "{...}",
      token: "abc",
      password: "hunter2",
      email: "a@b.c",
      error: new Error("connect ECONNREFUSED"),
      level: "info",
      time: "forged",
    });
    expect(out).toEqual({ event: "x" });
  });

  it("drops non-primitive values even for allowed keys", () => {
    const out = redact({
      event: "x",
      code: { message: "leak" },
      durationMs: Number.NaN,
      attempt: [1],
    });
    expect(out).toEqual({ event: "x" });
  });

  it("cannot be used to forge level or time", () => {
    const { logger, lines } = capture();
    logger.info({ event: "x", level: "error", time: "1970" } as never);
    expect(lines[0].entry.level).toBe("info");
    expect(lines[0].entry.time).not.toBe("1970");
  });

  it("strips control characters and truncates long strings", () => {
    const out = redact({ event: "x", code: `a\nb‮c${"z".repeat(500)}` });
    expect(String(out.code)).not.toMatch(/[\n‮]/);
    expect(String(out.code).length).toBeLessThanOrEqual(100);
  });

  it("replaces an unsafe event name", () => {
    expect(redact({ event: "Has Spaces\nand newline" }).event).toBe("invalid_event");
    expect(redact({}).event).toBe("invalid_event");
  });

  it("never serialises a dropped secret into the output line", () => {
    const { logger } = capture();
    const lines: string[] = [];
    createLogger((_l, line) => lines.push(line)).error({
      event: "x",
      authorization: "Bearer sk-secret",
    } as never);
    expect(lines[0]).not.toContain("sk-secret");
    expect(logger).toBeDefined();
  });
});
