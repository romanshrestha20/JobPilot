import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
// The one cross-module import in this module, and only for the composite foreign key below.
import { jobPosting } from "@/features/job-intake/schema";
import { user } from "@/lib/schema";
import {
  ACTIVE_STATUSES,
  ANALYSIS_PROVIDERS,
  ANALYSIS_STATUSES,
  FAILURE_CODES,
} from "./domain/analysis-state";

const literals = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql.raw(", "),
  );

/**
 * One run of the job analysis (docs/ai-architecture.md section 8). Runs are append-only: a
 * re-run inserts a new row, and the newest completed row is the current analysis. No prompt
 * text, no model output and no candidate data is stored here; `requirements` holds only the
 * validated, grounded result.
 */
export const jobAnalysis = pgTable(
  "job_analysis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull(),
    status: text("status").notNull().default("pending"),
    // sha256 of the normalized description the run used; staleness is derived from it.
    descriptionHash: text("description_hash"),
    promptVersion: text("prompt_version"),
    provider: text("provider"),
    model: text("model"),
    requirements: jsonb("requirements"),
    droppedUngrounded: integer("dropped_ungrounded").notNull().default(0),
    failureCode: text("failure_code"),
    attempts: integer("attempts").notNull().default(0),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Ownership in SQL: the analysis and its job must belong to the same user, so a row can
    // never point at someone else's posting. Deleting the job deletes its analyses.
    foreignKey({
      name: "job_analysis_job_id_user_id_fk",
      columns: [table.jobId, table.userId],
      foreignColumns: [jobPosting.id, jobPosting.userId],
    }).onDelete("cascade"),
    // One active run per job; concurrent requests lose at the database, not in application code.
    uniqueIndex("job_analysis_one_active_per_job")
      .on(table.jobId)
      .where(sql`${table.status} IN (${literals(ACTIVE_STATUSES)})`),
    // "Analyses of this job, newest first", always scoped by owner.
    index("job_analysis_user_id_job_id_created_at_idx").on(
      table.userId,
      table.jobId,
      table.createdAt.desc(),
    ),
    // Serves the daily per-user quota count.
    index("job_analysis_user_id_created_at_idx").on(table.userId, table.createdAt.desc()),
    check("job_analysis_status_allowed", sql`${table.status} IN (${literals(ANALYSIS_STATUSES)})`),
    check(
      "job_analysis_failure_code_allowed",
      sql`${table.failureCode} IS NULL OR ${table.failureCode} IN (${literals(FAILURE_CODES)})`,
    ),
    check(
      "job_analysis_provider_allowed",
      sql`${table.provider} IS NULL OR ${table.provider} IN (${literals(ANALYSIS_PROVIDERS)})`,
    ),
    // A failure code exists if and only if the run failed; requirements if and only if it completed.
    check(
      "job_analysis_failure_code_iff_failed",
      sql`(${table.status} = 'failed') = (${table.failureCode} IS NOT NULL)`,
    ),
    check(
      "job_analysis_requirements_iff_completed",
      sql`(${table.status} = 'completed') = (${table.requirements} IS NOT NULL)`,
    ),
    check(
      "job_analysis_completed_has_provenance",
      sql`${table.status} <> 'completed' OR (${table.descriptionHash} IS NOT NULL AND ${table.promptVersion} IS NOT NULL AND ${table.provider} IS NOT NULL AND ${table.completedAt} IS NOT NULL)`,
    ),
    check(
      "job_analysis_description_hash_format",
      sql`${table.descriptionHash} IS NULL OR ${table.descriptionHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "job_analysis_requirements_object",
      sql`${table.requirements} IS NULL OR (jsonb_typeof(${table.requirements}) = 'object' AND pg_column_size(${table.requirements}) <= 100000)`,
    ),
    check(
      "job_analysis_text_lengths",
      sql`(${table.promptVersion} IS NULL OR char_length(${table.promptVersion}) BETWEEN 1 AND 50) AND (${table.model} IS NULL OR char_length(${table.model}) BETWEEN 1 AND 200)`,
    ),
    check(
      "job_analysis_counters_non_negative",
      sql`${table.attempts} >= 0 AND ${table.droppedUngrounded} >= 0`,
    ),
  ],
);
