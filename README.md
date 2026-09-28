# Career Workspace

A local-first home for a job search, built with TypeScript, React + Vite, Fastify,
SQLite (better-sqlite3), and Drizzle ORM. This phase provides infrastructure and
navigation only. There is no application tracker, imported job data, authentication,
cloud database, deployment setup, or Docker dependency.

## Start

Use Node.js 22.12+ (Node 22 LTS recommended) and npm. From this repository:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API listens at http://127.0.0.1:3001.
Both bind to loopback only. Vite proxies /api to Fastify, so no CORS setup is needed.
The dev command starts both servers with file watching; Ctrl+C stops both.
Ports are strict: an occupied port fails rather than silently moving the UI.

Startup creates ./data/workspace.db and applies checked-in Drizzle migrations.
No environment file is required for the default sibling layout. An API health check
is available at http://127.0.0.1:3001/api/health; it executes a SQLite query and
returns HTTP 200 when healthy or 503 on a database query failure.

## Independent sibling projects

```text
F:/code/
  EasySeek/
  job-alert-workflow/
  career-ops/
  career-workspace/
```

The other projects retain their own code, dependencies, Git repositories, and data.
This repository does not import their modules, copy their code, execute commands
inside them, or modify their files. Settings only checks whether configured
directories exist; integrations and data adapters are future work.

To customize paths or ports:

```powershell
Copy-Item .env.example .env
```

Edit .env, then restart development. Existing process environment variables take
precedence over .env. All relative paths resolve against this repository's root,
including when the compiled server is launched from another working directory.
Absolute paths are also supported. In .env, forward slashes work well on Windows.

| Variable                | Default               |
| ----------------------- | --------------------- |
| API_PORT                | 3001                  |
| WEB_PORT                | 5173                  |
| DATABASE_PATH           | ./data/workspace.db   |
| EASYSEEK_PATH           | ../EasySeek           |
| JOB_ALERT_WORKFLOW_PATH | ../job-alert-workflow |
| CAREER_OPS_PATH         | ../career-ops         |

GET /api/setup reports configured/resolved project paths, directory availability,
and the database path. Missing siblings do not prevent startup. This endpoint is
read-only; edit .env to change configuration. There is no browser configuration
writer in this phase. Keep this unauthenticated development workspace on loopback.

## Pages

- Overview: workspace introduction and shortcuts.
- Discover, Applications, Analytics, Career Ops: clearly marked future placeholders.
- Application detail: reserved route /applications/:id; placeholder only.
- Settings / Setup: live API diagnostics for local paths and storage.
- Unknown routes: a navigation recovery page.

No tracker tables, application CRUD endpoints, sample applications, or fabricated
analytics are included.

## Structure

```text
client/             React pages, navigation shell, styles
server/             Fastify app and entrypoint
server/db/          Drizzle schema, SQLite connection, migration runner
shared/             API response types
config/             Root-relative environment configuration
drizzle/            Generated SQL migrations and snapshots (commit these)
tests/              Isolated configuration, database, and API tests
data/               Local database (created at runtime; Git-ignored)
```

## Commands and checks

| Command             | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| npm run dev         | Start frontend and backend together                |
| npm run dev:client  | Start Vite only                                    |
| npm run dev:server  | Start Fastify in watch mode only                   |
| npm test            | Run tests using temporary SQLite databases         |
| npm run typecheck   | Check frontend and backend TypeScript              |
| npm run build       | Typecheck and build client/server                  |
| npm run check       | Run tests and build                                |
| npm run db:generate | Generate a migration after schema changes          |
| npm run db:migrate  | Apply migrations without starting the API          |
| npm start           | Run compiled API after build                       |
| npm run preview     | Preview built frontend locally (API must also run) |

For a built local preview, run npm start in one terminal and npm run preview in
another. This is a local preview, not a deployment server. The compiled backend
still requires the repository's package.json and drizzle/ directory.

Schema changes belong in server/db/schema.ts. Generate and review SQL, commit
drizzle/ with the change, then apply the migration. Startup also applies pending
migrations, preserving existing metadata. Back up the database before future
schema changes. No destructive reset command is provided.

If a sibling is marked "Not found", verify .env and restart. If the API cannot
start, inspect terminal output for a port conflict, invalid configuration, or
database write permissions. SQLite and its WAL files are local and Git-ignored;
.env is ignored too.

Stack references: [Vite guide](https://vite.dev/guide/),
[Fastify](https://fastify.dev/docs/latest/),
[Drizzle migrations](https://orm.drizzle.team/docs/migrations).

## Browser verification

The browser suite starts and stops the combined dev command on isolated ports
45173/43001 and uses data/browser-test.db. It checks all navigation destinations,
a direct application-detail URL, setup diagnostics, mobile overflow, and recovery
from an API outage.

For bundled Chromium:

```powershell
npx playwright install chromium
npm run test:browser
```

Or use an existing Microsoft Edge installation without downloading a browser:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
```

Browser screenshots/traces live in ignored test-results/. Run npm run format to
format sources and npm run format:check to verify formatting.

The package override for @esbuild-kit/core-utils selects a patched esbuild version
for Drizzle Kit's transitive tooling dependency. Revisit it when updating Drizzle
Kit; verify both first-time and repeated migration generation after updates.
