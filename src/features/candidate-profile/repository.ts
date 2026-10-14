import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candidateProfile } from "./schema";
import type { ProfileInput } from "./validation";

export type CandidateProfileRecord = typeof candidateProfile.$inferSelect;

/**
 * Persistence port. Every operation is keyed by the owner's user id; there is
 * intentionally no way to load a profile by its own id.
 */
export interface ProfileRepository {
  findByUserId(userId: string): Promise<CandidateProfileRecord | null>;
  upsertForUser(userId: string, data: ProfileInput): Promise<CandidateProfileRecord>;
}

export function createProfileRepository(db: PostgresJsDatabase): ProfileRepository {
  return {
    async findByUserId(userId) {
      const [row] = await db
        .select()
        .from(candidateProfile)
        .where(eq(candidateProfile.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async upsertForUser(userId, data) {
      const [row] = await db
        .insert(candidateProfile)
        .values({ ...data, userId })
        .onConflictDoUpdate({
          target: candidateProfile.userId,
          // Only the keys the caller provided change; `userId` is never in the SET list.
          set: { ...data, updatedAt: sql`now()` },
        })
        .returning();
      return row;
    },
  };
}
