import type { FastifyInstance } from 'fastify';
import { asc } from 'drizzle-orm';
import { applications, applicationEvents } from '../db/schema.js';
import type { WorkspaceDatabase } from '../applications/repository.js';
import { calculateAnalytics } from './service.js';

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  db: WorkspaceDatabase,
) {
  app.get('/api/analytics', async () =>
    db.transaction(
      (tx) => {
        // A single read snapshot includes archived history and has no pagination cap.
        const rows = tx
          .select({
            id: applications.id,
            company: applications.company,
            title: applications.title,
            stage: applications.stage,
            fit_score: applications.fit_score,
            deleted_at: applications.deleted_at,
            applied_at: applications.applied_at,
          })
          .from(applications)
          .all();
        const events = tx
          .select({
            id: applicationEvents.id,
            application_id: applicationEvents.application_id,
            event_type: applicationEvents.event_type,
            stage: applicationEvents.stage,
            event_at: applicationEvents.event_at,
          })
          .from(applicationEvents)
          .orderBy(asc(applicationEvents.id))
          .all();
        return calculateAnalytics(rows, events);
      },
      { behavior: 'deferred' },
    ),
  );
}
