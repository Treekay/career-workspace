import type { FastifyReply, FastifyRequest } from 'fastify';
import type { WorkspaceConfig } from '../../config/runtime.js';

export function importAccess(config: WorkspaceConfig) {
  const allowed = new Set([
    ...config.importExtensionOrigins,
    ...[config.apiPort, config.webPort].flatMap((port) => [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      `http://[::1]:${port}`,
    ]),
  ]);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store').header('Vary', 'Origin');
    const deny = () =>
      reply.code(403).send({
        error: 'Import requires a local client and an allowed origin',
      });
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip))
      return deny();
    try {
      const host = new URL('http://' + request.headers.host);
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) ||
        host.username ||
        host.password ||
        host.pathname !== '/'
      )
        return deny();
    } catch {
      return deny();
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !allowed.has(origin)) return deny();
    if (!origin && request.headers['sec-fetch-site'] === 'cross-site')
      return deny();
    if (origin) reply.header('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      if (
        !origin ||
        request.headers['access-control-request-method'] !== 'POST'
      )
        return deny();
      const headers = String(
        request.headers['access-control-request-headers'] ?? '',
      )
        .toLowerCase()
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      if (headers.some((h) => h !== 'content-type')) return deny();
      reply
        .header('Access-Control-Allow-Methods', 'POST')
        .header('Access-Control-Allow-Headers', 'Content-Type');
      if (request.headers['access-control-request-private-network'] === 'true')
        reply.header('Access-Control-Allow-Private-Network', 'true');
      return reply.code(204).send();
    }
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers['content-type'] ?? '',
      )
    )
      return reply
        .code(415)
        .send({ error: 'Import requires application/json' });
  };
}
