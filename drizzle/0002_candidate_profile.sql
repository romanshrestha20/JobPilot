CREATE TABLE "candidate_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"headline" text,
	"summary" text,
	"location" text,
	"years_of_experience" integer,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"work_modes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "candidate_profile_years_of_experience_range" CHECK ("candidate_profile"."years_of_experience" IS NULL OR "candidate_profile"."years_of_experience" BETWEEN 0 AND 60),
	CONSTRAINT "candidate_profile_work_modes_allowed" CHECK ("candidate_profile"."work_modes" <@ ARRAY['remote', 'hybrid', 'onsite']::text[])
);
--> statement-breakpoint
ALTER TABLE "candidate_profile" ADD CONSTRAINT "candidate_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;