import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { jobPosting } from "./schema";
import type { JobInput } from "./validation";

export type JobRecord = typeof jobPosting.$inferSelect;
export type JobSummaryRecord = Pick<
  JobRecord,
  "id" | "title" | "company" | "location" | "sourceUrl" | "createdAt"
>;

/**
 * Persistence port. Every operation takes the owner's user id and puts it in the SQL
 * `WHERE` clause. There is deliberately no way to load or delete a job by its id alone.
 */
export interface JobRepository {
  create(userId: string, data: JobInput): Promise<JobRecord>;
  /** Newest first, bounded by `limit`/`offset`. */
  listForUser(userId: string, page: { limit: number; offset: number }): Promise<JobSummaryRecord[]>;
  findForUser(userId: string, jobId: string): Promise<JobRecord | null>;
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

    async listForUser(userId, { limit, offset }) {
      return db
        .select({
          id: jobPosting.id,
          title: jobPosting.title,
          company: jobPosting.company,
          location: jobPosting.location,
          sourceUrl: jobPosting.sourceUrl,
          createdAt: jobPosting.createdAt,
        })
        .from(jobPosting)
        .where(eq(jobPosting.userId, userId))
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

    async deleteForUser(userId, jobId) {
      const deleted = await db
        .delete(jobPosting)
        .where(and(eq(jobPosting.id, jobId), eq(jobPosting.userId, userId)))
        .returning({ id: jobPosting.id });
      return deleted.length > 0;
    },
  };
}
