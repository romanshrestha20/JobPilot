import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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

export const candidateSkill = pgTable(
  "candidate_skill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Ownership: removed together with the user. Every query is scoped by this column.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Canonical comparison key (see skills/skill-key.ts); one row per user and key.
    skillKey: text("skill_key").notNull(),
    displayName: text("display_name").notNull(),
    level: text("level"),
    yearsOfExperience: integer("years_of_experience"),
    evidence: text("evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("candidate_skill_user_id_skill_key_unique").on(table.userId, table.skillKey),
    check(
      "candidate_skill_skill_key_valid",
      sql`char_length(${table.skillKey}) BETWEEN 1 AND 80 AND ${table.skillKey} = btrim(${table.skillKey})`,
    ),
    check(
      "candidate_skill_display_name_valid",
      sql`char_length(${table.displayName}) BETWEEN 1 AND 80 AND ${table.displayName} = btrim(${table.displayName})`,
    ),
    check(
      "candidate_skill_level_allowed",
      sql`${table.level} IS NULL OR ${table.level} IN ('beginner', 'intermediate', 'advanced', 'expert')`,
    ),
    check(
      "candidate_skill_years_range",
      sql`${table.yearsOfExperience} IS NULL OR ${table.yearsOfExperience} BETWEEN 0 AND 60`,
    ),
    check(
      "candidate_skill_evidence_valid",
      sql`${table.evidence} IS NULL OR (char_length(${table.evidence}) BETWEEN 1 AND 500 AND btrim(${table.evidence}) <> '')`,
    ),
  ],
);
