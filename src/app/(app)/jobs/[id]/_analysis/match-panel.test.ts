import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GroundedRequirements } from "@/features/job-analysis";
import { scoreMatch } from "@/features/job-analysis/domain/score-match";

// The public indexes are server-only and need the environment; only pure constants are used.
vi.mock("server-only", () => ({}));
vi.mock("@/features/job-matching", () => ({ getMyMatch: vi.fn() }));
vi.mock("@/features/job-analysis", async () => ({
  ...(await import("@/features/job-analysis/domain/match-v1")),
  SKILL_STATE_REASONS: (await import("@/features/job-analysis/domain/skill-state"))
    .SKILL_STATE_REASONS,
}));

const { MatchBody } = await import("./match-panel");

const skill = (name: string, mapped = true) => ({
  key: name.toLowerCase(),
  name,
  mapped,
  quote: `Need ${name}.`,
});
const requirements = (over: Partial<GroundedRequirements> = {}): GroundedRequirements => ({
  schemaVersion: 1,
  dictionaryVersion: "skills-v1",
  requiredSkills: [skill("TypeScript"), skill("PostgreSQL")],
  preferredSkills: [skill("Docker")],
  minYearsExperience: null,
  languages: [],
  workMode: null,
  locations: [],
  droppedUngrounded: 0,
  ...over,
});
const profile = {
  skills: [
    { name: "TypeScript", level: "advanced", yearsOfExperience: 4, evidence: "x" },
    { name: "PostgreSQL", level: null, yearsOfExperience: null, evidence: null },
  ],
  yearsOfExperience: null,
  languages: [],
  workModes: [],
  location: null,
};
const html = (reqs: GroundedRequirements, stale = false, p = profile) =>
  renderToStaticMarkup(
    createElement(MatchBody, {
      result: {
        ok: true,
        state: "ready",
        analysisId: "a",
        stale,
        breakdown: scoreMatch(reqs, p),
      },
    }),
  );

describe("stale analysis", () => {
  it("marks the score itself, the label row and the banner, and says the score describes older text", () => {
    const markup = html(requirements(), true);
    expect(markup).toContain("Out of date");
    expect(markup).toContain("Match score (out of date): ");
    expect(markup).toMatch(/score below describes the older text/);
    // The badge sits with the label, not only in a banner.
    expect(markup).toMatch(/Partial overlap|Good overlap|Strong overlap|Limited overlap/);
    expect(markup.match(/Out of date/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("is not marked when the analysis matches the current description", () => {
    const markup = html(requirements(), false);
    expect(markup).not.toContain("Out of date");
    expect(markup).not.toContain("older text");
    expect(markup).toContain("Match score: ");
  });

  it("is marked for insufficient information too", () => {
    const markup = html(requirements(), true, { ...profile, skills: [] });
    expect(markup).toContain("Not enough information to score");
    expect(markup).toContain("Out of date");
  });
});

describe("unmapped and skill states in the markup", () => {
  const markup = html(
    requirements({ requiredSkills: [skill("TypeScript"), skill("Zorbo", false)] }),
  );
  /** The group (heading line plus chips) that contains a skill name. */
  const groupOf = (name: string) =>
    markup.split('<div class="flex min-w-0 flex-col gap-2">').find((g) => g.includes(`>${name}`));

  it("never shows an unmapped requirement as matched", () => {
    const group = groupOf("Zorbo");
    expect(group).toBeDefined();
    expect(group).toContain("Not compared");
    expect(group).toContain("not counted against you");
    expect(group).not.toContain("Matched");
    expect(group).not.toContain("Listed");
    expect(group).not.toContain("TypeScript");
  });

  it("shows genuine states as words, once per group", () => {
    expect(groupOf("TypeScript")).toContain("Matched");
    expect(groupOf("TypeScript")).toContain("(Advanced · 4 years)");
    expect(groupOf("Docker")).toContain("Not in your profile");
    // The explanation of a state appears once, however many skills share it.
    const many = html(
      requirements({
        requiredSkills: [skill("Git"), skill("Docker"), skill("Kubernetes")],
        preferredSkills: [],
      }),
      false,
      {
        ...profile,
        skills: [{ name: "TypeScript", level: null, yearsOfExperience: null, evidence: null }],
      },
    );
    expect(many.split("Not in your profile").length - 1).toBe(1);
  });

  it("keeps Not assessed and Needs profile skills distinct from matched or missing", () => {
    const empty = html(requirements(), false, { ...profile, skills: [] });
    expect(empty).toContain("Needs profile skills");
    expect(empty).toContain("Not assessed");
    expect(empty).not.toContain("Matched");
    expect(empty).not.toContain("Not in your profile");
    expect(empty).not.toMatch(/out of 100/);
  });

  it("uses a heading order without skipped levels and labels its table", () => {
    expect(markup).toContain("<h3");
    expect(markup).not.toContain("<h4");
    expect(markup).toContain("<caption");
    expect(markup).toContain('scope="row"');
  });

  it("states version, coverage and the disclaimer once", () => {
    expect(markup).toContain("Scoring match-v1, skill list skills-v1");
    expect(markup).toMatch(/\d+% of the scoring weight could be assessed/);
    expect(markup.split("not a prediction").length - 1).toBe(1);
  });
});

describe("no requirements", () => {
  it("is its own state with no number, no table and no disclaimer-as-score", () => {
    const markup = html(
      requirements({ requiredSkills: [], preferredSkills: [], minYearsExperience: null }),
    );
    expect(markup).toContain("No requirements found in this job description");
    expect(markup).not.toMatch(/out of 100/);
    expect(markup).not.toContain("<table");
  });
});
