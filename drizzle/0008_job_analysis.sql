CREATE TABLE "job_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"description_hash" text,
	"prompt_version" text,
	"provider" text,
	"model" text,
	"requirements" jsonb,
	"dropped_ungrounded" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_analysis_status_allowed" CHECK ("job_analysis"."status" IN ('pending', 'processing', 'completed', 'failed')),
	CONSTRAINT "job_analysis_failure_code_allowed" CHECK ("job_analysis"."failure_code" IS NULL OR "job_analysis"."failure_code" IN ('provider_unavailable', 'model_unavailable', 'timeout', 'invalid_output', 'too_long', 'enqueue_failed', 'job_missing')),
	CONSTRAINT "job_analysis_provider_allowed" CHECK ("job_analysis"."provider" IS NULL OR "job_analysis"."provider" IN ('ollama', 'demo')),
	CONSTRAINT "job_analysis_failure_code_iff_failed" CHECK (("job_analysis"."status" = 'failed') = ("job_analysis"."failure_code" IS NOT NULL)),
	CONSTRAINT "job_analysis_requirements_iff_completed" CHECK (("job_analysis"."status" = 'completed') = ("job_analysis"."requirements" IS NOT NULL)),
	CONSTRAINT "job_analysis_completed_has_provenance" CHECK ("job_analysis"."status" <> 'completed' OR ("job_analysis"."description_hash" IS NOT NULL AND "job_analysis"."prompt_version" IS NOT NULL AND "job_analysis"."provider" IS NOT NULL AND "job_analysis"."completed_at" IS NOT NULL)),
	CONSTRAINT "job_analysis_description_hash_format" CHECK ("job_analysis"."description_hash" IS NULL OR "job_analysis"."description_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "job_analysis_requirements_object" CHECK ("job_analysis"."requirements" IS NULL OR (jsonb_typeof("job_analysis"."requirements") = 'object' AND pg_column_size("job_analysis"."requirements") <= 100000)),
	CONSTRAINT "job_analysis_text_lengths" CHECK (("job_analysis"."prompt_version" IS NULL OR char_length("job_analysis"."prompt_version") BETWEEN 1 AND 50) AND ("job_analysis"."model" IS NULL OR char_length("job_analysis"."model") BETWEEN 1 AND 200)),
	CONSTRAINT "job_analysis_counters_non_negative" CHECK ("job_analysis"."attempts" >= 0 AND "job_analysis"."dropped_ungrounded" >= 0)
);
--> statement-breakpoint
ALTER TABLE "job_analysis" ADD CONSTRAINT "job_analysis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_analysis" ADD CONSTRAINT "job_analysis_job_id_user_id_fk" FOREIGN KEY ("job_id","user_id") REFERENCES "public"."job_posting"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_analysis_one_active_per_job" ON "job_analysis" USING btree ("job_id") WHERE "job_analysis"."status" IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "job_analysis_user_id_job_id_created_at_idx" ON "job_analysis" USING btree ("user_id","job_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_analysis_user_id_created_at_idx" ON "job_analysis" USING btree ("user_id","created_at" DESC NULLS LAST);