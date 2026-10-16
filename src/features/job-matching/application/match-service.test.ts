import { describe, expect, it, vi } from "vitest";
import type { GroundedRequirements } from "@/features/job-analysis";
import { scoreMatch } from "@/features/job-analysis/domain/score-match";
import { type AnalysisSource, type ProfileSource, createMatchService } from "./match-service";

const ALICE = { id: "user-alice" };
const JOB = "11111111-1111-4111-8111-111111111111";

const skill = (name: string) => ({
  key: name.toLowerCase(),
  name,
  mapped: true,
  quote: `Need ${name}.`,
});
const requirements = (over: Partial<GroundedRequirements> = {}): GroundedRequirements => ({
  schemaVersion: 1,
  dictionaryVersion: "skills-v1",
  requiredSkills: [skill("TypeScript"), skill("PostgreSQL")],
  preferredSkills: [skill("Docker")],
  minYearsExperience: 3,
  languages: [],
  workMode: "remote",
  locations: [],
  droppedUngrounded: 0,
  ...over,
});

const FULL_PROFILE = {
  location: "Helsinki",
  yearsOfExperience: 5,
  languages: ["English"],
  workModes: ["remote" as const],
};
const SKILLS = [
  { name: "TypeScript", level: "advanced", yearsOfExperience: 4, evidence: "Built APIs." },
  { name: "PostgreSQL", level: null, yearsOfExperience: null, evidence: null },
];

function setup(opts: {
  view?: Awaited<ReturnType<AnalysisSource["getMyAnalysisView"]>>;
  profile?: Awaited<ReturnType<ProfileSource["getMyProfile"]>>;
  skills?: Awaited<ReturnType<ProfileSource["listMySkills"]>>;
}) {
  const getMyAnalysisView = vi.fn(async () =>
    opts.view === undefined
      ? { current: { id: "analysis-1", requirements: requirements() }, stale: false }
      : opts.view,
  );
  const getMyProfile = vi.fn(async () =>
    opts.profile === undefined ? FULL_PROFILE : opts.profile,
  );
  const listMySkills = vi.fn(async () => opts.skills ?? SKILLS);
  const score = vi.fn(scoreMatch);
  const service = createMatchService({
    analyses: { getMyAnalysisView },
    profiles: { getMyProfile, listMySkills },
    score,
  });
  return { service, getMyAnalysisView, getMyProfile, listMySkills, score };
}

describe("getMyMatch ownership and availability", () => {
  it("a job that is missing, malformed or someone else's is one not_found, and reads no profile", async () => {
    const t = setup({ view: null });
    for (const id of [JOB, "not-a-uuid", "", null, 42]) {
      expect(await t.service.getMyMatch(ALICE, id)).toEqual({ ok: false, reason: "not_found" });
    }
    expect(t.getMyProfile).not.toHaveBeenCalled();
    expect(t.listMySkills).not.toHaveBeenCalled();
    expect(t.score).not.toHaveBeenCalled();
  });

  it("asks for the analysis and the profile as the same session user, never another", async () => {
    const t = setup({});
    await t.service.getMyMatch(ALICE, JOB);
    expect(t.getMyAnalysisView).toHaveBeenCalledWith(ALICE, JOB);
    expect(t.getMyProfile).toHaveBeenCalledWith(ALICE);
    expect(t.listMySkills).toHaveBeenCalledWith(ALICE);
  });

  it.each([
    ["no completed analysis", { current: null, stale: false }],
    [
      "a completed run whose stored result is invalid",
      { current: { id: "a", requirements: null }, stale: false },
    ],
  ])("%s: no score, and the profile is not read", async (_name, view) => {
    const t = setup({ view });
    expect(await t.service.getMyMatch(ALICE, JOB)).toEqual({
      ok: true,
      state: "no_completed_analysis",
    });
    expect(t.getMyProfile).not.toHaveBeenCalled();
    expect(t.score).not.toHaveBeenCalled();
  });
});

describe("getMyMatch results", () => {
  it("scores with match-v1 from the analysis and the user's own profile", async () => {
    const t = setup({});
    const result = await t.service.getMyMatch(ALICE, JOB);
    if (!result.ok || result.state !== "ready") throw new Error("expected a ready match");
    expect(result.analysisId).toBe("analysis-1");
    expect(result.breakdown.version).toBe("match-v1");
    expect(result.breakdown.status).toBe("scored");
    // The scorer got exactly the explicit arguments.
    expect(t.score).toHaveBeenCalledWith(requirements(), {
      skills: SKILLS.map((s) => ({ ...s })),
      yearsOfExperience: 5,
      languages: ["English"],
      workModes: ["remote"],
      location: "Helsinki",
    });
  });

  it("matches the pure scorer exactly (no second implementation)", async () => {
    const t = setup({});
    const result = await t.service.getMyMatch(ALICE, JOB);
    const direct = scoreMatch(requirements(), {
      skills: SKILLS,
      yearsOfExperience: 5,
      languages: ["English"],
      workModes: ["remote"],
      location: "Helsinki",
    });
    expect(result).toMatchObject({ breakdown: direct });
  });

  it("an absent profile with empty skills is insufficient information, with no invented score", async () => {
    const t = setup({ profile: null, skills: [] });
    const result = await t.service.getMyMatch(ALICE, JOB);
    if (!result.ok || result.state !== "ready") throw new Error("expected ready");
    expect(result.breakdown).toMatchObject({ status: "insufficient_information", score: null });
    expect(result.breakdown.missingProfileData).toContain("skills");
  });

  it("skills without a profile row are still used", async () => {
    const t = setup({ profile: null });
    const result = await t.service.getMyMatch(ALICE, JOB);
    if (!result.ok || result.state !== "ready") throw new Error("expected ready");
    const required = result.breakdown.skills.filter((s) => s.list === "required");
    expect(required.map((s) => s.state)).toEqual(["listed", "matched"]);
  });

  it("empty skills but a full profile: skill components are not assessed", async () => {
    const t = setup({ skills: [] });
    const result = await t.service.getMyMatch(ALICE, JOB);
    if (!result.ok || result.state !== "ready") throw new Error("expected ready");
    const byId = Object.fromEntries(result.breakdown.components.map((c) => [c.id, c]));
    expect(byId.required_skills).toMatchObject({
      assessable: false,
      reason: "profile_has_no_skills",
    });
    expect(byId.preferred_skills).toMatchObject({ assessable: false });
    expect(result.breakdown.status).toBe("insufficient_information");
  });

  it("a missing location does not change a remote job's result, and is asked for on-site jobs", async () => {
    const remote = await setup({ profile: { ...FULL_PROFILE, location: null } }).service.getMyMatch(
      ALICE,
      JOB,
    );
    const remoteScored = await setup({}).service.getMyMatch(ALICE, JOB);
    if (
      !remote.ok ||
      remote.state !== "ready" ||
      !remoteScored.ok ||
      remoteScored.state !== "ready"
    )
      throw new Error("expected ready");
    expect(remote.breakdown.score).toBe(remoteScored.breakdown.score);
    expect(remote.breakdown.missingProfileData).not.toContain("location");

    const onsite = await setup({
      view: {
        current: {
          id: "a",
          requirements: requirements({ workMode: "onsite", locations: ["Helsinki"] }),
        },
        stale: false,
      },
      profile: { ...FULL_PROFILE, location: null, workModes: ["onsite"] },
    }).service.getMyMatch(ALICE, JOB);
    if (!onsite.ok || onsite.state !== "ready") throw new Error("expected ready");
    expect(onsite.breakdown.missingProfileData).toContain("location");
  });

  it("an analysis with no requirements is no_requirements, not a score", async () => {
    const t = setup({
      view: {
        current: {
          id: "a",
          requirements: requirements({
            requiredSkills: [],
            preferredSkills: [],
            minYearsExperience: null,
            workMode: null,
          }),
        },
        stale: false,
      },
    });
    const result = await t.service.getMyMatch(ALICE, JOB);
    if (!result.ok || result.state !== "ready") throw new Error("expected ready");
    expect(result.breakdown).toMatchObject({ status: "no_requirements", score: null, label: null });
  });

  it("unmapped requirements are shown as not compared and do not lower the score", async () => {
    const unmapped = { key: "zorbo", name: "Zorbo", mapped: false, quote: "Need Zorbo." };
    const withUnmapped = await setup({
      view: {
        current: {
          id: "a",
          requirements: requirements({ requiredSkills: [skill("TypeScript"), unmapped] }),
        },
        stale: false,
      },
    }).service.getMyMatch(ALICE, JOB);
    const without = await setup({
      view: {
        current: { id: "a", requirements: requirements({ requiredSkills: [skill("TypeScript")] }) },
        stale: false,
      },
    }).service.getMyMatch(ALICE, JOB);
    if (
      !withUnmapped.ok ||
      withUnmapped.state !== "ready" ||
      !without.ok ||
      without.state !== "ready"
    )
      throw new Error("expected ready");
    expect(withUnmapped.breakdown.skills.find((s) => s.name === "Zorbo")).toMatchObject({
      state: "unmapped",
      credit: null,
    });
    expect(withUnmapped.breakdown.score).toBe(without.breakdown.score);
  });

  it("reports a stale analysis as stale but still scores it", async () => {
    const t = setup({
      view: { current: { id: "a", requirements: requirements() }, stale: true },
    });
    const result = await t.service.getMyMatch(ALICE, JOB);
    expect(result).toMatchObject({ ok: true, state: "ready", stale: true });
  });

  it("the result carries no user id, profile row or other user's data", async () => {
    const t = setup({});
    const text = JSON.stringify(await t.service.getMyMatch(ALICE, JOB));
    expect(text).not.toContain("user-alice");
  });
});
