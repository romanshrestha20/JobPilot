import { describe, expect, it } from "vitest";
import { MATCH_DISCLAIMER, MATCH_VERSION } from "./match-v1";
import type { GroundedRequirements, GroundedSkill } from "./requirements";
import { scoreMatch, type MatchProfile } from "./score-match";
import { SKILL_DICTIONARY_VERSION } from "./skill-dictionary";
import type { MatchSkill } from "./skill-state";

const skill = (name: string): GroundedSkill => ({
  key: name.toLowerCase(),
  name,
  mapped: true,
  quote: `We use ${name}.`,
});

function requirements(overrides: Partial<GroundedRequirements> = {}): GroundedRequirements {
  return {
    schemaVersion: 1,
    dictionaryVersion: SKILL_DICTIONARY_VERSION,
    requiredSkills: [],
    preferredSkills: [],
    minYearsExperience: null,
    languages: [],
    workMode: null,
    locations: [],
    droppedUngrounded: 0,
    ...overrides,
  };
}

const described = (name: string): MatchSkill => ({
  name,
  level: "advanced",
  yearsOfExperience: 4,
  evidence: null,
});
const listed = (name: string): MatchSkill => ({
  name,
  level: null,
  yearsOfExperience: null,
  evidence: null,
});

function profile(overrides: Partial<MatchProfile> = {}): MatchProfile {
  return {
    skills: [],
    yearsOfExperience: null,
    languages: [],
    workModes: [],
    location: null,
    ...overrides,
  };
}

const component = (breakdown: ReturnType<typeof scoreMatch>, id: string) =>
  breakdown.components.find((c) => c.id === id)!;

// Worked example A from docs/ai-architecture.md section 7.6.
const exampleJob = () =>
  requirements({
    requiredSkills: [
      skill("TypeScript"),
      skill("PostgreSQL"),
      skill("Kubernetes"),
      { key: "obscure", name: "Obscure Tool", mapped: false, quote: "We use Obscure Tool." },
    ],
    preferredSkills: [skill("Docker"), skill("GraphQL")],
    minYearsExperience: 5,
    languages: [{ language: "English", required: true }],
    workMode: "hybrid",
    locations: ["Helsinki"],
  });
const exampleProfile = () =>
  profile({
    skills: [described("TypeScript"), listed("PostgreSQL"), described("Docker")],
    yearsOfExperience: 3,
    languages: ["English"],
    workModes: ["remote", "hybrid"],
    location: "Helsinki, Finland",
  });

describe("scoreMatch: worked examples", () => {
  it("A: everything assessable; an exact 61.5 rounds half up to 62", () => {
    const result = scoreMatch(exampleJob(), exampleProfile());
    expect(result.status).toBe("scored");
    expect(result.score).toBe(62);
    expect(result.coverage).toBe(100);
    expect(result.label).toBe("Good overlap");
    expect(result.version).toBe(MATCH_VERSION);
    expect(result.dictionaryVersion).toBe(SKILL_DICTIONARY_VERSION);
    const scores = Object.fromEntries(
      result.components.map((c) => [c.id, c.assessable ? c.score : null]),
    );
    expect(scores).toEqual({
      required_skills: 0.5,
      preferred_skills: 0.5,
      experience: 0.6,
      languages: 1,
      location_work_mode: 1,
    });
  });

  it("B: components the job does not state are removed, not scored as gaps", () => {
    const job = { ...exampleJob(), minYearsExperience: null, languages: [] };
    const result = scoreMatch(job, exampleProfile());
    expect(result.score).toBe(57);
    expect(result.coverage).toBe(75);
    expect(result.label).toBe("Partial overlap");
    expect(result.jobNotStated).toContain("minimum_experience");
    expect(result.jobNotStated).toContain("required_languages");
  });

  it("C: a profile without skills gives no number and says what to add", () => {
    const result = scoreMatch(exampleJob(), { ...exampleProfile(), skills: [] });
    expect(result.status).toBe("insufficient_information");
    expect(result.score).toBeNull();
    expect(result.label).toBeNull();
    expect(result.coverage).toBe(35);
    expect(result.missingProfileData).toContain("skills");
    expect(component(result, "required_skills")).toMatchObject({
      assessable: false,
      reason: "profile_has_no_skills",
    });
  });

  it("always carries the disclaimer", () => {
    expect(scoreMatch(exampleJob(), exampleProfile()).disclaimer).toBe(MATCH_DISCLAIMER);
    expect(scoreMatch(requirements(), profile()).disclaimer).toBe(MATCH_DISCLAIMER);
  });
});

describe("scoreMatch: coverage threshold", () => {
  it("coverage exactly 50 is scored; 45 is not", () => {
    // Required skills alone are 50 of 100.
    const fifty = scoreMatch(
      requirements({ requiredSkills: [skill("TypeScript")] }),
      profile({ skills: [described("TypeScript")] }),
    );
    expect(fifty.coverage).toBe(50);
    expect(fifty.status).toBe("scored");
    expect(fifty.score).toBe(100);

    // Preferred, experience, languages and location are 50 together, so drop one weight of 10...
    const below = scoreMatch(
      requirements({
        preferredSkills: [skill("Docker")],
        minYearsExperience: 2,
        languages: [{ language: "English", required: true }],
      }),
      profile({ skills: [described("Docker")], yearsOfExperience: 5, languages: ["English"] }),
    );
    expect(below.coverage).toBe(40);
    expect(below.status).toBe("insufficient_information");
    expect(below.score).toBeNull();
  });

  it("an exact half rounds up (1 of 8 skills matched is 12.5, shown as 13)", () => {
    const names = ["JavaScript", "Python", "Java", "Rust", "Ruby", "PHP", "SQL", "Redis"];
    const result = scoreMatch(
      requirements({ requiredSkills: names.map(skill) }),
      profile({ skills: [described("Redis")] }),
    );
    expect(result.score).toBe(13);
  });
});

describe("scoreMatch: requirements that are not stated", () => {
  it("no usable requirements is its own state, not an error and not a score", () => {
    const result = scoreMatch(requirements(), profile({ skills: [described("Go")] }));
    expect(result.status).toBe("no_requirements");
    expect(result.score).toBeNull();
    expect(result.coverage).toBe(0);
  });

  it("optional languages alone do not count as requirements", () => {
    const result = scoreMatch(
      requirements({ languages: [{ language: "French", required: false }] }),
      profile(),
    );
    expect(result.status).toBe("no_requirements");
  });

  it("only unmapped skills: shown, not comparable, no number", () => {
    const unmapped: GroundedSkill = {
      key: "x",
      name: "Some Internal Tool",
      mapped: false,
      quote: "q",
    };
    const result = scoreMatch(
      requirements({ requiredSkills: [unmapped] }),
      profile({ skills: [described("Some Internal Tool")] }),
    );
    expect(result.status).toBe("insufficient_information");
    expect(result.coverage).toBe(0);
    expect(result.skills[0]).toMatchObject({ state: "unmapped", credit: null, candidate: null });
    expect(component(result, "required_skills")).toMatchObject({
      assessable: false,
      reason: "no_comparable_skills",
    });
    expect(result.missingProfileData).not.toContain("skills");
  });
});

describe("scoreMatch: skills", () => {
  it("distinguishes described, listed, absent and not assessable, with candidate evidence", () => {
    const result = scoreMatch(
      requirements({
        requiredSkills: [skill("TypeScript"), skill("PostgreSQL"), skill("Kubernetes")],
      }),
      profile({
        skills: [
          {
            name: "TypeScript",
            level: "expert",
            yearsOfExperience: null,
            evidence: "Built a compiler plugin",
          },
          listed("PostgreSQL"),
          described("Docker"),
        ],
      }),
    );
    const byName = Object.fromEntries(result.skills.map((s) => [s.name, s]));
    expect(byName.TypeScript).toMatchObject({ state: "matched", credit: 1 });
    expect(byName.TypeScript.candidate).toEqual({
      name: "TypeScript",
      level: "expert",
      yearsOfExperience: null,
      evidence: "Built a compiler plugin",
    });
    expect(byName.PostgreSQL).toMatchObject({ state: "listed", credit: 0.5 });
    expect(byName.Kubernetes).toMatchObject({ state: "absent", credit: 0, candidate: null });
    expect(byName.Kubernetes.quote).toBe("We use Kubernetes.");
  });

  it("a level alone, or years alone, is listed, not described", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("Rust"), skill("Go")] }),
      profile({
        skills: [
          { name: "Rust", level: "expert", yearsOfExperience: null, evidence: null },
          { name: "Go", level: null, yearsOfExperience: 5, evidence: "Ran services" },
        ],
      }),
    );
    expect(result.skills.map((s) => s.state)).toEqual(["listed", "listed"]);
  });

  it("a blank evidence string does not count as detail", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("Rust")] }),
      profile({
        skills: [{ name: "Rust", level: "expert", yearsOfExperience: null, evidence: "   " }],
      }),
    );
    expect(result.skills[0].state).toBe("listed");
  });

  it("a profile with skills, none of them described, still scores (0.5 each)", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("Rust"), skill("Go")] }),
      profile({ skills: [listed("Rust"), listed("Go")] }),
    );
    expect(result.score).toBe(50);
  });

  it("matches aliases at comparison time: stored 'postgres' meets a 'PostgreSQL' requirement", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("PostgreSQL")] }),
      profile({ skills: [described("postgres")] }),
    );
    expect(result.skills[0]).toMatchObject({ key: "postgresql", state: "matched" });
  });

  it("never matches a skill the profile does not list (no invented qualifications)", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("Java")] }),
      profile({ skills: [described("JavaScript")] }),
    );
    expect(result.skills[0].state).toBe("absent");
    expect(result.score).toBe(0);
  });

  it("does not trust the stored key or mapped flag of a requirement", () => {
    const forged: GroundedSkill = { key: "javascript", name: "Rust", mapped: false, quote: "q" };
    const result = scoreMatch(
      requirements({ requiredSkills: [forged] }),
      profile({ skills: [described("JavaScript"), described("Rust")] }),
    );
    expect(result.skills[0]).toMatchObject({ key: "rust", mapped: true, state: "matched" });
  });

  it("an unmapped candidate skill cannot satisfy anything by accident", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("Rust")] }),
      profile({ skills: [described("Rustacean")] }),
    );
    expect(result.skills[0].state).toBe("absent");
  });

  it("counts a skill named as both required and preferred once, as required", () => {
    const result = scoreMatch(
      requirements({
        requiredSkills: [skill("Docker")],
        preferredSkills: [skill("docker"), skill("Git")],
      }),
      profile({ skills: [described("Docker")] }),
    );
    expect(result.skills.map((s) => [s.list, s.key])).toEqual([
      ["required", "docker"],
      ["preferred", "git"],
    ]);
  });

  it("collapses spellings of one skill within a list", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("PostgreSQL"), skill("Postgres"), skill("psql")] }),
      profile({ skills: [described("PostgreSQL")] }),
    );
    expect(result.skills).toHaveLength(1);
  });

  it("when two profile spellings map to one skill, the described one wins", () => {
    const result = scoreMatch(
      requirements({ requiredSkills: [skill("PostgreSQL")] }),
      profile({ skills: [listed("postgres"), described("PostgreSQL")] }),
    );
    expect(result.skills[0].state).toBe("matched");
    const reversed = scoreMatch(
      requirements({ requiredSkills: [skill("PostgreSQL")] }),
      profile({ skills: [described("PostgreSQL"), listed("postgres")] }),
    );
    expect(reversed).toEqual(result);
  });

  it("handles the maximum of 30 skills per list", () => {
    const names = Array.from({ length: 30 }, (_, i) => `Custom Skill ${i}`);
    const mapped = ["JavaScript", "Python", "Java", "Kotlin", "Swift", "Rust"].map(skill);
    const result = scoreMatch(
      requirements({
        requiredSkills: [
          ...mapped,
          ...names.slice(0, 24).map((n) => ({ key: n, name: n, mapped: false, quote: "q" })),
        ],
      }),
      profile({ skills: [described("Rust")] }),
    );
    expect(result.skills).toHaveLength(30);
    expect(result.score).toBe(Math.round(100 / 6));
  });

  it("sorts skills by list then key, whatever the input order", () => {
    const a = scoreMatch(
      requirements({
        requiredSkills: [skill("Rust"), skill("Go")],
        preferredSkills: [skill("Git"), skill("Docker")],
      }),
      profile({ skills: [described("Go")] }),
    );
    const b = scoreMatch(
      requirements({
        requiredSkills: [skill("Go"), skill("Rust")],
        preferredSkills: [skill("Docker"), skill("Git")],
      }),
      profile({ skills: [described("Go")] }),
    );
    expect(a.skills.map((s) => s.key)).toEqual(["go", "rust", "docker", "git"]);
    expect(a.skills.map((s) => s.key)).toEqual(b.skills.map((s) => s.key));
  });
});

describe("scoreMatch: experience", () => {
  const job = (min: number | null) =>
    requirements({ requiredSkills: [skill("Go")], minYearsExperience: min });
  const base = { skills: [described("Go")] };

  it("is the share of the minimum, with no bonus above it", () => {
    expect(
      component(scoreMatch(job(5), profile({ ...base, yearsOfExperience: 3 })), "experience"),
    ).toMatchObject({ score: 0.6 });
    expect(
      component(scoreMatch(job(5), profile({ ...base, yearsOfExperience: 20 })), "experience"),
    ).toMatchObject({ score: 1 });
  });

  it("a minimum of 0 is always met, also by 0 years", () => {
    expect(
      component(scoreMatch(job(0), profile({ ...base, yearsOfExperience: 0 })), "experience"),
    ).toMatchObject({ assessable: true, score: 1 });
  });

  it("0 years against a real minimum is assessable and scores 0", () => {
    expect(
      component(scoreMatch(job(5), profile({ ...base, yearsOfExperience: 0 })), "experience"),
    ).toMatchObject({ assessable: true, score: 0 });
  });

  it("a profile with years but a job without a minimum is not assessable", () => {
    const result = scoreMatch(job(null), profile({ ...base, yearsOfExperience: 9 }));
    expect(component(result, "experience")).toMatchObject({
      assessable: false,
      reason: "job_states_no_minimum",
    });
  });

  it("a profile without years is not assessable and is reported as missing data", () => {
    const result = scoreMatch(job(5), profile(base));
    expect(component(result, "experience")).toMatchObject({
      assessable: false,
      reason: "profile_has_no_years",
    });
    expect(result.missingProfileData).toContain("years_of_experience");
  });
});

describe("scoreMatch: languages", () => {
  const job = (languages: GroundedRequirements["languages"]) =>
    requirements({ requiredSkills: [skill("Go")], languages });
  const base = { skills: [described("Go")] };

  it("is the share of required languages in the profile, with spelling and case normalized", () => {
    const result = scoreMatch(
      job([
        { language: "english", required: true },
        { language: "German", required: true },
        { language: "French", required: false },
      ]),
      profile({ ...base, languages: ["ENGLISH", "Spanish"] }),
    );
    expect(component(result, "languages")).toMatchObject({ assessable: true, score: 0.5 });
  });

  it("repeated required languages count once", () => {
    const result = scoreMatch(
      job([
        { language: "English", required: true },
        { language: "english", required: true },
      ]),
      profile({ ...base, languages: ["English"] }),
    );
    expect(component(result, "languages")).toMatchObject({ score: 1 });
  });

  it("not assessable when none is required or the profile lists none", () => {
    expect(
      component(scoreMatch(job([]), profile({ ...base, languages: ["English"] })), "languages"),
    ).toMatchObject({ assessable: false, reason: "job_requires_no_languages" });
    const empty = scoreMatch(job([{ language: "English", required: true }]), profile(base));
    expect(component(empty, "languages")).toMatchObject({
      assessable: false,
      reason: "profile_lists_no_languages",
    });
    expect(empty.missingProfileData).toContain("languages");
  });
});

describe("scoreMatch: location and work mode", () => {
  const job = (workMode: GroundedRequirements["workMode"], locations: string[] = []) =>
    requirements({ requiredSkills: [skill("Go")], workMode, locations });
  const base = { skills: [described("Go")] };
  const lw = (r: ReturnType<typeof scoreMatch>) => component(r, "location_work_mode");

  it("scores the mode: same 1, hybrid against another 0.5, remote against onsite 0", () => {
    const cases: [GroundedRequirements["workMode"], MatchProfile["workModes"], number][] = [
      ["remote", ["remote"], 1],
      ["hybrid", ["remote"], 0.5],
      ["hybrid", ["onsite"], 0.5],
      ["remote", ["hybrid"], 0.5],
      ["onsite", ["hybrid"], 0.5],
      ["remote", ["onsite"], 0],
      ["onsite", ["remote"], 0],
      ["onsite", ["remote", "onsite"], 1],
      ["remote", ["onsite", "hybrid"], 0.5],
    ];
    for (const [jobMode, modes, expected] of cases) {
      const result = scoreMatch(job(jobMode), profile({ ...base, workModes: modes }));
      expect(lw(result), `${jobMode} vs ${modes}`).toMatchObject({
        assessable: true,
        score: expected,
      });
    }
  });

  it("halves the score of a hybrid or onsite job in another place", () => {
    const result = scoreMatch(
      job("hybrid", ["Helsinki"]),
      profile({ ...base, workModes: ["hybrid"], location: "Berlin" }),
    );
    expect(lw(result)).toMatchObject({ score: 0.5 });
    const onsite = scoreMatch(
      job("onsite", ["Helsinki"]),
      profile({ ...base, workModes: ["remote", "onsite"], location: "Berlin" }),
    );
    expect(lw(onsite)).toMatchObject({ score: 0.5 });
  });

  it("does not penalise a remote job for place, nor a place that matches", () => {
    expect(
      lw(
        scoreMatch(
          job("remote", ["Helsinki"]),
          profile({ ...base, workModes: ["remote"], location: "Berlin" }),
        ),
      ),
    ).toMatchObject({ score: 1 });
    expect(
      lw(
        scoreMatch(
          job("onsite", ["Helsinki", "Espoo"]),
          profile({ ...base, workModes: ["onsite"], location: "Espoo, Finland" }),
        ),
      ),
    ).toMatchObject({ score: 1 });
  });

  it("matches places ignoring case, accents and punctuation", () => {
    const result = scoreMatch(
      job("onsite", ["ZÜRICH"]),
      profile({ ...base, workModes: ["onsite"], location: "zurich (CH)" }),
    );
    expect(lw(result)).toMatchObject({ score: 1 });
  });

  it("an unknown profile location leaves the mode score unchanged and is reported", () => {
    const result = scoreMatch(
      job("onsite", ["Helsinki"]),
      profile({ ...base, workModes: ["onsite"], location: "  " }),
    );
    expect(lw(result)).toMatchObject({ score: 1 });
    expect(result.missingProfileData).toContain("location");
  });

  it("a job place with no stated work mode is not assessable", () => {
    const result = scoreMatch(
      job(null, ["Helsinki"]),
      profile({ ...base, workModes: ["remote"], location: "Helsinki" }),
    );
    expect(lw(result)).toMatchObject({ assessable: false, reason: "job_states_no_work_mode" });
  });

  it("not assessable when the profile states no work modes", () => {
    const result = scoreMatch(job("remote"), profile(base));
    expect(lw(result)).toMatchObject({ assessable: false, reason: "profile_has_no_work_modes" });
    expect(result.missingProfileData).toContain("work_modes");
  });
});

describe("scoreMatch: properties", () => {
  // Small deterministic generator so the property runs are reproducible without a dependency.
  function rng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
  const pick = <T>(random: () => number, items: readonly T[]): T =>
    items[Math.floor(random() * items.length)];
  const NAMES = [
    "TypeScript",
    "Python",
    "Go",
    "Rust",
    "Docker",
    "Git",
    "AWS",
    "Redis",
    "Unknown Thing",
  ];

  function randomCase(random: () => number) {
    const some = (n: number) => NAMES.filter(() => random() < n / NAMES.length);
    const job = requirements({
      requiredSkills: some(3).map(skill),
      preferredSkills: some(2).map(skill),
      minYearsExperience: random() < 0.5 ? Math.floor(random() * 12) : null,
      languages:
        random() < 0.5
          ? [{ language: pick(random, ["English", "German"]), required: random() < 0.7 }]
          : [],
      workMode: random() < 0.7 ? pick(random, ["remote", "hybrid", "onsite"] as const) : null,
      locations: random() < 0.5 ? [pick(random, ["Helsinki", "Berlin"])] : [],
    });
    const me = profile({
      skills: some(4).map((n) => (random() < 0.5 ? described(n) : listed(n))),
      yearsOfExperience: random() < 0.7 ? Math.floor(random() * 15) : null,
      languages: random() < 0.6 ? ["English"] : [],
      workModes: random() < 0.7 ? [pick(random, ["remote", "hybrid", "onsite"] as const)] : [],
      location: random() < 0.6 ? pick(random, ["Helsinki, Finland", "Berlin"]) : null,
    });
    return { job, me };
  }

  it("the score is an integer from 0 to 100 or null, and coverage decides which", () => {
    const random = rng(1);
    for (let run = 0; run < 500; run += 1) {
      const { job, me } = randomCase(random);
      const result = scoreMatch(job, me);
      if (result.status === "scored") {
        expect(Number.isInteger(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.coverage).toBeGreaterThanOrEqual(50);
        expect(result.label).not.toBeNull();
      } else {
        expect(result.score).toBeNull();
        expect(result.label).toBeNull();
      }
      if (result.status === "insufficient_information") expect(result.coverage).toBeLessThan(50);
    }
  });

  it("is deterministic and does not depend on the order of the profile's skills", () => {
    const random = rng(2);
    for (let run = 0; run < 200; run += 1) {
      const { job, me } = randomCase(random);
      const first = scoreMatch(job, me);
      expect(scoreMatch(job, me)).toEqual(first);
      expect(scoreMatch(job, { ...me, skills: [...me.skills].reverse() })).toEqual(first);
    }
  });

  it("adding a skill the job asks for never lowers a score", () => {
    const random = rng(3);
    let checked = 0;
    for (let run = 0; run < 600; run += 1) {
      const { job, me } = randomCase(random);
      // With no skills at all, adding one makes more of the job assessable; that is not a
      // like-for-like comparison, so the property is stated for profiles that already have skills.
      if (me.skills.length === 0) continue;
      const wanted = [...job.requiredSkills, ...job.preferredSkills].find(
        (s) => !me.skills.some((own) => own.name === s.name),
      );
      if (!wanted) continue;
      const before = scoreMatch(job, me);
      const after = scoreMatch(job, { ...me, skills: [...me.skills, described(wanted.name)] });
      if (before.score !== null && after.score !== null) {
        expect(after.score).toBeGreaterThanOrEqual(before.score);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("never reads or changes its inputs", () => {
    const job = Object.freeze(exampleJob());
    const me = Object.freeze({
      ...exampleProfile(),
      skills: Object.freeze([...exampleProfile().skills]),
    });
    expect(() => scoreMatch(job, me)).not.toThrow();
  });
});
