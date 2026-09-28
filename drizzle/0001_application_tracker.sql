CREATE TABLE `application_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` text NOT NULL,
	`event_type` text NOT NULL,
	`stage` text NOT NULL,
	`event_at` text NOT NULL,
	`note` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "application_events_type_check" CHECK("application_events"."event_type" IN ('CREATED', 'STAGE_CHANGED', 'ARCHIVED', 'ARTIFACT_ADDED')),
	CONSTRAINT "application_events_stage_check" CHECK("application_events"."stage" IN ('SAVED', 'PREPARING', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'))
);
--> statement-breakpoint
CREATE INDEX `application_events_application_idx` ON `application_events` (`application_id`,`id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_job_id` text,
	`canonical_key` text,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text,
	`url` text,
	`stage` text DEFAULT 'SAVED' NOT NULL,
	`applied_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`jd_markdown` text,
	`jd_saved_at` text,
	`fit_level` text,
	`fit_score` real,
	`analysis_summary` text,
	`next_action` text,
	`next_action_at` text,
	`notes` text,
	`deleted_at` text,
	CONSTRAINT "applications_source_check" CHECK("applications"."source" IN ('seek', 'linkedin', 'other')),
	CONSTRAINT "applications_stage_check" CHECK("applications"."stage" IN ('SAVED', 'PREPARING', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN')),
	CONSTRAINT "applications_title_check" CHECK(length(trim("applications"."title")) > 0),
	CONSTRAINT "applications_company_check" CHECK(length(trim("applications"."company")) > 0),
	CONSTRAINT "applications_fit_score_check" CHECK("applications"."fit_score" IS NULL OR "applications"."fit_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE INDEX `applications_canonical_key_idx` ON `applications` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `applications_source_job_idx` ON `applications` (`source`,`source_job_id`);--> statement-breakpoint
CREATE INDEX `applications_active_stage_idx` ON `applications` (`deleted_at`,`stage`);--> statement-breakpoint
CREATE INDEX `applications_next_action_idx` ON `applications` (`next_action_at`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "artifacts_type_check" CHECK("artifacts"."type" IN ('JD', 'CV', 'COVER_LETTER', 'ANALYSIS', 'INTERVIEW_NOTES')),
	CONSTRAINT "artifacts_path_check" CHECK(length(trim("artifacts"."path")) > 0)
);
--> statement-breakpoint
CREATE INDEX `artifacts_application_idx` ON `artifacts` (`application_id`);