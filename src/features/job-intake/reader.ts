import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createJobRepository } from "./repository";
import { jobIdSchema } from "./validation";

/**
 * Narrow public entry for non-UI consumers such as the background worker. It exposes one
 * owner-scoped read and nothing else, and unlike `index.ts` it imports no UI, actions or
 * global database client, so a process can bind its own connection.
 */
export function createJobTextReader(db: PostgresJsDatabase) {
  const repository = createJobRepository(db);
  return {
    /** The job's description when `userId` owns the job; null for a missing, malformed or foreign id. */
    async findJob(userId: string, jobId: string): Promise<{ description: string } | null> {
      if (!jobIdSchema.safeParse(jobId).success) return null;
      const record = await repository.findForUser(userId, jobId);
      return record ? { description: record.description } : null;
    },
  };
}
