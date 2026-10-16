import { count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createProfileRepository } from "@/features/candidate-profile/repository";
import { createProfileService } from "@/features/candidate-profile/service";
import { createSkillRepository } from "@/features/candidate-profile/skills/repository";
import { createSkillService } from "@/features/candidate-profile/skills/service";
import { createAnalysisService } from "@/features/job-analysis/application/analysis-service";
import { extractRequirements } from "@/features/job-analysis/application/extract";
import { createAnalysisProcessor } from "@/features/job-analysis/application/process-analysis";
import { scoreMatch } from "@/features/job-analysis/domain/score-match";
import { createAnalysisRepository } from "@/features/job-analysis/repository";
import { jobAnalysis } from "@/features/job-analysis/schema";
import { createJobTextReader } from "@/features/job-intake/reader";
import { jobPosting } from "@/features/job-intake/schema";
import { createAiGateway } from "@/lib/ai/gateway";
import { createOllamaProvider } from "@/lib/ai/ollama-provider";
import { user } from "@/lib/schema";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { createMatchService } from "./application/match-service";

// Real repositories, real job reader, real extraction use case and Ollama provider; only the
// network `fetch` is a fake that records the exact request. Guarded `*_test` database only.

const DESCRIPTION = [
  "Backend engineer",
  "",
  "Requirements:",
  "- TypeScript",
  "- PostgreSQL",
  "",
  "Nice to have:",
  "- Docker",
  "",
  "This is a remote role.",
].join("\n");

// Strings that exist only in candidate data. They must never appear in a model request.
const MARKERS = ["ZZ-Marker-Skill", "ZZ-Marker-Town", "ZZ-Marker-Evidence", "ZZ-Marker-Headline"];

const MODEL_ANSWER = {
  schemaVersion: 1,
  requiredSkills: [
    { name: "TypeScript", quote: "TypeScript" },
    { name: "PostgreSQL", quote: "PostgreSQL" },
  ],
  preferredSkills: [{ name: "Docker", quote: "Docker" }],
  minYearsExperience: null,
  languages: [],
  workMode: "remote",
  locations: [],
};

let db: TestDatabase;
let close: () => Promise<void>;
const createdUsers: string[] = [];
const requests: { url: string; method: string; headers: string; body: string }[] = [];

const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({
    url: String(url),
    method: String(init?.method),
    headers: JSON.stringify(init?.headers ?? {}),
    body: String(init?.body),
  });
  return new Response(
    JSON.stringify({
      message: { role: "assistant", content: JSON.stringify(MODEL_ANSWER) },
      done_reason: "stop",
      prompt_eval_count: 300,
      eval_count: 100,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});

const gateway = () =>
  createAiGateway({
    provider: createOllamaProvider({
      baseUrl: "http://ollama.test:11434",
      model: "qwen-test",
      fetch: fakeFetch as unknown as typeof fetch,
    }),
    timeoutMs: 10_000,
  });

const silent = { info() {}, warn() {}, error() {} };
const enqueue = vi.fn(async () => {
  throw new Error("the match path must never enqueue");
});

async function newUser(label: string) {
  const created = await createTestUser(db, label);
  createdUsers.push(created.id);
  return created;
}

/** Saves the job, requests an analysis, and runs the real processor on it. */
async function analysedJob(userId: string, description = DESCRIPTION) {
  const [job] = await db
    .insert(jobPosting)
    .values({ userId, title: "Engineer", company: "Acme", description })
    .returning({ id: jobPosting.id });
  const repository = createAnalysisRepository(db);
  const outcome = await repository.createPendingForUser(userId, job.id, { dailyLimit: 1000 });
  if (outcome.kind !== "created") throw new Error("expected a new run");
  const processor = createAnalysisProcessor({
    repository,
    jobs: createJobTextReader(db),
    extract: (text) => extractRequirements(gateway(), text),
    llmTimeoutMs: 10_000,
    logger: silent,
  });
  expect(await processor.process({ analysisId: outcome.record.id, userId })).toEqual({
    kind: "completed",
  });
  return job.id;
}

const profiles = () => {
  const profile = createProfileService(createProfileRepository(db));
  const skills = createSkillService(createSkillRepository(db));
  return { profile, skills };
};

function matchService() {
  const { profile, skills } = profiles();
  return createMatchService({
    analyses: createAnalysisService({
      repository: createAnalysisRepository(db),
      jobs: createJobTextReader(db),
      queue: { enqueue },
      logger: silent,
    }),
    profiles: { getMyProfile: profile.getMyProfile, listMySkills: skills.listMySkills },
    score: scoreMatch,
  });
}

async function giveRichProfile(userId: string) {
  const { profile, skills } = profiles();
  const result = await profile.updateMyProfile(
    { id: userId },
    {
      headline: "ZZ-Marker-Headline",
      location: "ZZ-Marker-Town",
      yearsOfExperience: 6,
      languages: ["English"],
      workModes: ["remote"],
    },
  );
  expect(result.ok).toBe(true);
  for (const input of [
    { name: "TypeScript", level: "advanced", yearsOfExperience: 4, evidence: "ZZ-Marker-Evidence" },
    { name: "ZZ-Marker-Skill", level: null, yearsOfExperience: null, evidence: null },
  ] as const) {
    expect((await skills.addMySkill({ id: userId }, input)).ok).toBe(true);
  }
}

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
});

afterAll(async () => {
  if (createdUsers.length > 0) await db.delete(user).where(inArray(user.id, createdUsers));
  await close();
});

describe("the model request never depends on candidate data", () => {
  it("is byte-identical for the same job text with no profile, then with a full profile, and for another user", async () => {
    const alice = await newUser("req-alice");
    const bob = await newUser("req-bob");
    requests.length = 0;

    await analysedJob(alice.id); // Alice has no profile data yet
    await giveRichProfile(alice.id);
    await analysedJob(alice.id); // the same text, now with a full profile
    await analysedJob(bob.id); // another user with no profile at all

    expect(requests).toHaveLength(3);
    const [first, ...rest] = requests;
    for (const request of rest) expect(request).toEqual(first); // url, method, headers, body
    expect(first.url).toMatch(/\/api\/chat$/);
    for (const request of requests) {
      for (const marker of MARKERS) {
        expect(request.body).not.toContain(marker);
        expect(request.headers).not.toContain(marker);
        expect(request.url).not.toContain(marker);
      }
      expect(request.body).not.toContain(alice.id);
      expect(request.body).not.toContain(bob.id);
    }
    // The job text is what was sent.
    expect(first.body).toContain("PostgreSQL");
  });
});

describe("the match uses only the signed-in user's own data", () => {
  it("scores each user from their own skills and profile, and never reads another user's", async () => {
    const alice = await newUser("match-alice");
    const bob = await newUser("match-bob");
    const aliceJob = await analysedJob(alice.id);
    const bobJob = await analysedJob(bob.id);
    await giveRichProfile(alice.id);
    const service = matchService();

    const forAlice = await service.getMyMatch(alice, aliceJob);
    if (!forAlice.ok || forAlice.state !== "ready") throw new Error("expected a ready match");
    const byName = Object.fromEntries(forAlice.breakdown.skills.map((s) => [s.name, s]));
    expect(byName.TypeScript).toMatchObject({ state: "matched" });
    expect(byName.TypeScript.candidate).toMatchObject({ evidence: "ZZ-Marker-Evidence" });
    expect(byName.PostgreSQL).toMatchObject({ state: "absent" });
    expect(forAlice.breakdown.status).toBe("scored");

    // Bob has no profile and no skills: no number, whatever Alice has.
    const forBob = await service.getMyMatch(bob, bobJob);
    if (!forBob.ok || forBob.state !== "ready") throw new Error("expected a ready match");
    expect(forBob.breakdown).toMatchObject({ status: "insufficient_information", score: null });
    for (const marker of MARKERS) expect(JSON.stringify(forBob)).not.toContain(marker);
  });

  it("another user's skills do not change my result", async () => {
    const alice = await newUser("iso-alice");
    const bob = await newUser("iso-bob");
    const aliceJob = await analysedJob(alice.id);
    await giveRichProfile(alice.id);
    const service = matchService();
    const before = await service.getMyMatch(alice, aliceJob);

    await giveRichProfile(bob.id);
    const { skills } = profiles();
    await skills.addMySkill(
      { id: bob.id },
      { name: "PostgreSQL", level: "expert", yearsOfExperience: 9, evidence: "ZZ-Marker-Evidence" },
    );
    expect(await service.getMyMatch(alice, aliceJob)).toEqual(before);
  });

  it("a foreign, missing or malformed job id is the same not_found, in both directions", async () => {
    const alice = await newUser("own-alice");
    const bob = await newUser("own-bob");
    const aliceJob = await analysedJob(alice.id);
    const bobJob = await analysedJob(bob.id);
    await giveRichProfile(alice.id);
    const service = matchService();

    const notFound = { ok: false, reason: "not_found" };
    expect(await service.getMyMatch(bob, aliceJob)).toEqual(notFound);
    expect(await service.getMyMatch(alice, bobJob)).toEqual(notFound);
    expect(await service.getMyMatch(alice, "22222222-2222-4222-8222-222222222222")).toEqual(
      notFound,
    );
    for (const bad of ["", "not-a-uuid", "1; DROP TABLE job_analysis", null, undefined, 7]) {
      expect(await service.getMyMatch(alice, bad)).toEqual(notFound);
    }
  });

  it("a job with no completed analysis has no match, and an absent profile is handled", async () => {
    const carol = await newUser("none-carol");
    const [job] = await db
      .insert(jobPosting)
      .values({ userId: carol.id, title: "T", company: "C", description: DESCRIPTION })
      .returning({ id: jobPosting.id });
    expect(await matchService().getMyMatch(carol, job.id)).toEqual({
      ok: true,
      state: "no_completed_analysis",
    });
    // Analysed, but no profile row and no skills at all.
    const analysed = await analysedJob(carol.id);
    const result = await matchService().getMyMatch(carol, analysed);
    if (!result.ok || result.state !== "ready") throw new Error("expected ready");
    expect(result.breakdown).toMatchObject({ status: "insufficient_information", score: null });
    expect(result.breakdown.missingProfileData).toContain("skills");
  });

  it("is computed on read: it stores nothing and enqueues nothing", async () => {
    const alice = await newUser("read-alice");
    const aliceJob = await analysedJob(alice.id);
    await giveRichProfile(alice.id);
    const rows = async () =>
      (await db.select({ n: count() }).from(jobAnalysis).where(eq(jobAnalysis.userId, alice.id)))[0]
        .n;
    const before = await rows();
    enqueue.mockClear();
    const service = matchService();
    await service.getMyMatch(alice, aliceJob);
    await service.getMyMatch(alice, aliceJob);
    expect(await rows()).toBe(before);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
