import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "@/lib/schema";

export const candidateProfile = pgTable(
  "candidate_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Ownership: exactly one profile per user, removed together with the user.
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    headline: text("headline"),
    summary: text("summary"),
    location: text("location"),
    yearsOfExperience: integer("years_of_experience"),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    workModes: text("work_modes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "candidate_profile_years_of_experience_range",
      sql`${table.yearsOfExperience} IS NULL OR ${table.yearsOfExperience} BETWEEN 0 AND 60`,
    ),
    check(
      "candidate_profile_work_modes_allowed",
      sql`${table.workModes} <@ ARRAY['remote', 'hybrid', 'onsite']::text[]`,
    ),
  ],
);
