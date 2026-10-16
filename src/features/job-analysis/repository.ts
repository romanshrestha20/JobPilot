import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ACTIVE_STATUSES, type AnalysisProvider, type FailureCode } from "./domain/analysis-state";
import type { GroundedRequirements } from "./domain/requirements";
import { jobAnalysis } from "./schema";

export type AnalysisRecord = typeof jobAnalysis.$inferSelect;

export type CreatePendingOutcome =
  | { kind: "created"; record: AnalysisRecord }
  | { kind: "already_active"; record: AnalysisRecord }
  | { kind: "quota_exceeded" };

export type CompletedResult = {
  descriptionHash: string;
  promptVersion: string;
  provider: AnalysisProvider;
  model: string | null;
  requirements: GroundedRequirements;
  droppedUngrounded: number;
};

/**
 * Persistence port. Every operation takes the owner's user id and puts it in the SQL `WHERE`
 * clause: there is no way to load or change an analysis by its id alone. Transitions are
 * conditional `UPDATE`s, so a duplicate or late delivery cannot move a row backwards
 * (docs/ai-architecture.md section 8.2). A method that returns null changed nothing.
 */
export interface AnalysisRepository {
  /**
   * Inserts a `pending` run unless one is already active for the job or the user has reached
   * the daily limit. Check and insert run under one per-user lock, so concurrent requests
   * cannot exceed the limit or create two active runs.
   */
  createPendingForUser(
    userId: string,
    jobId: string,
    options: { dailyLimit: number },
  ): Promise<CreatePendingOutcome>;
  findForUser(userId: string, analysisId: string): Promise<AnalysisRecord | null>;
  /** The newest run and the newest completed run of one job (they may be the same row). */
  latestForJob(
    userId: string,
    jobId: string,
  ): Promise<{ latest: AnalysisRecord | null; latestCompleted: AnalysisRecord | null }>;
  /** pending or processing -> processing; counts the attempt. Null when it is not claimable. */
  claim(userId: string, analysisId: string): Promise<AnalysisRecord | null>;
  /** processing -> completed. Null from any other state, so a stale worker cannot overwrite. */
  complete(
    userId: string,
    analysisId: string,
    result: CompletedResult,
  ): Promise<AnalysisRecord | null>;
  /** pending or processing -> failed. Null from any other state. */
  fail(userId: string, analysisId: string, code: FailureCode): Promise<AnalysisRecord | null>;
}

/** Runs in the last 24 hours that count against the daily limit. */
const QUOTA_WINDOW = sql`interval '24 hours'`;

export function createAnalysisRepository(db: PostgresJsDatabase): AnalysisRepository {
  return {
    async createPendingForUser(userId, jobId, { dailyLimit }) {
      return db.transaction(async (tx) => {
        // Serializes this user's requests for the rest of the transaction. One user owns the
        // job, so this also serializes requests for the same job. The partial unique index
        // remains as the backstop if this lock were ever bypassed.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`job_analysis:${userId}`}, 0))`,
        );

        const [active] = await tx
          .select()
          .from(jobAnalysis)
          .where(
            and(
              eq(jobAnalysis.userId, userId),
              eq(jobAnalysis.jobId, jobId),
              inArray(jobAnalysis.status, [...ACTIVE_STATUSES]),
            ),
          )
          .limit(1);
        if (active) return { kind: "already_active", record: active };

        // A run that never started because the queue was unreachable is not the user's use.
        const [{ used }] = await tx
          .select({ used: sql<number>`count(*)::int` })
          .from(jobAnalysis)
          .where(
            and(
              eq(jobAnalysis.userId, userId),
              sql`${jobAnalysis.createdAt} > now() - ${QUOTA_WINDOW}`,
              sql`${jobAnalysis.failureCode} is distinct from 'enqueue_failed'`,
            ),
          );
        if (used >= dailyLimit) return { kind: "quota_exceeded" };

        const [record] = await tx.insert(jobAnalysis).values({ userId, jobId }).returning();
        return { kind: "created", record };
      });
    },

    async findForUser(userId, analysisId) {
      const [row] = await db
        .select()
        .from(jobAnalysis)
        .where(and(eq(jobAnalysis.id, analysisId), eq(jobAnalysis.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async latestForJob(userId, jobId) {
      const owned = and(eq(jobAnalysis.userId, userId), eq(jobAnalysis.jobId, jobId));
      const newestFirst = [desc(jobAnalysis.createdAt), desc(jobAnalysis.id)];
      const [latest] = await db
        .select()
        .from(jobAnalysis)
        .where(owned)
        .orderBy(...newestFirst)
        .limit(1);
      if (!latest) return { latest: null, latestCompleted: null };
      if (latest.status === "completed") return { latest, latestCompleted: latest };
      const [latestCompleted] = await db
        .select()
        .from(jobAnalysis)
        .where(and(owned, eq(jobAnalysis.status, "completed")))
        .orderBy(...newestFirst)
        .limit(1);
      return { latest, latestCompleted: latestCompleted ?? null };
    },

    async claim(userId, analysisId) {
      const [row] = await db
        .update(jobAnalysis)
        .set({
          status: "processing",
          attempts: sql`${jobAnalysis.attempts} + 1`,
          startedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(jobAnalysis.id, analysisId),
            eq(jobAnalysis.userId, userId),
            inArray(jobAnalysis.status, [...ACTIVE_STATUSES]),
          ),
        )
        .returning();
      return row ?? null;
    },

    async complete(userId, analysisId, result) {
      const [row] = await db
        .update(jobAnalysis)
        .set({
          status: "completed",
          descriptionHash: result.descriptionHash,
          promptVersion: result.promptVersion,
          provider: result.provider,
          model: result.model,
          requirements: result.requirements,
          droppedUngrounded: result.droppedUngrounded,
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(jobAnalysis.id, analysisId),
            eq(jobAnalysis.userId, userId),
            eq(jobAnalysis.status, "processing"),
          ),
        )
        .returning();
      return row ?? null;
    },

    async fail(userId, analysisId, code) {
      const [row] = await db
        .update(jobAnalysis)
        .set({ status: "failed", failureCode: code, updatedAt: sql`now()` })
        .where(
          and(
            eq(jobAnalysis.id, analysisId),
            eq(jobAnalysis.userId, userId),
            inArray(jobAnalysis.status, [...ACTIVE_STATUSES]),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}
