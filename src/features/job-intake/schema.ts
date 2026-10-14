import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "@/lib/schema";

// Keep in sync with JOB_LIMITS in validation.ts (the CHECK constraints are the last line of defence).
export const jobPosting = pgTable(
  "job_posting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Ownership: every posting belongs to exactly one user and is removed with them.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    sourceUrl: text("source_url"),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Serves "my jobs, newest first" without scanning other users' rows.
    index("job_posting_user_id_created_at_idx").on(table.userId, table.createdAt.desc()),
    // `[^[:space:]]` = at least one non-whitespace character (btrim only strips spaces, not
    // tabs or newlines, so a newline-only value would otherwise pass).
    check(
      "job_posting_title_length",
      sql`${table.title} ~ '[^[:space:]]' AND char_length(${table.title}) <= 200`,
    ),
    check(
      "job_posting_company_length",
      sql`${table.company} ~ '[^[:space:]]' AND char_length(${table.company}) <= 200`,
    ),
    check(
      "job_posting_description_length",
      sql`${table.description} ~ '[^[:space:]]' AND char_length(${table.description}) <= 20000`,
    ),
    check(
      "job_posting_location_length",
      sql`${table.location} IS NULL OR (${table.location} ~ '[^[:space:]]' AND char_length(${table.location}) <= 200)`,
    ),
    check(
      "job_posting_source_url_http",
      sql`${table.sourceUrl} IS NULL OR (char_length(${table.sourceUrl}) <= 2048 AND ${table.sourceUrl} ~* '^https?://')`,
    ),
  ],
);
