import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { WorkspaceConfig } from '../../config/runtime.js';
import { CareerOpsService } from './service.js';
export function registerCareerOpsRoutes(
  app: FastifyInstance,
  service: CareerOpsService,
  config: WorkspaceConfig,
) {
  app.register(async (routes) => {
    routes.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const allowed = [config.webPort, config.apiPort].flatMap((port) => [
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
      ]);
      let host = '';
      try {
        host = new URL('http://' + request.headers.host).hostname;
      } catch {
        /* Reject malformed hosts. */
      }
      if (
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(host) ||
        (request.headers.origin && !allowed.includes(request.headers.origin)) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      )
        return reply.code(403).send({
          error:
            'Career Ops actions are available only from the local workspace.',
        });
      if (
        request.method === 'POST' &&
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers['content-type'] || '',
        )
      )
        return reply.code(415).send({ error: 'Use application/json.' });
    });
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ZodError)
        return reply.code(400).send({ error: 'Invalid Career Ops request.' });
      const code =
        error instanceof Error &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;
      return reply.code(code).send({
        error:
          code < 500 || code === 503
            ? (error as Error).message
            : 'Career Ops local storage or process failed. Check configuration and permissions.',
      });
    });
    routes.get('/api/career-ops/connection', () => service.connection());
    routes.post('/api/career-ops/test', () => service.connection(true));
    routes.get<{ Params: { id: string } }>(
      '/api/applications/:id/career-ops/runs',
      (request) => service.list(request.params.id),
    );
    routes.post<{ Params: { id: string } }>(
      '/api/applications/:id/career-ops/runs',
      { bodyLimit: 1024 },
      async (request, reply) =>
        reply
          .code(202)
          .send(await service.start(request.params.id, request.body)),
    );
    routes.get<{ Params: { id: string; runId: string } }>(
      '/api/applications/:id/career-ops/runs/:runId/document',
      (request, reply) =>
        reply
          .type('text/markdown; charset=utf-8')
          .header(
            'Content-Disposition',
            'attachment; filename="career-ops-draft.md"',
          )
          .header('X-Content-Type-Options', 'nosniff')
          .send(service.document(request.params.id, request.params.runId)),
    );
  });
}
