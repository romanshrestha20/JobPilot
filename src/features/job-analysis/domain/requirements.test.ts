import { describe, expect, it } from "vitest";
import { REQUIREMENT_LIMITS, jobRequirementsSchema } from "./requirements";

const valid = {
  schemaVersion: 1,
  requiredSkills: [{ name: "TypeScript", quote: "Strong TypeScript" }],
  preferredSkills: [],
  minYearsExperience: 5,
  languages: [{ language: "English", required: true }],
  workMode: "remote",
  locations: ["Berlin"],
};
const parse = (patch: object) => jobRequirementsSchema.safeParse({ ...valid, ...patch });

describe("JobRequirements v1 schema", () => {
  it("accepts a valid object, and an all-empty one", () => {
    expect(parse({}).success).toBe(true);
    expect(
      parse({
        requiredSkills: [],
        minYearsExperience: null,
        languages: [],
        workMode: null,
        locations: [],
      }).success,
    ).toBe(true);
  });

  it("is strict: unknown keys are rejected at every level", () => {
    expect(parse({ isAdmin: true }).success).toBe(false);
    expect(parse({ requiredSkills: [{ name: "A", quote: "A", score: 9 }] }).success).toBe(false);
    expect(
      parse({ languages: [{ language: "English", required: true, level: "C2" }] }).success,
    ).toBe(false);
  });

  it("pins the schema version", () => {
    expect(parse({ schemaVersion: 2 }).success).toBe(false);
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.schemaVersion;
    expect(jobRequirementsSchema.safeParse(rest).success).toBe(false);
  });

  it("bounds every array and string", () => {
    const skill = (i: number) => ({ name: `S${i}`, quote: `S${i}` });
    const many = Array.from({ length: REQUIREMENT_LIMITS.skills + 1 }, (_, i) => skill(i));
    expect(parse({ requiredSkills: many }).success).toBe(false);
    expect(parse({ requiredSkills: many.slice(0, REQUIREMENT_LIMITS.skills) }).success).toBe(true);
    expect(parse({ requiredSkills: [{ name: "a".repeat(81), quote: "a" }] }).success).toBe(false);
    expect(parse({ requiredSkills: [{ name: "a", quote: "a".repeat(201) }] }).success).toBe(false);
    expect(parse({ locations: Array.from({ length: 6 }, (_, i) => `L${i}`) }).success).toBe(false);
    expect(
      parse({
        languages: Array.from({ length: 11 }, (_, i) => ({ language: `L${i}`, required: false })),
      }).success,
    ).toBe(false);
  });

  it("rejects empty, blank and control-character strings", () => {
    expect(parse({ requiredSkills: [{ name: "  ", quote: "x" }] }).success).toBe(false);
    expect(parse({ requiredSkills: [{ name: "a\u0000b", quote: "x" }] }).success).toBe(false);
    expect(parse({ locations: ["a‮b"] }).success).toBe(false);
  });

  it("validates years and work mode", () => {
    expect(parse({ minYearsExperience: -1 }).success).toBe(false);
    expect(parse({ minYearsExperience: 61 }).success).toBe(false);
    expect(parse({ minYearsExperience: 2.5 }).success).toBe(false);
    expect(parse({ minYearsExperience: "5" }).success).toBe(false);
    expect(parse({ workMode: "anywhere" }).success).toBe(false);
  });
});
