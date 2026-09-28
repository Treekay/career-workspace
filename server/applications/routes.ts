import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ApplicationRepository, type WorkspaceDatabase } from './repository.js';
import { ApplicationNotFound, ApplicationService } from './service.js';

export function registerApplicationRoutes(
  app: FastifyInstance,
  db: WorkspaceDatabase,
) {
  // Encapsulate error handling so existing infrastructure routes keep their behavior.
  app.register(
    async (routes) => {
      const service = new ApplicationService(new ApplicationRepository(db));
      routes.setErrorHandler((error, request, reply) => {
        if (error instanceof ZodError)
          return reply.code(400).send({
            error: 'Invalid request',
            issues: error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        if (error instanceof ApplicationNotFound)
          return reply.code(404).send({ error: error.message });
        const status =
          error instanceof Error &&
          'statusCode' in error &&
          typeof error.statusCode === 'number'
            ? error.statusCode
            : 500;
        if (status >= 400 && status < 500)
          return reply.code(status).send({
            error: error instanceof Error ? error.message : 'Invalid request',
          });
        request.log.error(error);
        return reply.code(500).send({ error: 'Internal server error' });
      });
      routes.post('/', async (request, reply) => {
        const application = service.create(request.body);
        return reply
          .code(201)
          .header('Location', '/api/applications/' + application.id)
          .send(application);
      });
      routes.get('/', async (request) => service.list(request.query));
      routes.get<{ Params: { id: string } }>('/:id', async (request) =>
        service.get(request.params.id, request.query),
      );
      routes.patch<{ Params: { id: string } }>('/:id', async (request) =>
        service.update(request.params.id, request.body),
      );
      routes.delete<{ Params: { id: string } }>(
        '/:id',
        async (request, reply) => {
          service.archive(request.params.id);
          return reply.code(204).send();
        },
      );
      routes.post<{ Params: { id: string } }>('/:id/stage', async (request) =>
        service.transition(request.params.id, request.body),
      );
      routes.get<{ Params: { id: string } }>('/:id/events', async (request) =>
        service.events(request.params.id),
      );
      routes.get<{ Params: { id: string } }>(
        '/:id/artifacts',
        async (request) => service.artifacts(request.params.id),
      );
      routes.post<{ Params: { id: string } }>(
        '/:id/artifacts',
        async (request, reply) =>
          reply
            .code(201)
            .send(service.addArtifact(request.params.id, request.body)),
      );
    },
    { prefix: '/api/applications' },
  );
}
