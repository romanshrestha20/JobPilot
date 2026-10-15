CREATE TABLE "candidate_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"skill_key" text NOT NULL,
	"display_name" text NOT NULL,
	"level" text,
	"years_of_experience" integer,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_skill_user_id_skill_key_unique" UNIQUE("user_id","skill_key"),
	CONSTRAINT "candidate_skill_skill_key_valid" CHECK (char_length("candidate_skill"."skill_key") BETWEEN 1 AND 80 AND "candidate_skill"."skill_key" = btrim("candidate_skill"."skill_key")),
	CONSTRAINT "candidate_skill_display_name_valid" CHECK (char_length("candidate_skill"."display_name") BETWEEN 1 AND 80 AND "candidate_skill"."display_name" = btrim("candidate_skill"."display_name")),
	CONSTRAINT "candidate_skill_level_allowed" CHECK ("candidate_skill"."level" IS NULL OR "candidate_skill"."level" IN ('beginner', 'intermediate', 'advanced', 'expert')),
	CONSTRAINT "candidate_skill_years_range" CHECK ("candidate_skill"."years_of_experience" IS NULL OR "candidate_skill"."years_of_experience" BETWEEN 0 AND 60),
	CONSTRAINT "candidate_skill_evidence_valid" CHECK ("candidate_skill"."evidence" IS NULL OR (char_length("candidate_skill"."evidence") BETWEEN 1 AND 500 AND btrim("candidate_skill"."evidence") <> ''))
);
--> statement-breakpoint
ALTER TABLE "candidate_skill" ADD CONSTRAINT "candidate_skill_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;