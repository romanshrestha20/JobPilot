import type { FailureCode } from "./domain/analysis-state";
import type { AnalysisRecord, AnalysisRepository } from "./repository";

/**
 * In-memory stand-in for the repository in unit tests. It follows the same rules as the SQL:
 * every call is scoped to the owner, and every transition is conditional on the current status,
 * so duplicate and late deliveries behave as they do against the database. The real SQL is
 * covered by the integration tests.
 */
export function createMemoryRepository(initial: AnalysisRecord[], clock: () => Date) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  const calls = { claim: 0, release: 0, complete: 0, fail: 0 };

  const owned = (userId: string, id: string) => {
    const row = rows.get(id);
    return row && row.userId === userId ? row : undefined;
  };
  const active = (status: string) => status === "pending" || status === "processing";

  const repository: AnalysisRepository = {
    async createPendingForUser() {
      throw new Error("not used in these tests");
    },
    async findForUser(userId, id) {
      const row = owned(userId, id);
      return row ? { ...row } : null;
    },
    async latestForJob() {
      throw new Error("not used in these tests");
    },
    async claim(userId, id, { reclaimBefore }) {
      calls.claim += 1;
      const row = owned(userId, id);
      if (!row) return null;
      const claimable =
        row.status === "pending" || (row.status === "processing" && row.updatedAt < reclaimBefore);
      if (!claimable) return null;
      row.status = "processing";
      row.attempts += 1;
      row.startedAt = clock();
      row.updatedAt = clock();
      return { ...row };
    },
    async release(userId, id, attempt) {
      calls.release += 1;
      const row = owned(userId, id);
      if (!row || row.status !== "processing" || row.attempts !== attempt) return null;
      Object.assign(row, { status: "pending", updatedAt: clock() });
      return { ...row };
    },
    async complete(userId, id, result) {
      calls.complete += 1;
      const row = owned(userId, id);
      if (!row || row.status !== "processing") return null;
      Object.assign(row, {
        status: "completed",
        descriptionHash: result.descriptionHash,
        promptVersion: result.promptVersion,
        provider: result.provider,
        model: result.model,
        requirements: result.requirements,
        droppedUngrounded: result.droppedUngrounded,
        completedAt: clock(),
        updatedAt: clock(),
      });
      return { ...row };
    },
    async fail(userId, id, code: FailureCode) {
      calls.fail += 1;
      const row = owned(userId, id);
      if (!row || !active(row.status)) return null;
      Object.assign(row, { status: "failed", failureCode: code, updatedAt: clock() });
      return { ...row };
    },
    async listStale({ pendingBefore, processingBefore, limit }) {
      return [...rows.values()]
        .filter(
          (row) =>
            (row.status === "pending" && row.updatedAt < pendingBefore) ||
            (row.status === "processing" && row.updatedAt < processingBefore),
        )
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
        .slice(0, limit)
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          status: row.status as "pending" | "processing",
          attempts: row.attempts,
        }));
    },
    async failIfStale(userId, id, code, unchangedSince) {
      const row = owned(userId, id);
      if (!row || !active(row.status) || !(row.updatedAt < unchangedSince)) return null;
      Object.assign(row, { status: "failed", failureCode: code, updatedAt: clock() });
      return { ...row };
    },
  };

  return { repository, rows, calls };
}
