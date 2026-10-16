import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
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

/** What the recovery pass needs to decide about a run that stopped changing. */
export type StaleRun = {
  id: string;
  userId: string;
  status: "pending" | "processing";
  attempts: number;
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
  /**
   * Starts an attempt: pending -> processing, or processing -> processing when the run has not
   * changed since `reclaimBefore` (the worker that held it is gone). Counts the attempt. A run
   * another delivery is working on right now is not claimable, so a duplicate delivery cannot
   * run the model twice or use up attempts. Null when it is not claimable.
   */
  claim(
    userId: string,
    analysisId: string,
    options: { reclaimBefore: Date },
  ): Promise<AnalysisRecord | null>;
  /**
   * processing -> pending after a retryable failure, so the queue's next delivery can claim it.
   * Only the attempt that holds the run (`attempts` equals `attempt`) can release it, so a
   * superseded delivery cannot disturb the attempt that replaced it. Null otherwise.
   */
  release(userId: string, analysisId: string, attempt: number): Promise<AnalysisRecord | null>;
  /** processing -> completed. Null from any other state, so a stale worker cannot overwrite. */
  complete(
    userId: string,
    analysisId: string,
    result: CompletedResult,
  ): Promise<AnalysisRecord | null>;
  /** pending or processing -> failed. Null from any other state. */
  fail(userId: string, analysisId: string, code: FailureCode): Promise<AnalysisRecord | null>;
  /**
   * Worker-only recovery. Not reachable from user-facing code: it lists runs of every user, so
   * it returns ids only and is bounded by `limit`. The rows are then handled one at a time
   * through owner-scoped calls. `pending` rows unchanged since `pendingBefore` and `processing`
   * rows unchanged since `processingBefore`, oldest first.
   */
  listStale(cutoffs: {
    pendingBefore: Date;
    processingBefore: Date;
    limit: number;
  }): Promise<StaleRun[]>;
  /**
   * Like `fail`, but only if the run still has not changed since `unchangedSince`, so a run
   * that was claimed or finished after it was listed is left alone.
   */
  failIfStale(
    userId: string,
    analysisId: string,
    code: FailureCode,
    unchangedSince: Date,
  ): Promise<AnalysisRecord | null>;
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

    async claim(userId, analysisId, { reclaimBefore }) {
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
            or(
              eq(jobAnalysis.status, "pending"),
              and(eq(jobAnalysis.status, "processing"), lt(jobAnalysis.updatedAt, reclaimBefore)),
            ),
          ),
        )
        .returning();
      return row ?? null;
    },

    async release(userId, analysisId, attempt) {
      const [row] = await db
        .update(jobAnalysis)
        .set({ status: "pending", updatedAt: sql`now()` })
        .where(
          and(
            eq(jobAnalysis.id, analysisId),
            eq(jobAnalysis.userId, userId),
            eq(jobAnalysis.status, "processing"),
            eq(jobAnalysis.attempts, attempt),
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

    async listStale({ pendingBefore, processingBefore, limit }) {
      const rows = await db
        .select({
          id: jobAnalysis.id,
          userId: jobAnalysis.userId,
          status: jobAnalysis.status,
          attempts: jobAnalysis.attempts,
        })
        .from(jobAnalysis)
        .where(
          or(
            and(eq(jobAnalysis.status, "pending"), lt(jobAnalysis.updatedAt, pendingBefore)),
            and(eq(jobAnalysis.status, "processing"), lt(jobAnalysis.updatedAt, processingBefore)),
          ),
        )
        .orderBy(asc(jobAnalysis.updatedAt), asc(jobAnalysis.id))
        .limit(limit);
      return rows.map((row) => ({ ...row, status: row.status as StaleRun["status"] }));
    },

    async failIfStale(userId, analysisId, code, unchangedSince) {
      const [row] = await db
        .update(jobAnalysis)
        .set({ status: "failed", failureCode: code, updatedAt: sql`now()` })
        .where(
          and(
            eq(jobAnalysis.id, analysisId),
            eq(jobAnalysis.userId, userId),
            inArray(jobAnalysis.status, [...ACTIVE_STATUSES]),
            lt(jobAnalysis.updatedAt, unchangedSince),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}
