import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { jobPosting } from "./schema";
import type { JobInput, JobStatus } from "./validation";

export type JobRecord = typeof jobPosting.$inferSelect;
export type JobSummaryRecord = Pick<
  JobRecord,
  "id" | "title" | "company" | "location" | "sourceUrl" | "status" | "createdAt"
>;

/**
 * Persistence port. Every operation takes the owner's user id and puts it in the SQL
 * `WHERE` clause. There is deliberately no way to load or delete a job by its id alone.
 */
export interface JobRepository {
  create(userId: string, data: JobInput): Promise<JobRecord>;
  /** Newest first, bounded by `limit`/`offset`, optionally only jobs with one `status`. */
  listForUser(
    userId: string,
    page: { limit: number; offset: number; status?: JobStatus },
  ): Promise<JobSummaryRecord[]>;
  findForUser(userId: string, jobId: string): Promise<JobRecord | null>;
  /** Replaces the editable fields of a job owned by `userId`; null when no such row exists. */
  updateForUser(userId: string, jobId: string, data: JobInput): Promise<JobRecord | null>;
  /** Sets the application status of a job owned by `userId`; null when no such row exists. */
  updateStatusForUser(userId: string, jobId: string, status: JobStatus): Promise<JobRecord | null>;
  /** True when a row owned by `userId` was deleted. */
  deleteForUser(userId: string, jobId: string): Promise<boolean>;
}

export function createJobRepository(db: PostgresJsDatabase): JobRepository {
  return {
    async create(userId, data) {
      const [row] = await db
        .insert(jobPosting)
        .values({
          title: data.title,
          company: data.company,
          location: data.location,
          sourceUrl: data.sourceUrl,
          description: data.description,
          userId,
        })
        .returning();
      return row;
    },

    async listForUser(userId, { limit, offset, status }) {
      return db
        .select({
          id: jobPosting.id,
          title: jobPosting.title,
          company: jobPosting.company,
          location: jobPosting.location,
          sourceUrl: jobPosting.sourceUrl,
          status: jobPosting.status,
          createdAt: jobPosting.createdAt,
        })
        .from(jobPosting)
        .where(
          status
            ? and(eq(jobPosting.userId, userId), eq(jobPosting.status, status))
            : eq(jobPosting.userId, userId),
        )
        .orderBy(desc(jobPosting.createdAt), desc(jobPosting.id))
        .limit(limit)
        .offset(offset);
    },

    async findForUser(userId, jobId) {
      const [row] = await db
        .select()
        .from(jobPosting)
        .where(and(eq(jobPosting.id, jobId), eq(jobPosting.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async updateForUser(userId, jobId, data) {
      // Ownership is part of the UPDATE's own WHERE clause; `userId`, `id` and `createdAt`
      // are never in the SET list, so they cannot change.
      const [row] = await db
        .update(jobPosting)
        .set({
          title: data.title,
          company: data.company,
          location: data.location,
          sourceUrl: data.sourceUrl,
          description: data.description,
          updatedAt: sql`now()`,
        })
        .where(and(eq(jobPosting.id, jobId), eq(jobPosting.userId, userId)))
        .returning();
      return row ?? null;
    },

    async updateStatusForUser(userId, jobId, status) {
      // Same ownership rule as every other mutation: id AND user_id in the UPDATE itself.
      const [row] = await db
        .update(jobPosting)
        .set({ status, updatedAt: sql`now()` })
        .where(and(eq(jobPosting.id, jobId), eq(jobPosting.userId, userId)))
        .returning();
      return row ?? null;
    },

    async deleteForUser(userId, jobId) {
      const deleted = await db
        .delete(jobPosting)
        .where(and(eq(jobPosting.id, jobId), eq(jobPosting.userId, userId)))
        .returning({ id: jobPosting.id });
      return deleted.length > 0;
    },
  };
}
