ALTER TABLE "job_posting" DROP CONSTRAINT "job_posting_title_length";--> statement-breakpoint
ALTER TABLE "job_posting" DROP CONSTRAINT "job_posting_company_length";--> statement-breakpoint
ALTER TABLE "job_posting" DROP CONSTRAINT "job_posting_description_length";--> statement-breakpoint
ALTER TABLE "job_posting" DROP CONSTRAINT "job_posting_location_length";--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_title_length" CHECK ("job_posting"."title" ~ '[^[:space:]]' AND char_length("job_posting"."title") <= 200);--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_company_length" CHECK ("job_posting"."company" ~ '[^[:space:]]' AND char_length("job_posting"."company") <= 200);--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_description_length" CHECK ("job_posting"."description" ~ '[^[:space:]]' AND char_length("job_posting"."description") <= 20000);--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_location_length" CHECK ("job_posting"."location" IS NULL OR ("job_posting"."location" ~ '[^[:space:]]' AND char_length("job_posting"."location") <= 200));