# Career Workspace contributor instructions

## Scope and boundaries

- This is an independent local-first TypeScript project.
- Preserve React + Vite, Fastify, SQLite, and Drizzle ORM.
- EasySeek, job-alert-workflow, and career-ops are sibling projects. Never merge or
  copy their source, import their internal modules, or modify their repositories
  as part of work here. Any future integration must use an explicit adapter and
  documented interface.
- The tracker stores only explicitly followed jobs, not the entire job market.
  Keep discovery/browser memory independent from durable application records.
  The tracker UI, market import, and analytics remain outside the current phase.
- Route application writes through ApplicationService. Stage changes and their
  events must commit atomically; repeated current-stage requests are no-ops.
- Preserve append-only events and restrictive foreign keys. DELETE archives;
  browser cache expiry must never purge applications, events, or artifacts.
- Canonical keys are non-unique hints. Never auto-merge applications by key,
  URL, title, company, or source ID without a separately authorized merge flow.
- No authentication, cloud database, SaaS deployment, or Docker is needed.
- Bind development and preview services to 127.0.0.1. Do not expose this
  unauthenticated workspace to the network.

## Configuration and data

- Resolve relative paths against the project root, never the current shell directory.
- Keep sibling defaults portable: ../EasySeek, ../job-alert-workflow, ../career-ops.
- Read local configuration from .env/process environment. Commit only .env.example.
- Missing sibling folders should be shown as setup diagnostics, not crash startup.
- Keep local databases, WAL files, dependencies, and build output out of Git.
- Use Drizzle schemas and checked-in generated SQL migrations. Do not modify
  already-applied migrations or delete local user data to make a test pass.
- Keep sibling inspection read-only until an integration is explicitly authorized.

## Development and verification

- npm run dev starts frontend and backend; use the Vite /api proxy.
- Keep shared API contracts in shared/ and app construction separate from listening
  so API tests can use Fastify inject without opening a port.
- Preserve clear loading, unavailable, empty, and not-found states, keyboard focus,
  accessible navigation, and responsive layouts.
- Run npm run check after substantive changes. Use temporary databases for tests.
- Verify npm run dev and health/setup endpoints when changing startup or configuration.
- Document new environment variables and commands in README.md and .env.example.
- Before committing, inspect git diff and ensure no personal data or .env is staged.
