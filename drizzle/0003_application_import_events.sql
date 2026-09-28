CREATE TABLE `__new_application_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` text NOT NULL,
	`event_type` text NOT NULL,
	`stage` text NOT NULL,
	`event_at` text NOT NULL,
	`note` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "application_events_type_check" CHECK("__new_application_events"."event_type" IN ('CREATED', 'STAGE_CHANGED', 'ARCHIVED', 'ARTIFACT_ADDED', 'IMPORTED')),
	CONSTRAINT "application_events_stage_check" CHECK("__new_application_events"."stage" IN ('SAVED', 'PREPARING', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'))
);
--> statement-breakpoint
INSERT INTO `__new_application_events`("id", "application_id", "event_type", "stage", "event_at", "note") SELECT "id", "application_id", "event_type", "stage", "event_at", "note" FROM `application_events`;--> statement-breakpoint
DROP TABLE `application_events`;--> statement-breakpoint
ALTER TABLE `__new_application_events` RENAME TO `application_events`;--> statement-breakpoint
CREATE INDEX `application_events_application_idx` ON `application_events` (`application_id`,`id`);
--> statement-breakpoint
-- Events are append-only even if a future adapter bypasses the HTTP layer.
CREATE TRIGGER application_events_no_update
BEFORE UPDATE ON application_events
BEGIN
  SELECT RAISE(ABORT, 'Application history is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER application_events_no_delete
BEFORE DELETE ON application_events
BEGIN
  SELECT RAISE(ABORT, 'Application history is append-only');
END;

