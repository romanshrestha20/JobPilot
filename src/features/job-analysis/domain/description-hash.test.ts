import { describe, expect, it } from "vitest";
import { hashDescription, normalizeDescription } from "./description-hash";

describe("hashDescription", () => {
  it("is a 64-character lowercase hex digest, the shape the table requires", () => {
    expect(hashDescription("Build things.")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores whitespace-only differences", () => {
    expect(hashDescription("Build   things.\n\nWith  Go.")).toBe(
      hashDescription(" Build things. With Go. "),
    );
  });

  it("ignores Unicode composition differences", () => {
    expect(hashDescription("Zürich")).toBe(hashDescription("Zürich"));
  });

  it("changes when the wording or the case changes", () => {
    expect(hashDescription("Build things.")).not.toBe(hashDescription("Build more things."));
    expect(hashDescription("Java")).not.toBe(hashDescription("java"));
  });

  it("normalizes without lowercasing", () => {
    expect(normalizeDescription("  A \t B\n")).toBe("A B");
  });
});
