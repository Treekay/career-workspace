import { registerWorkspaceRoutes } from './workspace.js';
import { CareerOpsService } from './career-ops/service.js';
import { registerCareerOpsRoutes } from './career-ops/routes.js';
import type { Runner } from './career-ops/process.js';
import { ApplicationService } from './applications/service.js';
import { ApplicationRepository } from './applications/repository.js';
import Fastify from 'fastify';
import { registerDiscoverRoutes } from './discover/routes.js';
import { registerAnalyticsRoutes } from './analytics/routes.js';
import { registerApplicationRoutes } from './applications/routes.js';
import { statSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { readConfig, type WorkspaceConfig } from '../config/runtime.js';
import { openDatabase } from './db/client.js';
import type { HealthResponse, SetupResponse } from '../shared/api.js';

export function buildApp(
  config: WorkspaceConfig = readConfig(),
  logger = false,
  dependencies: { careerOpsRunner?: Runner } = {},
) {
  const app = Fastify({ logger });
  const { db, sqlite } = openDatabase(config.databasePath);
  const careerOps = new CareerOpsService(
    config,
    new ApplicationService(new ApplicationRepository(db)),
    dependencies.careerOpsRunner,
  );
  registerCareerOpsRoutes(app, careerOps, config);
  registerWorkspaceRoutes(app, db, config, careerOps);
  app.addHook('onClose', async () => {
    await careerOps.close();
    sqlite.close();
  });
  app.get<{ Reply: HealthResponse }>('/api/health', async (_request, reply) => {
    try {
      db.get(sql`SELECT 1`);
      return { status: 'ok', service: 'career-workspace', database: 'ok' };
    } catch (error) {
      app.log.error(error, 'Database health check failed');
      return reply.code(503).send({
        status: 'error',
        service: 'career-workspace',
        database: 'unavailable',
      });
    }
  });
  app.get<{ Reply: SetupResponse }>('/api/setup', async () => ({
    database: { path: config.databasePath },
    projects: config.projects.map((project) => {
      let available = false;
      try {
        available = statSync(project.path).isDirectory();
      } catch {
        /* An absent sibling is a valid setup state. */
      }
      return { ...project, available };
    }),
  }));
  registerApplicationRoutes(app, db, config);
  registerAnalyticsRoutes(app, db);
  registerDiscoverRoutes(app, config);
  return app;
}
