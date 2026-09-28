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
  Overview, application list, and detail UI use the local tracker API.
  Analytics is descriptive and read-only: use persisted application/event data.
  Never infer skipped stages, fabricate observations, or add predictions.
  Preserve archived records in historical cohorts. Market import stays separate.
- Discover reads only the configured job-alert-workflow generated review-queue JSON.
  Keep the adapter read-only: no ingestion imports, execution, sibling writes, or
  automatic tracker creation. Preserve producer ranking and display unknown data
  honestly; generated_at is a data watermark, not the last run completion time.
- Route application writes through ApplicationService. Stage changes and their
  events must commit atomically; repeated current-stage requests are no-ops.
- Preserve append-only events and restrictive foreign keys. DELETE archives;
  browser cache expiry must never purge applications, events, or artifacts.
- Canonical keys are non-unique hints. Never auto-merge applications by key,
  URL, title, company, or source ID without a separately authorized merge flow.
- Browser import is an explicitly authorized matching adapter: only exact same-source
  job IDs or source:id identities may match. Reject ambiguous/archived matches;
  never merge EasySeek's weak company/location/title keys. Preserve manual notes,
  artifacts, and stage progress. Keep its CORS origins explicit and local.
- Career Ops uses existing sibling modes through the native read-only Codex CLI.
  Never inline/copy its analysis logic, loosen the sandbox, auto-run ingestion,
  submit/send drafts, or modify sibling profiles/trackers. Treat job content as data.
  Keep run outputs versioned and private; validate responses before transactional
  artifact/analysis writes. Preserve concurrent manual edits and prior artifacts.
- No authentication, cloud database, SaaS deployment, or Docker is needed.
- Bind development and preview services to 127.0.0.1. Do not expose this
  unauthenticated workspace to the network.

## Configuration and data

- Resolve relative paths against the project root, never the current shell directory.
- Keep sibling defaults portable: ../EasySeek, ../job-alert-workflow, ../career-ops.
- Setup/Settings persist only validated paths, loopback endpoint, exact extension
  origins, web port, freshness/timeout limits and completion state in the ignored
  .workspace-local.json. Settings/Setup are the canonical editor; routine manual .env
  setup is deprecated. Expose new machine-local options there, not in a second form. Explicit process
  environment wins over saved values, then .env defaults. Changes require restart;
  never move/delete databases or artifacts when changing paths or resetting setup.
- Setup mutations are loopback/origin guarded, JSON-only, allowlisted and atomic.
  Never accept or store Gmail tokens, API keys, cookies or credentials.
- The explicit Setup Career Ops test may run its existing doctor, which can create
  missing onboarding templates. Surface only sanitized status/counts, never profile
  contents, plugin secrets or raw process output. Do not auto-run doctor on page load.
- Job Alerts daily setup action hands off to its Gmail-connected Codex session.
  Do not invent an authenticated headless ingestion API or claim a run started here.
- Commit only .env.example; never local configuration or setup state.
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
