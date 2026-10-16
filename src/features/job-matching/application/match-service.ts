import type { GroundedRequirements, MatchBreakdown, MatchProfile } from "@/features/job-analysis";

/**
 * Read-only view of the user's analyses, owner-scoped by the implementation. Returns null for a
 * job that is missing, malformed or someone else's: those are one answer.
 */
export interface AnalysisSource {
  getMyAnalysisView(
    user: { id: string },
    jobId: unknown,
  ): Promise<{
    current: { id: string; requirements: GroundedRequirements | null } | null;
    stale: boolean;
  } | null>;
}

/** The signed-in user's own profile and skills, read through candidate-profile's public API. */
export interface ProfileSource {
  getMyProfile(user: { id: string }): Promise<{
    location: string | null;
    yearsOfExperience: number | null;
    languages: string[];
    workModes: ("remote" | "hybrid" | "onsite")[];
  } | null>;
  listMySkills(user: { id: string }): Promise<
    {
      name: string;
      level: string | null;
      yearsOfExperience: number | null;
      evidence: string | null;
    }[]
  >;
}

export type MatchResult =
  /** A missing job, a malformed id and someone else's job are all the same answer. */
  | { ok: false; reason: "not_found" }
  | { ok: true; state: "no_completed_analysis" }
  | {
      ok: true;
      state: "ready";
      analysisId: string;
      /** The description changed after this analysis was made; the score is of the older text. */
      stale: boolean;
      breakdown: MatchBreakdown;
    };

export type MatchServiceDeps = {
  analyses: AnalysisSource;
  profiles: ProfileSource;
  /** The `match-v1` scorer (`scoreMatch`); passed in so this file imports no runtime code. */
  score: (requirements: GroundedRequirements, profile: MatchProfile) => MatchBreakdown;
};

/**
 * Computes how the user's own profile covers a job's extracted requirements, on read. Nothing
 * is stored and nothing is queued. The profile is read only after the job's ownership and a
 * completed analysis are confirmed, and only for the session user. This service has no access
 * to the AI gateway or the queue: the profile it reads is compared locally by `score`.
 */
export function createMatchService(deps: MatchServiceDeps) {
  const { analyses, profiles, score } = deps;

  return {
    async getMyMatch(user: { id: string }, jobId: unknown): Promise<MatchResult> {
      const view = await analyses.getMyAnalysisView(user, jobId);
      if (!view) return { ok: false, reason: "not_found" };

      // A completed run whose stored result no longer validates has no requirements to score.
      const current = view.current;
      if (!current || !current.requirements) return { ok: true, state: "no_completed_analysis" };

      const [profile, skills] = await Promise.all([
        profiles.getMyProfile(user),
        profiles.listMySkills(user),
      ]);

      // An absent profile is an empty one: every profile-dependent component becomes "not
      // assessable" in the scorer, so no number is invented.
      const matchProfile: MatchProfile = {
        skills: skills.map((skill) => ({
          name: skill.name,
          level: skill.level,
          yearsOfExperience: skill.yearsOfExperience,
          evidence: skill.evidence,
        })),
        yearsOfExperience: profile?.yearsOfExperience ?? null,
        languages: profile?.languages ?? [],
        workModes: profile?.workModes ?? [],
        location: profile?.location ?? null,
      };

      return {
        ok: true,
        state: "ready",
        analysisId: current.id,
        stale: view.stale,
        breakdown: score(current.requirements, matchProfile),
      };
    },
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
