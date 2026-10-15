import { describe, expect, it } from "vitest";
import {
  SCAN_TERMS,
  SKILL_DICTIONARY_VERSION,
  normalizeLanguage,
  normalizeSkillName,
} from "./skill-dictionary";

describe("skill dictionary", () => {
  it("is versioned", () => {
    expect(SKILL_DICTIONARY_VERSION).toBe("skills-v1");
  });

  it.each([
    ["Postgres", "postgresql"],
    ["PostgreSQL", "postgresql"],
    ["  psql ", "postgresql"],
    ["K8s", "kubernetes"],
    ["golang", "go"],
    ["Node", "node.js"],
    ["NodeJS", "node.js"],
    ["ReactJS", "react"],
    ["C#", "c#"],
    ["c++", "c++"],
    ["Ｔypescript", "typescript"],
  ])("maps %s to %s", (name, key) => {
    expect(normalizeSkillName(name)).toMatchObject({ key, mapped: true });
  });

  it("keeps C, C++ and C# apart, and Java apart from JavaScript", () => {
    const keys = ["c", "c++", "c#", "java", "javascript"].map(
      (name) => normalizeSkillName(name).key,
    );
    expect(new Set(keys).size).toBe(5);
  });

  it("flags unknown skills as unmapped and keeps their text", () => {
    expect(normalizeSkillName("  Quantum   Knitting ")).toEqual({
      key: "quantum knitting",
      name: "Quantum Knitting",
      mapped: false,
    });
  });

  it("does not offer ambiguous words for free-text scanning", () => {
    const terms = SCAN_TERMS.map((entry) => entry.term.toLowerCase());
    for (const ambiguous of ["go", "r", "c", "next", "spring", "express", "ts", "ml"]) {
      expect(terms).not.toContain(ambiguous);
    }
    expect(terms).toContain("golang");
  });

  it("normalizes language names", () => {
    expect(normalizeLanguage(" english ")).toBe("English");
    expect(normalizeLanguage("Klingon")).toBe("Klingon");
  });
});
