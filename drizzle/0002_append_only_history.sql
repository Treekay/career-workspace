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

