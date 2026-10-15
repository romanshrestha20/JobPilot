import { describe, expect, it } from "vitest";
import { cleanSkillName, toSkillKey } from "./skill-key";

describe("toSkillKey", () => {
  it("ignores case and surrounding or repeated whitespace", () => {
    expect(toSkillKey("TypeScript")).toBe("typescript");
    expect(toSkillKey("  TYPESCRIPT ")).toBe("typescript");
    expect(toSkillKey("Machine \t  Learning")).toBe("machine learning");
  });

  it("normalizes Unicode compatibility forms", () => {
    expect(toSkillKey("ＴｙｐｅＳｃｒｉｐｔ")).toBe("typescript");
    expect(toSkillKey("Café")).toBe(toSkillKey("Café"));
  });

  it("keeps punctuation, so different skills stay different", () => {
    expect(new Set([toSkillKey("C"), toSkillKey("C++"), toSkillKey("C#")]).size).toBe(3);
    expect(toSkillKey("Node.js")).not.toBe(toSkillKey("Nodejs"));
  });

  it("does not map aliases yet (the dictionary arrives with the matching domain)", () => {
    expect(toSkillKey("Postgres")).not.toBe(toSkillKey("PostgreSQL"));
  });
});

describe("cleanSkillName", () => {
  it("keeps the user's casing", () => {
    expect(cleanSkillName("  React   Native ")).toBe("React Native");
  });
});
