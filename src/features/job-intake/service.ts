import type { ZodError } from "zod";
import type { JobRecord, JobRepository } from "./repository";
import {
  type JobDto,
  type JobStatus,
  type JobSummaryDto,
  jobIdSchema,
  jobInputSchema,
  jobStatusInputSchema,
} from "./validation";

export const JOBS_PAGE_SIZE = 20;

export type CreateJobResult = { ok: true; job: JobDto } | { ok: false; errors: ZodError["issues"] };

/** `not_found` covers a missing job, a malformed id and a job owned by someone else alike. */
export type UpdateJobResult =
  | { ok: true; job: JobDto }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid"; errors: ZodError["issues"] };

export type UpdateJobStatusResult = UpdateJobResult;

export type JobsPage = {
  jobs: JobSummaryDto[];
  page: number;
  hasMore: boolean;
  status?: JobStatus;
};

function toDto(record: JobRecord): JobDto {
  return {
    id: record.id,
    title: record.title,
    company: record.company,
    location: record.location,
    sourceUrl: record.sourceUrl,
    description: record.description,
    status: record.status as JobStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Pages are 1-based; anything that is not a positive integer is page 1. */
export function parsePage(value: unknown): number {
  const page = typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : 1;
  return page >= 1 ? page : 1;
}

/**
 * Use cases for the signed-in user's own saved jobs. Callers pass the authenticated user
 * (from `requireUser`); the owner id is never taken from request input. A job that does
 * not exist and a job that belongs to someone else are indistinguishable (`null` / `false`).
 */
export function createJobService(repository: JobRepository) {
  return {
    async createMyJob(user: { id: string }, input: unknown): Promise<CreateJobResult> {
      const parsed = jobInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, errors: parsed.error.issues };

      const record = await repository.create(user.id, parsed.data);
      return { ok: true, job: toDto(record) };
    },

    async listMyJobs(user: { id: string }, page = 1, status?: JobStatus): Promise<JobsPage> {
      const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
      // Fetch one extra row to learn whether a next page exists without a count query.
      const rows = await repository.listForUser(user.id, {
        limit: JOBS_PAGE_SIZE + 1,
        offset: (safePage - 1) * JOBS_PAGE_SIZE,
        status,
      });
      return {
        jobs: rows.slice(0, JOBS_PAGE_SIZE) as JobSummaryDto[],
        status,
        page: safePage,
        hasMore: rows.length > JOBS_PAGE_SIZE,
      };
    },

    async getMyJob(user: { id: string }, id: string): Promise<JobDto | null> {
      if (!jobIdSchema.safeParse(id).success) return null;
      const record = await repository.findForUser(user.id, id);
      return record ? toDto(record) : null;
    },

    async updateMyJob(user: { id: string }, id: string, input: unknown): Promise<UpdateJobResult> {
      if (!jobIdSchema.safeParse(id).success) return { ok: false, reason: "not_found" };

      const parsed = jobInputSchema.safeParse(input);
      if (!parsed.success) {
        // A non-owner gets the same answer whatever they submit, so validation feedback can
        // never be used to learn whether someone else's job id exists.
        const owned = await repository.findForUser(user.id, id);
        if (!owned) return { ok: false, reason: "not_found" };
        return { ok: false, reason: "invalid", errors: parsed.error.issues };
      }

      const record = await repository.updateForUser(user.id, id, parsed.data);
      return record ? { ok: true, job: toDto(record) } : { ok: false, reason: "not_found" };
    },

    async updateMyJobStatus(
      user: { id: string },
      id: string,
      input: unknown,
    ): Promise<UpdateJobStatusResult> {
      if (!jobIdSchema.safeParse(id).success) return { ok: false, reason: "not_found" };

      const parsed = jobStatusInputSchema.safeParse(input);
      if (!parsed.success) {
        // As for edits: a non-owner is told "not found" whatever they submit.
        const owned = await repository.findForUser(user.id, id);
        if (!owned) return { ok: false, reason: "not_found" };
        return { ok: false, reason: "invalid", errors: parsed.error.issues };
      }

      const record = await repository.updateStatusForUser(user.id, id, parsed.data.status);
      return record ? { ok: true, job: toDto(record) } : { ok: false, reason: "not_found" };
    },

    async deleteMyJob(user: { id: string }, id: string): Promise<boolean> {
      if (!jobIdSchema.safeParse(id).success) return false;
      return repository.deleteForUser(user.id, id);
    },
  };
}

export type JobService = ReturnType<typeof createJobService>;
