import { describe, expect, it } from "vitest";
import {
  SKILL_STATES,
  SKILL_STATE_REASONS,
  classifyRequirementSkill,
  indexCandidateSkills,
  isDescribed,
  type MatchSkill,
} from "./skill-state";

const own = (overrides: Partial<MatchSkill> & { name: string }): MatchSkill => ({
  level: null,
  yearsOfExperience: null,
  evidence: null,
  ...overrides,
});

describe("isDescribed", () => {
  it("needs a level and at least one of years or evidence", () => {
    expect(isDescribed({ level: "advanced", yearsOfExperience: 3, evidence: null })).toBe(true);
    expect(isDescribed({ level: "advanced", yearsOfExperience: null, evidence: "Built X" })).toBe(
      true,
    );
    expect(isDescribed({ level: "advanced", yearsOfExperience: 0, evidence: null })).toBe(true);
    expect(isDescribed({ level: "advanced", yearsOfExperience: null, evidence: null })).toBe(false);
    expect(isDescribed({ level: null, yearsOfExperience: 3, evidence: "Built X" })).toBe(false);
    expect(isDescribed({ level: " ", yearsOfExperience: 3, evidence: null })).toBe(false);
  });
});

describe("classifyRequirementSkill", () => {
  const described = own({ name: "Go", level: "expert", yearsOfExperience: 6 });

  it("matched, listed and absent for a mapped requirement", () => {
    const index = indexCandidateSkills([described, own({ name: "Rust" })]);
    expect(classifyRequirementSkill({ name: "Go" }, index)).toMatchObject({
      state: "matched",
      creditHalves: 2,
    });
    expect(classifyRequirementSkill({ name: "Rust" }, index)).toMatchObject({
      state: "listed",
      creditHalves: 1,
    });
    expect(classifyRequirementSkill({ name: "Java" }, index)).toMatchObject({
      state: "absent",
      creditHalves: 0,
    });
  });

  it("an unmapped requirement is not assessable, even when the profile has the same words", () => {
    const index = indexCandidateSkills([
      own({ name: "Frobnicator", level: "expert", yearsOfExperience: 2 }),
    ]);
    expect(classifyRequirementSkill({ name: "Frobnicator" }, index)).toMatchObject({
      state: "unmapped",
      creditHalves: null,
      mapped: false,
    });
  });

  it("with no profile skills a mapped requirement is not assessable, not absent", () => {
    expect(classifyRequirementSkill({ name: "Go" }, indexCandidateSkills([]))).toMatchObject({
      state: "no_profile_skills",
      creditHalves: null,
    });
  });

  it("blank profile skill names are ignored", () => {
    const index = indexCandidateSkills([own({ name: "  " })]);
    expect(index.count).toBe(0);
  });

  it("explains every state in the words of the architecture", () => {
    for (const state of SKILL_STATES) expect(SKILL_STATE_REASONS[state]).not.toBe("");
    expect(SKILL_STATE_REASONS.absent).toBe("Not in your profile");
  });
});
