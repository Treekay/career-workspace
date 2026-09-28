import type { FastifyInstance } from 'fastify';
import type { WorkspaceConfig } from '../../config/runtime.js';
import { DiscoverError, readDiscover } from './service.js';
export function registerDiscoverRoutes(
  app: FastifyInstance,
  config: WorkspaceConfig,
) {
  app.get('/api/discover', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      return await readDiscover(config);
    } catch (error) {
      if (error instanceof DiscoverError)
        return reply.code(503).send({
          status: error.status,
          error: error.message,
          hint: error.hint,
        });
      throw error;
    }
  });
}
