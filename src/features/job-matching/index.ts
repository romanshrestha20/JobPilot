import "server-only";
import { getMyProfile, listMySkills } from "@/features/candidate-profile";
import {
  createAnalysisRepository,
  createAnalysisService,
  scoreMatch,
} from "@/features/job-analysis";
import { createJobTextReader } from "@/features/job-intake/reader";
import { db } from "@/lib/db";
import { createMatchService } from "./application/match-service";

// Composition root. The analysis service is bound to a queue that refuses to send, so the match
// path cannot enqueue work even by mistake; it only reads.
const analyses = createAnalysisService({
  repository: createAnalysisRepository(db),
  jobs: createJobTextReader(db),
  queue: {
    async enqueue() {
      throw new Error("The match path is read-only and cannot enqueue.");
    },
  },
});

const service = createMatchService({
  analyses,
  profiles: { getMyProfile, listMySkills },
  score: scoreMatch,
});

export const getMyMatch = service.getMyMatch;
export type { MatchResult } from "./application/match-service";
