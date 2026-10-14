CREATE TABLE "job_posting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text,
	"source_url" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_posting_title_length" CHECK (char_length(btrim("job_posting"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "job_posting_company_length" CHECK (char_length(btrim("job_posting"."company")) BETWEEN 1 AND 200),
	CONSTRAINT "job_posting_description_length" CHECK (char_length(btrim("job_posting"."description")) BETWEEN 1 AND 20000),
	CONSTRAINT "job_posting_location_length" CHECK ("job_posting"."location" IS NULL OR char_length(btrim("job_posting"."location")) BETWEEN 1 AND 200),
	CONSTRAINT "job_posting_source_url_http" CHECK ("job_posting"."source_url" IS NULL OR (char_length("job_posting"."source_url") <= 2048 AND "job_posting"."source_url" ~* '^https?://'))
);
--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_posting_user_id_created_at_idx" ON "job_posting" USING btree ("user_id","created_at" DESC NULLS LAST);