import { describe, expect, it } from "vitest";
import { SKILL_LIMITS, skillIdSchema, skillInputSchema, toSkillWrite } from "./validation";

const valid = { name: "TypeScript", level: null, yearsOfExperience: null, evidence: null };

function issuesFor(input: unknown) {
  const result = skillInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
}

describe("skillInputSchema", () => {
  it("accepts a name alone", () => {
    expect(skillInputSchema.parse(valid)).toEqual(valid);
  });

  it("accepts every field", () => {
    const input = {
      name: "PostgreSQL",
      level: "advanced",
      yearsOfExperience: 6,
      evidence: "Tuned a 2 TB analytics database.",
    };
    expect(skillInputSchema.parse(input)).toEqual(input);
  });

  it("cleans the name and turns blank evidence into null", () => {
    expect(
      skillInputSchema.parse({ ...valid, name: "  Machine   Learning ", evidence: "   " }),
    ).toMatchObject({ name: "Machine Learning", evidence: null });
  });

  it("rejects a missing or blank name", () => {
    expect(issuesFor({ ...valid, name: "" })[0]?.path).toEqual(["name"]);
    expect(issuesFor({ ...valid, name: "   " })[0]?.path).toEqual(["name"]);
    expect(issuesFor({ level: null, yearsOfExperience: null, evidence: null })[0]?.path).toEqual([
      "name",
    ]);
  });

  it("limits the name to 80 characters", () => {
    expect(issuesFor({ ...valid, name: "a".repeat(80) })).toEqual([]);
    expect(issuesFor({ ...valid, name: "a".repeat(81) })[0]?.path).toEqual(["name"]);
  });

  it("limits the key as well: lowercasing must not push a name over the database limit", () => {
    // "İ" lowercases to two code units ("i" + a combining dot).
    const result = skillInputSchema.safeParse({ ...valid, name: "İ".repeat(60) });
    expect(result.success).toBe(false);
  });

  it("rejects control and invisible formatting characters in the name", () => {
    expect(issuesFor({ ...valid, name: "Type\u0000Script" })[0]?.path).toEqual(["name"]);
    expect(issuesFor({ ...valid, name: "Type\nScript" })[0]?.path).toEqual(["name"]);
    expect(issuesFor({ ...valid, name: "Type​Script" })[0]?.path).toEqual(["name"]);
  });

  it("allows line breaks in evidence but no other control characters", () => {
    expect(issuesFor({ ...valid, evidence: "Line one\nLine two" })).toEqual([]);
    expect(issuesFor({ ...valid, evidence: "bad\u0007bell" })[0]?.path).toEqual(["evidence"]);
  });

  it("limits evidence to 500 characters", () => {
    expect(issuesFor({ ...valid, evidence: "e".repeat(SKILL_LIMITS.evidenceMax) })).toEqual([]);
    expect(issuesFor({ ...valid, evidence: "e".repeat(501) })[0]?.path).toEqual(["evidence"]);
  });

  it.each(["beginner", "intermediate", "advanced", "expert"])("accepts level %s", (level) => {
    expect(issuesFor({ ...valid, level })).toEqual([]);
  });

  it.each(["guru", "Expert", "", 3, undefined])("rejects level %j", (level) => {
    expect(issuesFor({ ...valid, level })[0]?.path).toEqual(["level"]);
  });

  it.each([0, 1, 60])("accepts %i years", (yearsOfExperience) => {
    expect(issuesFor({ ...valid, yearsOfExperience })).toEqual([]);
  });

  it.each([-1, 61, 1.5, Number.NaN, Infinity, "5", undefined])(
    "rejects %j years",
    (yearsOfExperience) => {
      expect(issuesFor({ ...valid, yearsOfExperience })[0]?.path).toEqual(["yearsOfExperience"]);
    },
  );

  it.each(["id", "userId", "skillKey", "createdAt", "updatedAt", "extra"])(
    "rejects an unknown or protected key: %s",
    (key) => {
      expect(skillInputSchema.safeParse({ ...valid, [key]: "x" }).success).toBe(false);
    },
  );
});

describe("toSkillWrite", () => {
  it("derives the canonical key on the server from the cleaned name", () => {
    const write = toSkillWrite(skillInputSchema.parse({ ...valid, name: "  Type  Script " }));
    expect(write).toMatchObject({ name: "Type Script", skillKey: "type script" });
  });
});

describe("skillIdSchema", () => {
  it("accepts a UUID only", () => {
    expect(skillIdSchema.safeParse("3f0c2d1e-5b8a-4c7e-9a41-0d6f2b7e8c19").success).toBe(true);
    expect(skillIdSchema.safeParse("1; drop table candidate_skill").success).toBe(false);
    expect(skillIdSchema.safeParse("").success).toBe(false);
  });
});
