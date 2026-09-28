# Career Workspace

A local-first home for a job search, built with TypeScript, React + Vite, Fastify,
SQLite (better-sqlite3), and Drizzle ORM. Includes the navigation shell and a local
application tracker API with durable stage history and artifact references.
Overview, application list, and detail pages use this API. There is no market import, authentication, cloud
database, deployment setup, or Docker dependency.

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
directories exist. Discover reads the generated review queue through a read-only
adapter; ingestion remains in job-alert-workflow.

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
| DISCOVER_STALE_HOURS    | 36                    |

GET /api/setup reports configured/resolved project paths, directory availability,
and the database path. Missing siblings do not prevent startup. This endpoint is
read-only; edit .env to change configuration. There is no browser configuration
writer in this phase. Keep this unauthenticated development workspace on loopback.

## Pages

- Overview: six KPI cards, status donut, upcoming actions, waiting list, and fit ranking.
- Applications: compact cards with filters, search, stage selectors, and an add form.
- Analytics: recorded-path Sankey, conversion rates, stage age, fit ranking,
  progression scatter, and weekly/monthly application volume.
- Discover: read-only review queue with scope, fit, source, search, and sorting.
- Career Ops: clearly marked future placeholder.
- Application detail: /applications/:id with JD snapshot, analysis, artifacts, timeline,
  quick stage changes, and editable notes/next action.
- Settings / Setup: live API diagnostics for local paths and storage.
- Unknown routes: a navigation recovery page.

Tracker functionality is available through the API described below. No sample
applications or fabricated analytics are seeded.

## Structure

```text
client/             React pages, navigation shell, styles
server/             Fastify app and entrypoint
server/db/          Drizzle schema, SQLite connection, migration runner
server/applications/ Repository, transaction service, validation, API routes
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
45173/43001 and uses a fresh data/browser-test-<uuid>.db. It checks all navigation destinations,
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

## Application tracker API

The tracker stores only jobs you explicitly decide to follow. There is no market
crawler, discovery-cache import, automatic ingestion, or cache-expiry job.

### Model and retention

- **applications**: UUID id; required source, title, company; source_job_id,
  canonical_key, location, url; stage; applied_at, created_at, updated_at;
  jd_markdown, jd_saved_at; fit_level, fit_score, analysis_summary; next_action,
  next_action_at; notes. Optional fields are nullable. The additional deleted_at
  timestamp implements archival without losing history.
- **application_events**: increasing integer id, application_id, event_type,
  destination/current stage, event_at, note. Events are ordered by id so transitions
  in the same millisecond remain ordered. Event types are CREATED, STAGE_CHANGED,
  ARTIFACT_ADDED, and ARCHIVED. SQL triggers reject event updates and deletes.
- **artifacts**: UUID id, application_id, type, path, created_at. Types are JD, CV,
  COVER_LETTER, ANALYSIS, and INTERVIEW_NOTES. Paths are references only; registering
  one does not read, upload, copy, serve, or delete a file. Relative paths are
  intended to refer to the workspace root; absolute paths may reference your other
  local storage. No file existence requirement is imposed.

Both child tables use restrictive foreign keys, never cascade deletion.
There is no reference from applications to browser/discovery memory. Clearing
browser storage or expiring a future discovery cache cannot remove tracked jobs.
This does not replace backing up the SQLite file.

Stages: SAVED, PREPARING, APPLIED, SCREENING, INTERVIEW, OFFERED, REJECTED, WITHDRAWN.
Creation defaults to SAVED; an explicitly supplied initial stage is supported.
Every creation has a CREATED event. Use the stage endpoint for transitions;
PATCH rejects stage. Any explicit change between these stages is allowed,
including reopening after rejection/withdrawal. Each actual change creates exactly
one STAGE_CHANGED event in the same immediate SQLite transaction as the row update.
Repeating the current stage is a no-op, including its note and updated_at.
A failure to write the event rolls back the entire transaction.

All timestamps use UTC ISO 8601 text. Input dates must include a time and timezone.
Entering APPLIED fills applied_at only if it is missing; moving away or returning
does not clear it. An explicitly known historical applied_at can be supplied on
creation or corrected through PATCH. Other stages do not invent an application
date. Saving/changing jd_markdown automatically sets jd_saved_at unless explicitly
provided; clearing the JD through PATCH also clears that timestamp by default.

fit_score is an optional number from 0 to 100. fit_level is optional free text,
so no unrequested rating taxonomy is imposed. No fit score is calculated here.

canonical_key is a **non-unique, indexed hint**. On creation, it defaults to
source:source_job_id when an ID exists (for example seek:123); otherwise null.
An explicit key can correlate SEEK and LinkedIn entries later, but even identical
keys/source IDs create independent records. No title/company matching or auto-merge
runs. Keys remain stable when other metadata is edited; update canonical_key
explicitly if correcting source identity. Preserve both records and histories
until a future explicit merge workflow is designed.

DELETE archives by setting deleted_at and appending one ARCHIVED event.
Repeated DELETE is idempotent. Normal reads hide archived records; they remain
available with include_deleted=true. History and artifact reads remain available
after archival. Writes to archived applications return 404. There is no hard
delete, purge, restore, or event-edit API in this phase.

### Routes

All bodies and responses use snake_case. Unknown body/query fields and invalid
enums, dates, URLs, scores, or IDs return 400; missing records return 404.

| Method | Path                            | Behavior                                                                                                         |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | /api/applications               | Create; JSON requires source, title, company; returns 201 and Location                                           |
| GET    | /api/applications               | List, newest creation first; optional stage, include_deleted=true, limit (1–200, default 50), offset (default 0) |
| GET    | /api/applications/:id           | Read; optional include_deleted=true                                                                              |
| PATCH  | /api/applications/:id           | Change metadata; omit unchanged fields, use null to clear nullable fields                                        |
| DELETE | /api/applications/:id           | Archive; returns 204                                                                                             |
| POST   | /api/applications/:id/stage     | Body: stage and optional note                                                                                    |
| GET    | /api/applications/:id/events    | Read retained event history, oldest insertion first                                                              |
| POST   | /api/applications/:id/artifacts | Body: type and path; returns 201                                                                                 |
| GET    | /api/applications/:id/artifacts | Read artifact references, including after archive                                                                |

List routes return JSON arrays; individual writes/reads return the saved object.
IDs and created_at/updated_at/deleted_at are server-managed.
The service is the required write boundary for future adapters: do not mutate
application rows directly from a discovery/browser integration.

### Verify without adding UI

With npm run dev running, this PowerShell example intentionally creates one
tracked application (use a test database via DATABASE_PATH if preferred):

```powershell
$api = 'http://127.0.0.1:3001/api/applications'
$body = @{ source = 'other'; title = 'Example role'; company = 'Example company' } | ConvertTo-Json
$application = Invoke-RestMethod -Method Post -Uri $api -ContentType 'application/json' -Body $body
Invoke-RestMethod -Method Post -Uri "$api/$($application.id)/stage" -ContentType 'application/json' -Body '{"stage":"APPLIED","note":"Submitted application"}'
Invoke-RestMethod -Uri "$api/$($application.id)/events"
```

### Migrations and schema inspection

Existing databases upgrade in place. The initial metadata migration is unchanged.
0001_application_tracker adds the three tables, indexes, checks, and foreign keys.
0002_append_only_history installs the event immutability triggers.

```powershell
npm run db:migrate
npm run db:inspect
npm run check
```

db:inspect opens the configured database read-only and prints columns, indexes,
foreign keys, table/trigger definitions, foreign_key_check, and integrity_check.
Run migrations first if the database has not been created yet.

For future schema changes:

```powershell
npm run db:generate -- --name=describe_change
# Review the generated SQL before applying.
npm run db:migrate
npm run db:inspect
```

Use a new custom migration for trigger changes; never edit an applied migration.
If a future migration rebuilds application_events, preserve/recreate its immutable
history triggers. Back up local data before schema changes. Startup also applies
pending migrations; it does not reset tables.

The tests cover CRUD, each stage, repeated transitions, retained applied_at,
atomic rollback on event-write failures, archives, artifact types, duplicate keys,
validation/SQL constraints, immutable history, upgrading an original database,
and persistence after browser-cache expiry and database reopen.

## Tracker UI behavior

Run npm run dev and open the Overview or Applications page. Add an application
from either page, then use the stage selector on a card or detail page to save
a transition immediately. Every actual change uses the existing transactional
stage API and appends an event. Selecting the current stage does nothing.
A failed save displays an error and retains the previous stage.

- Total applications counts tracked, non-archived records, including saved jobs.
- Active includes SAVED, PREPARING, APPLIED, SCREENING, INTERVIEW, and OFFERED.
- Waiting is the APPLIED + SCREENING subset of Active.
- Closed includes REJECTED and WITHDRAWN; Interviews, Rejected, and Offers KPIs
  count their current stages, not historical entries.
- Days in stage uses the newest CREATED/STAGE_CHANGED event. Editing notes or
  attaching a file never resets it. Read APIs expose this as stage_entered_at.
- Upcoming actions shows up to six active jobs, earliest due first, including
  overdue items and then undated actions. Waiting shows the six longest waits.
- Fit ranking shows the six highest recorded scores among active jobs. Zero is
  a real score; missing scores remain unassessed. No score is generated by the UI.
- Lists and dashboard read every API page rather than silently stopping at 50/200.
  Filters/search operate on this complete local snapshot; navigation reloads data.
- Notes and next-action edits save together. Due times use your local timezone
  in the form and UTC in storage.
- The JD is displayed verbatim as safe plain text, preserving Markdown source.
  Analysis displays the saved summary. Artifact paths are references, not file
  downloads; no local filesystem-serving endpoint is introduced.
- Charts use CSS and native meter elements with text labels; no chart dependency
  or external fonts are fetched. Loading, empty, missing-record, and failed-save
  states are explicit. The layout works on desktop and narrow screens.

npm run check covers backend history and event-derived stage age. Browser coverage
(npm run test:browser) exercises creation, all stages, filters/search, KPI totals,
pagination, saved notes, error recovery, timelines, and mobile overflow. Sample
records live only in the isolated browser-test database, never the workspace DB.

## Analytics

Open /analytics. GET /api/analytics reads a single SQLite snapshot of persisted
application records and events; there are no schema changes or additional
migrations for this page. Refresh reloads the data and recalculates elapsed days.
The endpoint performs no writes, imports, network lookups, scoring, or predictions.
It reads all records without the application-list pagination limit.

Historical cohorts include archived applications, so archiving does not erase
outcomes. Active stage-age bars exclude archived, REJECTED, and WITHDRAWN records.
Fit ranking includes every recorded non-null score, including zero, closed jobs,
and archived jobs. Archived records are labeled and are not linked to an unavailable
active detail page.

### Definitions

- **Funnel / Sankey:** only CREATED and STAGE_CHANGED events, in insertion order.
  Each application's path starts at its first explicit APPLIED event. Skipped
  stages are not added; reopened/repeated paths remain visible, with consecutive
  duplicate stages collapsed. Sankey nodes are keyed by event step plus stage,
  allowing returns to earlier stages without inventing a fixed linear funnel.
  Ribbons aggregate actual adjacent transitions at that step. A path can end at
  any node. Exact complete paths and distinct-record counts are listed underneath.
  Records without an APPLIED event are counted separately and excluded.
- **Applied → Interview:** distinct records with an INTERVIEW event after an
  APPLIED event / distinct records with an APPLIED event.
- **Interview → Offer:** distinct records with OFFERED after INTERVIEW / distinct
  records with INTERVIEW.
- **Applied → Offer:** distinct records with OFFERED after APPLIED / distinct
  records with APPLIED. An offer does not imply an unrecorded interview.
  Repeated cycles count once per record. Zero denominators produce unavailable
  rates (—), not 0%. Open cohorts are included, so rates are observed to date.
- **Waiting time:** whole elapsed days since the latest CREATED/STAGE_CHANGED
  event matching the current stage. Metadata edits and artifacts do not reset
  the clock. Missing, mismatched, invalid, or future timestamps display Unknown.
  Waiting-only means APPLIED or SCREENING; all-active includes other open stages.
- **Match vs outcome:** X is the persisted fit_score. Y is the furthest explicitly
  recorded milestone: Saved=0, Preparing=1, Applied=2, Screening=3, Interview=4,
  Offered=5. This is an ordinal progression proxy, not success probability.
  Rejected/withdrawn jobs retain prior progression and show their current outcome.
  Jobs with no milestone history are excluded. The plot requires at least five
  scored histories, two distinct scores, and two progression values. Otherwise
  an explanatory empty state appears. Identical coordinates overlap and are
  counted; no jitter, regression, predicted values, or implied missing steps are
  added. The expandable observation list preserves each actual record.
- **Volume:** one count per record on applied_at if valid, otherwise its first
  APPLIED event date. No date is inferred from a later stage. Weekly buckets start
  Monday in UTC; monthly buckets start on day one in UTC. Only the earliest-to-
  latest observed range is charted. Empty intervening periods have an actual zero;
  no synthetic future periods are added. Undated records are counted separately.

Charts use local CSS/SVG/meter elements. No chart service or cloud dependency is
introduced. Tests cover the four requested paths, repeat cycles, event ordering,
archival, missing dates, zero/missing scores, scatter eligibility, UTC date
boundaries, empty periods, read-only behavior, and datasets above 200 records.

## Discover

Open /discover after starting `npm run dev`. GET /api/discover reads only
`job-ops/exports/review-queue.json` below JOB_ALERT_WORKFLOW_PATH (default
`../job-alert-workflow`). Generate this export using the sibling project's own
workflow. Refresh reloads the file; the workspace never runs ingestion, writes
back, or copies discovery jobs into SQLite/application history. EasySeek handles
browsing and marking; source links open in a new tab.

- Today means first seen on the current calendar date in the export's timezone.
- Last 30 Days includes jobs last seen today or in the preceding 29 calendar days.
- Counts reflect valid jobs in that window, not an earlier run's summary totals.
- Recommended preserves the producer's exported order. Fit sorts categorical
  HIGH, MEDIUM, LOW, SKIP, then UNASSESSED; no scores are calculated here.
- Search matches title, company, location, and reason. Filters combine with source
  and fit. Missing values stay visibly unknown.

The generated format supplies a last run **date**, not an exact run timestamp.
The page explicitly says this and separately displays the export file's modified
time and `generated_at` data watermark. The watermark can remain unchanged after
a successful run with no changed data; it is not presented as run completion time.

DISCOVER_STALE_HOURS is a positive number (default 36). A snapshot is stale when
its file modification time exceeds that age, or its run date precedes the cutoff
calendar date in the export timezone. Stale data remains visible with a warning.
Missing, unreadable, malformed, or unsupported exports show a retryable error.
The endpoint returns 200 with `status: ready | stale`, or 503 with
`status: missing | invalid | unavailable`, an error, and a recovery hint.
Responses are not cached.

The adapter validates the envelope, timezone, dates, and rows. Invalid/duplicate
rows are omitted with a visible warning. Reads are bounded to 10 MiB and a fixed
path; redirected paths outside the configured sibling are rejected. Source links
must be HTTP(S) URLs on the matching SEEK/LinkedIn domains; unsafe links are
unavailable. Export text is rendered as text, never HTML. No migrations are needed.

Tests use temporary export fixtures and isolated databases. Coverage includes
retention/timezone boundaries, stale/missing/invalid exports, read-only behavior,
file limits, redirected paths, unsafe URLs, all controls, new-tab isolation,
error recovery, and desktop/mobile layouts. No fixture jobs are seeded locally.

## Browser-extension import API

`POST /api/applications/import` accepts an explicit browser Saved/Applied handoff.
Start with `npm run dev`; use `http://127.0.0.1:3001/api/applications/import`.
The endpoint is local-only, JSON-only, and limited to a 1 MiB request body.

```json
{
  "source": "seek",
  "sourceJobId": "12345",
  "canonicalKey": "seek:12345",
  "title": "Software Engineer",
  "company": "Example",
  "location": "Auckland",
  "url": "https://www.seek.co.nz/job/12345",
  "jdMarkdown": "# Job description\nCaptured text",
  "mark": "SAVED",
  "requestedStage": "SAVED"
}
```

Required: `source` (`seek`, `linkedin`, `other`), nonblank `title` and `company`,
and `requestedStage` (`SAVED` or `APPLIED`). Provide a nonblank string sourceJobId
or an equivalent `source:id` canonicalKey; SEEK/LinkedIn IDs must be positive
digit strings. The other fields are optional. `mark` accepts `NONE`, `SAVED`,
or `APPLIED`; requestedStage controls the handoff. `SKIP` and a contradictory
APPLIED mark with requestedStage SAVED are rejected. SAVED mark plus requestedStage
APPLIED is valid because EasySeek keeps its mark and application stage separately.
Unknown fields, including notes/artifacts, are rejected.

The response is `{ "outcome": "created|updated|unchanged", "application": ... }`.
The application uses the existing snake_case tracker response. Creation returns
201; updates and identical retries return 200, with a Location header for detail.
Validation errors return 400, origin/local-client failures 403, identity conflicts
409, non-JSON requests 415, and oversized requests 413.

### Identity, updates, and history

- Matching uses exact `(source, sourceJobId)` or same-source `source:id` canonical
  identity. A canonical-only strong match fills the missing source ID. All matching
  rows, including archives, are checked within one immediate SQLite transaction.
- EasySeek's company/location/title canonical keys are retained as hints only.
  They never merge distinct source IDs or match across SEEK/LinkedIn. Weak-key-only
  payloads need a source ID; no title/company/URL fuzzy merge occurs.
- Conflicting identities, multiple matches, and archived matches return 409 without
  writes. Resolve these explicitly in the workspace; imports do not restore archives.
- Imports may update title, company, location, URL, and a nonblank JD snapshot.
  Null/omitted optional fields and blank JDs never clear existing data. An unchanged
  JD retains jd_saved_at. Existing canonical hints are preserved.
- Notes, artifacts, fit/analysis, next actions, and created_at are never overwritten.
  Identical retries preserve updated_at and do not append redundant events.
- New records create a CREATED event at SAVED or APPLIED. An APPLIED handoff advances
  SAVED/PREPARING only when no APPLIED history exists, with a STAGE_CHANGED event.
  A SAVED handoff never downgrades a record. Repeated APPLIED handoffs never undo
  manual progress, closure, or a manual return to an earlier stage.
- Changed import metadata/JD creates an IMPORTED event without resetting stage age.
  If a later-stage record has no APPLIED history, an IMPORTED event records the
  APPLIED assertion while preserving its current stage. Its timestamp is receipt
  time, not a reconstructed historical transition. Such assertions are not inserted
  into the chronological analytics funnel. A missing applied_at is set to receipt
  time; an existing applied_at is preserved.
- All row changes and events commit atomically. Failed event writes roll back the
  import. These rules do not change the ordinary create API's independent records.

### Local browser access

CORS applies only to this import route. Default allowed origins are exact HTTP
localhost, 127.0.0.1, or [::1] origins at API_PORT and WEB_PORT. Other ports, remote
sites (including job sites), opaque `null` origins, and arbitrary extensions are
rejected before a write. Only POST with Content-Type is permitted by preflight;
credentials are not enabled. Local command-line clients may omit Origin.
The route also checks the loopback client address and local Host header. CORS is
not authentication; this remains a trusted, single-user local service.

To allow EasySeek, copy its actual ID from the browser's extension management page
and set an exact origin in `.env`, then restart:

```dotenv
IMPORT_EXTENSION_ORIGINS=chrome-extension://YOUR_ACTUAL_32_CHARACTER_EXTENSION_ID
```

The placeholder above must be replaced with the real ID (32 lowercase letters a-p).
Multiple explicit origins can be comma-separated. Exact Firefox moz-extension UUID
origins are also accepted. An empty setting enables no extension origins. Use the
extension background/service worker for the handoff, with a narrowly scoped local
host permission; requests directly from a SEEK/LinkedIn page origin are denied.
This change supplies the workspace endpoint only and does not modify EasySeek.

Migration `0003_application_import_events` adds IMPORTED to the event constraint,
preserves existing event rows/IDs, and recreates append-only triggers. Startup
applies it automatically, or run `npm run db:migrate`; `npm run db:inspect` verifies
the schema. Back up your database before applying schema changes. Tests cover
populated upgrades, repeat/concurrent imports, rollback, ambiguous identities,
manual-data preservation, late handoffs, and allowed/denied browser origins.
