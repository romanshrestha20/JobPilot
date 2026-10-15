import { and, asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candidateSkill } from "../schema";
import { SKILL_LIMITS, type SkillWrite } from "./validation";

export type CandidateSkillRecord = typeof candidateSkill.$inferSelect;

export type CreateSkillOutcome =
  { ok: true; skill: CandidateSkillRecord } | { ok: false; reason: "duplicate" | "limit_reached" };

export type UpdateSkillOutcome =
  { ok: true; skill: CandidateSkillRecord } | { ok: false; reason: "not_found" | "duplicate" };

/**
 * Persistence port. Every operation is keyed by the owner's user id; a skill can only be
 * reached together with its owner, so there is no lookup by skill id alone.
 */
export interface SkillRepository {
  listByUserId(userId: string): Promise<CandidateSkillRecord[]>;
  create(userId: string, data: SkillWrite): Promise<CreateSkillOutcome>;
  update(userId: string, id: string, data: SkillWrite): Promise<UpdateSkillOutcome>;
  delete(userId: string, id: string): Promise<boolean>;
}

type Transaction = Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

/**
 * Serializes writes of one user's skills for the rest of the transaction. The limit check and
 * the duplicate check read what other requests of the same user are inserting, so two
 * simultaneous requests must not both pass them. Different users never wait for each other.
 * (The UNIQUE constraint stays the last line of defence for the duplicate rule.)
 */
async function lockUserSkills(tx: Transaction, userId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"candidate_skill:" + userId}, 0))`,
  );
}

export function createSkillRepository(db: PostgresJsDatabase): SkillRepository {
  return {
    async listByUserId(userId) {
      return (
        db
          .select()
          .from(candidateSkill)
          .where(eq(candidateSkill.userId, userId))
          .orderBy(asc(sql`lower(${candidateSkill.displayName})`), asc(candidateSkill.id))
          // Bounded: a user can never hold more than the limit.
          .limit(SKILL_LIMITS.maxSkills)
      );
    },

    async create(userId, data) {
      return db.transaction(async (tx) => {
        await lockUserSkills(tx, userId);

        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(candidateSkill)
          .where(eq(candidateSkill.userId, userId));
        if (count >= SKILL_LIMITS.maxSkills) return { ok: false, reason: "limit_reached" } as const;

        const [row] = await tx
          .insert(candidateSkill)
          .values({
            userId,
            skillKey: data.skillKey,
            displayName: data.name,
            level: data.level,
            yearsOfExperience: data.yearsOfExperience,
            evidence: data.evidence,
          })
          .onConflictDoNothing({ target: [candidateSkill.userId, candidateSkill.skillKey] })
          .returning();
        if (!row) return { ok: false, reason: "duplicate" } as const;
        return { ok: true, skill: row } as const;
      });
    },

    async update(userId, id, data) {
      return db.transaction(async (tx) => {
        await lockUserSkills(tx, userId);

        const [clash] = await tx
          .select({ id: candidateSkill.id })
          .from(candidateSkill)
          .where(and(eq(candidateSkill.userId, userId), eq(candidateSkill.skillKey, data.skillKey)))
          .limit(1);
        if (clash && clash.id !== id) return { ok: false, reason: "duplicate" } as const;

        const [row] = await tx
          .update(candidateSkill)
          .set({
            skillKey: data.skillKey,
            displayName: data.name,
            level: data.level,
            yearsOfExperience: data.yearsOfExperience,
            evidence: data.evidence,
            updatedAt: sql`now()`,
          })
          // The owner is part of the WHERE clause: someone else's id matches nothing.
          .where(and(eq(candidateSkill.id, id), eq(candidateSkill.userId, userId)))
          .returning();
        if (!row) return { ok: false, reason: "not_found" } as const;
        return { ok: true, skill: row } as const;
      });
    },

    async delete(userId, id) {
      const rows = await db
        .delete(candidateSkill)
        .where(and(eq(candidateSkill.id, id), eq(candidateSkill.userId, userId)))
        .returning({ id: candidateSkill.id });
      return rows.length > 0;
    },
  };
}
