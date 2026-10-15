import type { ZodError } from "zod";
import type { CandidateSkillRecord, SkillRepository } from "./repository";
import {
  type CandidateSkillDto,
  type SkillLevel,
  skillIdSchema,
  skillInputSchema,
  toSkillWrite,
} from "./validation";

type Issues = ZodError["issues"];

export type AddSkillResult =
  | { ok: true; skill: CandidateSkillDto }
  | { ok: false; reason: "invalid"; errors: Issues }
  | { ok: false; reason: "duplicate" | "limit_reached" };

export type UpdateSkillResult =
  | { ok: true; skill: CandidateSkillDto }
  | { ok: false; reason: "invalid"; errors: Issues }
  | { ok: false; reason: "duplicate" | "not_found" };

function toDto(record: CandidateSkillRecord): CandidateSkillDto {
  return {
    id: record.id,
    name: record.displayName,
    level: record.level as SkillLevel | null,
    yearsOfExperience: record.yearsOfExperience,
    evidence: record.evidence,
    updatedAt: record.updatedAt,
  };
}

/**
 * Use cases for the signed-in user's own skills. Callers pass the authenticated user (from
 * `requireUser`); the user id is never taken from request input, and a skill id from the client
 * is only ever combined with that user id.
 */
export function createSkillService(repository: SkillRepository) {
  return {
    async listMySkills(user: { id: string }): Promise<CandidateSkillDto[]> {
      return (await repository.listByUserId(user.id)).map(toDto);
    },

    async addMySkill(user: { id: string }, input: unknown): Promise<AddSkillResult> {
      const parsed = skillInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, reason: "invalid", errors: parsed.error.issues };

      const outcome = await repository.create(user.id, toSkillWrite(parsed.data));
      return outcome.ok ? { ok: true, skill: toDto(outcome.skill) } : outcome;
    },

    async updateMySkill(
      user: { id: string },
      id: string,
      input: unknown,
    ): Promise<UpdateSkillResult> {
      // A malformed id is indistinguishable from a missing or foreign one.
      if (!skillIdSchema.safeParse(id).success) return { ok: false, reason: "not_found" };
      const parsed = skillInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, reason: "invalid", errors: parsed.error.issues };

      const outcome = await repository.update(user.id, id, toSkillWrite(parsed.data));
      return outcome.ok ? { ok: true, skill: toDto(outcome.skill) } : outcome;
    },

    async removeMySkill(user: { id: string }, id: string): Promise<boolean> {
      if (!skillIdSchema.safeParse(id).success) return false;
      return repository.delete(user.id, id);
    },
  };
}

export type SkillService = ReturnType<typeof createSkillService>;
