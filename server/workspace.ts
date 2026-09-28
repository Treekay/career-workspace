import type { FastifyInstance } from 'fastify';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import type { WorkspaceConfig } from '../config/runtime.js';
import type { WorkspaceDatabase } from './applications/repository.js';
import { applications, applicationEvents, artifacts } from './db/schema.js';
import { readDiscover, DiscoverError } from './discover/service.js';
import type { CareerOpsService } from './career-ops/service.js';
import type {
  WorkspaceSummary,
  IntegrationHealth,
  CareerDashboard,
} from '../shared/workspace.js';
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: WorkspaceDatabase,
  config: WorkspaceConfig,
  career: CareerOpsService,
) {
  let discoveryCache:
    { at: number; value: Promise<WorkspaceSummary['discovery']> } | undefined;
  function discovery(force = false) {
    if (!force && discoveryCache && Date.now() - discoveryCache.at < 30000)
      return discoveryCache.value;
    const value = readDiscover(config)
      .then((d) => ({
        status: d.status,
        today: d.today_new_count,
        high: d.jobs.filter((j) => j.fit === 'HIGH').length,
        message:
          d.status === 'stale'
            ? 'Export is stale. Refresh job-alert-workflow separately.'
            : 'Generated review queue is available.',
        updatedAt: d.export_modified_at,
      }))
      .catch((e: unknown) => ({
        status: e instanceof DiscoverError ? e.status : 'unavailable',
        today: null,
        high: null,
        message:
          e instanceof DiscoverError
            ? e.message
            : 'Cannot read the local export.',
        updatedAt: null,
      }));
    discoveryCache = { at: Date.now(), value };
    return value;
  }
  app.get('/api/workspace/summary', async (): Promise<WorkspaceSummary> => ({
    discovery: await discovery(),
    activity: db
      .select({
        id: applicationEvents.id,
        applicationId: applications.id,
        company: applications.company,
        title: applications.title,
        stage: applicationEvents.stage,
        type: applicationEvents.event_type,
        at: applicationEvents.event_at,
        note: applicationEvents.note,
        deletedAt: applications.deleted_at,
      })
      .from(applicationEvents)
      .innerJoin(
        applications,
        eq(applications.id, applicationEvents.application_id),
      )
      .orderBy(desc(applicationEvents.id))
      .limit(12)
      .all()
      .map(({ deletedAt, ...e }) => ({ ...e, archived: Boolean(deletedAt) })),
  }));
  app.get<{ Querystring: { refresh?: string } }>(
    '/api/workspace/integrations',
    async (request): Promise<IntegrationHealth> => {
      const d = await discovery(request.query.refresh === 'true');
      let database = {
        status: 'Connected',
        message: 'Local SQLite is available.',
      };
      try {
        db.get(sql`SELECT 1`);
      } catch {
        database = {
          status: 'Unavailable',
          message:
            'Cannot read SQLite. Check the local data path and permissions.',
        };
      }
      return {
        checkedAt: new Date().toISOString(),
        database,
        easyseek: {
          status: config.importExtensionOrigins.length
            ? 'Connected'
            : 'Not configured',
          endpoint: `http://localhost:${config.apiPort}`,
          message: config.importExtensionOrigins.length
            ? 'Import endpoint ready for allowlisted extensions. Browser installation and online status cannot be detected.'
            : 'Import endpoint ready. Add the extension origin in Settings and enable Career Workspace in EasySeek. Browser status cannot be detected.',
        },
        alerts: {
          status:
            d.status === 'ready'
              ? 'Connected'
              : d.status === 'missing' || d.status === 'unavailable'
                ? 'Unavailable'
                : 'Error',
          message: d.message,
        },
      };
    },
  );
  app.get('/api/workspace/career-ops', async (): Promise<CareerDashboard> => {
    const rows = db
      .select()
      .from(applications)
      .where(isNull(applications.deleted_at))
      .all();
    const runs: CareerDashboard['runs'] = [];
    const warnings: string[] = [];
    for (const row of rows) {
      try {
        runs.push(...career.list(row.id));
      } catch {
        warnings.push(
          `Could not read workflow history for ${row.company}. Open the application to retry.`,
        );
      }
    }
    return {
      applications: rows.map((a) => ({
        id: a.id,
        company: a.company,
        title: a.title,
        stage: a.stage,
        hasJd: Boolean(a.jd_markdown?.trim()),
        analyzed: Boolean(a.analysis_summary),
      })),
      runs: runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      warnings,
      artifacts: db
        .select({
          id: artifacts.id,
          applicationId: applications.id,
          type: artifacts.type,
          path: artifacts.path,
          createdAt: artifacts.created_at,
        })
        .from(artifacts)
        .innerJoin(applications, eq(applications.id, artifacts.application_id))
        .where(isNull(applications.deleted_at))
        .orderBy(desc(artifacts.created_at))
        .limit(30)
        .all(),
    };
  });
}
