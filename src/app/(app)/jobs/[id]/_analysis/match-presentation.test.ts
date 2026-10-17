import { describe, expect, it, vi } from "vitest";

// The public index is server-only and pulls in the environment; the presentation code only
// needs its pure constants, which are re-exported here from their own modules.
vi.mock("@/features/job-analysis", async () => ({
  ...(await import("@/features/job-analysis/domain/match-v1")),
  SKILL_STATE_REASONS: (await import("@/features/job-analysis/domain/skill-state"))
    .SKILL_STATE_REASONS,
}));

import { EVAL_FIXTURES } from "@/features/job-analysis/fixtures";
import { scoreMatch } from "@/features/job-analysis/domain/score-match";
import { SKILL_STATES } from "@/features/job-analysis/domain/skill-state";
import type { GroundedRequirements } from "@/features/job-analysis";
const { SKILL_STATE_LABELS, presentMatch } = await import("./match-presentation");

const skill = (name: string, mapped = true) => ({
  key: name.toLowerCase(),
  name,
  mapped,
  quote: `Need ${name}.`,
});
const base: GroundedRequirements = {
  schemaVersion: 1,
  dictionaryVersion: "skills-v1",
  requiredSkills: [skill("TypeScript"), skill("Kubernetes")],
  preferredSkills: [skill("Docker")],
  minYearsExperience: 3,
  languages: [],
  workMode: "remote",
  locations: [],
  droppedUngrounded: 0,
};
const profile = {
  skills: [
    { name: "TypeScript", level: "advanced", yearsOfExperience: 4, evidence: "x" },
    { name: "Docker", level: null, yearsOfExperience: null, evidence: null },
  ],
  yearsOfExperience: 5,
  languages: [],
  workModes: ["remote" as const],
  location: null,
};

describe("presentMatch", () => {
  it("shows score, label, coverage, version and the disclaimer for a scored match", () => {
    const view = presentMatch(scoreMatch(base, profile));
    expect(view.status).toBe("scored");
    expect(view.headline).toMatch(/^\d+ out of 100$/);
    expect(view.summary).toMatch(/Match score \d+ out of 100, \w+ overlap/);
    expect(view.label).toMatch(/overlap$/);
    expect(view.coverageText).toMatch(/^\d+% of the scoring weight could be assessed$/);
    expect(view.versionText).toBe("Scoring match-v1, skill list skills-v1");
    expect(view.disclaimer).toMatch(/not a prediction/);
  });

  it("groups skills by state: each state and its reason once, in a fixed order", () => {
    for (const state of SKILL_STATES) {
      expect(SKILL_STATE_LABELS[state], state).toMatch(/\S/);
    }
    const view = presentMatch(scoreMatch(base, profile));
    // Required: TypeScript is matched (described), Kubernetes is absent.
    expect(view.required.map((g) => [g.state, g.label, g.skills.map((x) => x.name)])).toEqual([
      ["matched", "Matched", ["TypeScript"]],
      ["absent", "Not in your profile", ["Kubernetes"]],
    ]);
    expect(view.preferred.map((g) => [g.state, g.skills.map((x) => x.name)])).toEqual([
      ["listed", ["Docker"]],
    ]);
    // The user's own entry is a detail of a chip; nothing is repeated per skill.
    expect(view.required[0].skills[0].detail).toBe("Advanced · 4 years");
    expect(view.preferred[0].skills[0].detail).toBeNull();
    for (const group of [...view.required, ...view.preferred]) {
      expect(group.reason).toMatch(/\S/);
    }
    // A reason appears once per group, not once per skill.
    expect(view.required[1].reason).not.toBe(view.required[1].label);
    expect(JSON.stringify(view).split(view.required[1].reason).length - 1).toBe(1);
  });

  it("an empty profile is the explicit insufficient-information state with what to add", () => {
    const view = presentMatch(
      scoreMatch(base, {
        skills: [],
        yearsOfExperience: null,
        languages: [],
        workModes: [],
        location: null,
      }),
    );
    expect(view).toMatchObject({
      status: "insufficient_information",
      headline: "Not enough information to score",
      label: null,
    });
    expect(view.missingProfile).toEqual(
      expect.arrayContaining(["Add skills to your profile", "Add your years of experience"]),
    );
    expect(view.summary).toBe("Not enough information to score");
  });

  it("no requirements is its own state", () => {
    const view = presentMatch(
      scoreMatch(
        {
          ...base,
          requiredSkills: [],
          preferredSkills: [],
          minYearsExperience: null,
          workMode: null,
        },
        profile,
      ),
    );
    expect(view).toMatchObject({
      status: "no_requirements",
      headline: "No requirements found in this job description",
      label: null,
    });
  });

  it("lists unmapped requirements by name, marked as not compared", () => {
    const view = presentMatch(
      scoreMatch(
        { ...base, requiredSkills: [skill("TypeScript"), skill("Zorbo", false)] },
        profile,
      ),
    );
    expect(view.unmappedNames).toEqual(["Zorbo"]);
    const group = view.required.find((g) => g.state === "unmapped");
    expect(group).toMatchObject({ label: "Not compared" });
    expect(group?.skills.map((x) => x.name)).toEqual(["Zorbo"]);
    expect(group?.reason).toMatch(/not counted against you/);
  });

  it("only-unmapped skills give insufficient information with nothing to add, and says what the job lacks", () => {
    const view = presentMatch(
      scoreMatch(
        {
          ...base,
          requiredSkills: [skill("Zorbo", false)],
          preferredSkills: [],
          minYearsExperience: null,
          workMode: null,
        },
        profile,
      ),
    );
    expect(view.status).toBe("insufficient_information");
    expect(view.missingProfile).toEqual([]);
    expect(view.jobNotStated).toContain("The job does not state a minimum experience");
  });

  it("components show weight, a percentage or 'Not assessed' with the reason", () => {
    const view = presentMatch(scoreMatch(base, profile));
    const byLabel = Object.fromEntries(view.components.map((c) => [c.label, c]));
    expect(byLabel["Required skills"]).toMatchObject({
      weightText: "50%",
      resultText: "50%",
      note: null,
    });
    expect(byLabel["Languages"]).toMatchObject({
      resultText: "Not assessed",
      note: "The job does not require a language.",
    });
  });

  it("renders every shared evaluation fixture without throwing, for an empty and a rich profile", () => {
    for (const fixture of EVAL_FIXTURES) {
      const required = (fixture.expect.required ?? []).map((k) => skill(k));
      const requirements: GroundedRequirements = {
        ...base,
        requiredSkills: required,
        preferredSkills: (fixture.expect.preferred ?? []).map((k) => skill(k)),
        minYearsExperience: fixture.expect.minYears ?? null,
        workMode: fixture.expect.workMode ?? null,
      };
      for (const p of [profile, { ...profile, skills: [], workModes: [] }]) {
        const view = presentMatch(scoreMatch(requirements, p));
        expect(view.headline, fixture.id).toMatch(/\S/);
        expect(view.components).toHaveLength(5);
      }
    }
  });
});
