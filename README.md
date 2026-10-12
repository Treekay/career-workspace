# Career Workspace

A local-first home for a job search, built with TypeScript, React + Vite, Fastify,
SQLite (better-sqlite3), and Drizzle ORM. Includes the navigation shell and a local
application tracker API with durable stage history and artifact references.
Overview, application list, and detail pages use this API. There is no market import, authentication, cloud
database, deployment setup, or Docker dependency.

## Windows launcher

Closing the window with **X** hides it to the Windows system tray; services keep
running. Double-click the tray icon or choose **显示启动器** to restore it (the icon
may be under the taskbar's hidden-icons arrow). **停止** and tray **退出** both
stop the services gracefully and exit the launcher. Reopening the desktop shortcut
also restores the existing window. Records and settings are preserved.

Double-click **Career Workspace.vbs** in the repository. The small launcher offers
**启动并打开** (start and open), **打开页面** (open browser), and **停止** (stop).
Create a desktop shortcut to the VBS file for daily use. Node.js 22.12+ and dependencies
(`npm ci`, once) are still required; this is a launcher, not a standalone installer.

It reads the same Settings configuration and starts Fastify and Vite in a hidden,
owned Node process. Stop/start applies changed configuration and backend updates.
No npm terminal, CLI login window or extra configuration is needed for daily startup.
It does not launch Gmail workflows, install extensions, or change credentials.
Occupied ports produce an error: stop any previous `npm run dev` terminal first.
It never takes over or kills an existing service. Closing a browser tab does not stop it.

Stop closes Vite, cancels owned Career Ops tasks through the existing service lifecycle,
and closes SQLite. Pending analysis may be interrupted, so finish it before stopping.
Closing the launcher's input pipe also triggers shutdown after unexpected launcher exit.
Records and artifacts remain on disk. Only one launcher per repository/configuration can be open. Double-clicking again restores the
existing window, including when minimized; it does not start duplicate services.
PowerShell uses process-scoped `RemoteSigned` for the local launcher script; no permanent
execution-policy changes occur and organization policy remains authoritative. If a
downloaded copy is blocked, inspect its files and unblock it through Windows Properties.

For a launcher-window initialization check without starting services:
`powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File scripts/launcher.ps1 -CheckOnly`.
`tests/launcher.test.ts` uses isolated ports/config/database to check start, stop, owner
exit, restart and occupied-port handling.

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
This repository does not import sibling modules or copy their code. Discover reads
its export, and Career Ops runs its existing workflows through a read-only CLI adapter.
Discover reads the generated review queue through a read-only adapter; ingestion
remains in job-alert-workflow. The explicit Setup Career Ops test runs its existing
doctor, which may create missing onboarding templates without replacing user files.

Configure paths, ports and integration options in **Settings** or the **Setup Wizard**.
Both use the same validated, Git-ignored `.workspace-local.json`; save and restart
both servers. Routine manual `.env` configuration is deprecated. Existing `.env`
values remain compatible fallbacks; saving captures the effective values in Settings.
Explicit process overrides remain available for testing/recovery and are identified
in the form. Relative paths resolve from this repository, except the optional Career
Ops data root, which resolves from its repository.

See [Configuration audit](docs/CONFIGURATION.md) for every integrated configuration
value, ownership, defaults, external authorization and first-use checklist.

GET /api/setup reports configured/resolved project paths, directory availability,
and the database path. Missing siblings do not prevent startup. This endpoint is
read-only. The guarded /api/setup/settings endpoint powers the local configuration
form in Settings and Setup. Keep this unauthenticated development workspace on loopback.

## Pages

- Overview: six KPI cards, status donut, upcoming actions, waiting list, and fit ranking.
- Applications: compact cards with filters, search, stage selectors, and an add form.
- Analytics: recorded-path Sankey, conversion rates, stage age, fit ranking,
  progression scatter, and weekly/monthly application volume.
- Discover: read-only review queue with scope, fit, source, search, and sorting.
- Career Ops: optional workflow provider status and connection test; draft actions live on application detail.
- Application detail: /applications/:id with JD snapshot, analysis, artifacts, timeline,
  quick stage changes, and editable notes/next action.
- Settings: editable local configuration, diagnostics, rerun checks and reset setup state.
- Setup Wizard: /setup, five steps from local storage through final verification.
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

If a sibling is marked "Not found", verify Settings and any environment override, then restart. If the API cannot
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
or `APPLIED`; requestedStage controls the handoff. `SKIP` is also accepted with
requestedStage APPLIED because EasySeek keeps browsing marks and application stages
independent. SKIP or APPLIED marks with requestedStage SAVED are rejected.
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
and enter `chrome-extension://YOUR_ACTUAL_32_CHARACTER_EXTENSION_ID` in
Settings → Allowed extension origins, save, then restart.

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

## Optional Career Ops analysis provider

The integration was based on the sibling's PORTABILITY.md, AGENTS.md, skill router,
and its documented headless `codex exec` workflow. No scoring, CV-generation, or
other Career Ops implementation is copied here. V1 delegates exactly one mode:

| Detail action      | Existing Career Ops mode | Stored artifact type |
| ------------------ | ------------------------ | -------------------- |
| Analyze Fit        | oferta                   | ANALYSIS             |
| Tailor CV          | text                     | CV (Markdown)        |
| Draft Cover Letter | cover                    | COVER_LETTER         |
| Networking Plan    | contacto                 | ANALYSIS             |
| Interview Prep     | interview-prep           | INTERVIEW_NOTES      |

### Setup and connection

Keep the sibling at `../career-ops`, or edit its path in Settings and restart.
Prepare the candidate files using that project's own PORTABILITY.md/doctor workflow.
Set **Career Ops data root** in Settings, or leave it blank to use the sibling's
`.career-ops-data` marker, then its root. Explicit CAREER_OPS_ROOT / CAREER_OPS_DATA_DIR
process overrides remain compatible and are identified in Settings. The workspace reads these paths;
it never edits profiles or runs onboarding automatically.

Install and sign in to the existing Codex CLI separately (`codex login`). Configure
**Career Ops CLI executable** in Settings as `codex` for auto-detection or the
absolute native executable path.
Windows requires an .exe, not a PowerShell/cmd shim or a command string. The adapter
uses shell-free argv and sends the job context through stdin, not command arguments.
**Career Ops timeout (seconds)** defaults to 600, with an allowed range of 10–1800.

Open Settings, then **Test connection** (or **Test Career Ops** for the doctor):

- **Missing:** sibling directory is absent.
- **Invalid:** required workflow/profile files, executable, CLI flags, or CLI login
  are unavailable. The message identifies the local setup step.
- **Connected:** files, required CLI capabilities, and CLI login checks succeeded.
  This does not prove model quota/access or verify candidate facts. No model call
  is made by a connection test.

The workspace remains usable without this provider. Actions return a clear local
configuration error while unavailable. No new application authentication, API-key
store, cloud database, or service deployment is introduced. The locally executed
CLI still uses its model service and may use native web search for public research;
this is not a guarantee of offline inference. V1 ignores custom Codex user config
for predictable isolation and uses its existing login. Custom model/provider
profiles are outside this adapter's V1 scope.

### Execution and results

Save a full JD snapshot, open application detail, then select an action. Requests
contain application metadata, the full stored JD, current stage, and previous
analysis. Candidate facts come only from the career-ops permitted sources. The
prompt references the actual router/mode files and preserves source-of-truth,
provenance, and internal/external language rules. Job content is untrusted data.

The adapter uses `codex --ask-for-approval never --search exec --sandbox read-only`
with `--ignore-user-config`, `--ephemeral`, `--output-schema`, and
`--output-last-message`. These are the installed CLI's supported flags; see
[Codex non-interactive mode](https://developers.openai.com/codex/noninteractive).
It runs from a unique workspace-owned directory and asks the existing mode to
return its draft instead of writing its usual sibling output/tracker paths.
No auto-pipeline, sibling tracker update, profile update, message sending, job
submission, or ingestion is authorized. CV output is Markdown in V1, not PDF.

One run executes at a time per workspace server. The API immediately returns a run
record, and the UI polls for completion. Timeouts, malformed/oversized output,
nonzero CLI exit, and requests for missing information are explicit states. There
are no automatic retries. A server restart shows unfinished runs as Interrupted;
retry explicitly. Normal shutdown cancels the active process tree before closing
SQLite. Stdout/stderr are bounded and raw CLI diagnostics are not exposed in the UI.

Each run is preserved under:

```text
data/applications/<application-id>/career-ops/<run-uuid>/
  request.json    application/JD snapshot and prior analysis
  schema.json     expected response envelope
  response.json   original provider response (when available)
  result.md       completed draft
  run.json        action, timestamps, state, message, artifact reference
```

Directories are generated from UUIDs, with containment checks. Documents are saved
with exclusive creation; retries create new directories. Provider-returned file
paths are never trusted or followed. These local/private files are Git-ignored.
Back them up together with SQLite; transferring the Git repository alone does not
transfer applications or artifacts. A failed DB import may leave its draft files
for inspection, but it never partially updates application metadata/history.

Successful runs register an artifact and ARTIFACT_ADDED event atomically and update
updated_at. Analyze Fit also stores the summary and any returned fit level/score.
The provider must supply a numeric score's native maximum (5 or 100); it is normalized
to the tracker's 0–100 scale, with the original preserved in response.json. Null
scores/levels do not invent values or erase existing fields. Other actions retain
their result in the new artifact rather than replace the fit summary. If the JD,
stage, or prior analysis changed during execution, the artifact is retained and
newer application analysis is preserved, with a visible message. Notes, next actions,
stage history, and prior artifacts are never overwritten by these actions.

### Local API and verification

- GET /api/career-ops/connection and POST /api/career-ops/test report connection state.
- GET /api/applications/:id/career-ops/runs lists persisted run records.
- POST /api/applications/:id/career-ops/runs accepts `{ "action": "analyze-fit" }`
  (or the other action keys from the shared contract) and returns 202.
- GET /api/applications/:id/career-ops/runs/:runId/document downloads the fixed
  result Markdown as an attachment. It does not serve arbitrary file paths.

Provider endpoints require loopback clients and local workspace origins. POSTs are
JSON-only; arbitrary commands, paths, and unknown action fields are rejected.
No database migration is needed: runs use local manifests and results use the
existing applications/artifacts/events model. `npm run check` and
`npm run test:browser` cover isolated provider responses, all five modes, input
snapshots, explicit scoring, versioning, concurrency, manual-edit protection,
rollback, process limits, setup errors, and UI polling. Automated tests never invoke
model generation against real candidate data. A live model run additionally needs
a signed-in CLI with model access.

## Working across the local workspace

The six primary pages share one navigation shell: **Overview**, **Discover**,
**Applications**, **Analytics**, **Career Ops**, and **Settings**. Settings is the
single place for integration configuration and connection tests. The Setup Wizard
uses the same validated local settings. Configuration changes take effect after
restarting development.

Responsibilities remain separate:

| Project            | Responsibility                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- |
| job-alert-workflow | Discover jobs and produce the review-queue export                                            |
| EasySeek           | Browse source jobs, mark them, optionally hand off to the local import API                   |
| career-workspace   | Keep durable application records, stage history, actions, notes and artifact references      |
| career-ops         | Provide optional deep analysis and application-support drafts through its existing workflows |

Overview combines live application counts, short action/fit lists, persisted
application activity, and a read-only Discover snapshot. Missing discovery counts
are shown as unknown, not zero. Historical activity includes archives but does not
link to unavailable archived detail pages. A Career Ops artifact event identifies
a saved provider result; no synthetic job-alert run or browser events are created.
Export timestamps remain file/data timestamps, not claimed ingestion completion.

Applications and Discover store filters in their URLs, so shortcuts, reload and
browser history retain context. Detail sections are directly addressable with
`#overview`, `#job-description`, `#analysis`, `#documents`, `#timeline`, and `#notes`.
Stage changes update the affected card in place and preserve transactional history.
Analytics links to current stage views are explicitly labeled as current records;
those views are distinct from historical conversion cohorts.

Career Ops shows open applications without an analysis summary as **Pending
analysis**, plus persisted run states and artifact references. This is a view of
existing records, not an automatic queue. Select an application to run any of the
five existing workflows. Results stay versioned; archived application history is
retained, while the task dashboard lists current applications. Local file references
are shown as references; only validated provider result files have download links.

Additional read-only endpoints:

- `GET /api/workspace/summary`: discovery counts/status and latest application events.
- `GET /api/workspace/career-ops`: application workflow metadata, saved runs, latest 30 artifacts.
- `GET /api/workspace/integrations`: database, import-endpoint and alert-export health.
  `?refresh=true` explicitly rechecks the export.

Discovery summary checks and provider connection checks are cached for 30 seconds.
Settings tests bypass those caches. There is no background integration polling;
workflow status refreshes only while a known run is running. The application list
updates individual records after stage saves. Requests have bounded timeouts.
EasySeek health describes endpoint configuration, **not proof that a browser
extension is installed or currently connected**. Set the actual workspace API URL
shown in Settings in EasySeek's optional Career Workspace settings. Configure exact
extension origins in Settings → Allowed extension origins.

Discover does not expose “Run alerts now”: no safe execution interface is part of
this adapter. Run the independent job-alert workflow, then use **Refresh export**.
Missing/stale exports and unavailable analysis providers leave tracking usable.

Verification: `npm run check` runs backend tests, type checks and production builds;
`npm run test:browser` exercises navigation, filtering, detail actions, provider
results and responsive layouts. `npm run format:check` checks formatting. There is
no separate lint command. No new migration is required for these read-only views.

## First-run Setup Wizard

Start with `npm ci` and `npm run dev`, then use **Start setup** on the first-run
banner or visit `/setup`. Tracking is not locked behind setup; optional repositories
can be connected later. Settings always provides **Open Setup Wizard**.

1. **Local workspace:** confirm the SQLite path and click **Verify read/write
   permissions**. Startup creates the database and applies existing Drizzle migrations.
   The check writes/reads/removes its own temporary file and rolls back a metadata
   probe, leaving applications and history untouched. The displayed directory is
   SQLite's directory. Existing provider artifacts remain under the workspace's
   `data/applications/`; changing SQLite's path does not relocate artifacts or data.
2. **EasySeek:** verify the sibling path (default `../EasySeek`). In Chrome, enter
   `chrome://extensions`, enable Developer mode, choose Load unpacked and select that
   repository. The wizard can copy the address; websites cannot reliably open Chrome's
   internal page and there is no silent installation. Enable Career Workspace in the
   extension, copy the configured endpoint, and use its Test connection. The workspace
   defaults to port 3001; EasySeek's own default may be 8765, so use the displayed value.
   Enter an exact `chrome-extension://<32-letter-extension-id>` origin if needed.
   Workspace connection tests prove API/database reachability, not browser installation.
3. **Job Alerts / Gmail:** run the health check to inspect the repository, query config,
   CSV export, generated review queue and latest recorded run date. The producer has
   no exact run-time ledger; unknown timestamps are not fabricated. **Run daily workflow
   now** opens an explicit handoff: open `../job-alert-workflow` in a Codex session with
   Gmail connected through its existing app/plugin UI and use `Run daily job alert
workflow.` The sibling's README and daily skill own authentication, ingestion,
   retention, exports and its Git steps. This button does **not** secretly launch or
   claim completion of a headless workflow. Return and rerun checks afterward.
4. **Career Ops:** verify `../career-ops`, PORTABILITY.md, candidate prerequisite files
   and local workflow availability. **Test Career Ops** executes only the sibling's
   existing `node doctor.mjs --json` using Node with fixed arguments, no shell, a timeout
   and bounded output. Data-root environment/marker resolution stays with career-ops.
   Doctor may initialize missing personalization templates; existing files are not
   replaced. The UI shows readiness, known missing filenames and warning counts, not
   CV/profile contents or raw plugin/credential diagnostics. Resolve onboarding and
   warnings within career-ops, then test again. Workflow availability also checks the
   existing native CLI/login; no model generation occurs during setup.
5. **Final verification:** rerun checks, review optional missing pieces separately,
   then **Mark setup complete**. SQLite read/write readiness is mandatory. EasySeek,
   Job Alerts, Review Queue and Career Ops are optional. Completion records a timestamp;
   it does not imply Gmail authentication or that every optional module is connected.

### Local settings and reset

The wizard and Settings share the same form and API. **Save configuration** writes
`.workspace-local.json` atomically; this file is Git-ignored and contains only local
paths, ports, the HTTP localhost endpoint, explicit extension origins, freshness and
timeout limits, and setup state.
No Gmail tokens, GitHub credentials, OpenAI keys or browser cookies are accepted.
Each module keeps its own credential storage. Do not paste credentials into paths.

Restart both servers after saving changes (`Ctrl+C`, then `npm run dev`). Pending
changes are clearly marked; checks keep using the active configuration until restart.
Changing the endpoint changes the backend port after restart and updates Vite's proxy;
then update the endpoint in EasySeek too. The API remains bound to 127.0.0.1.
Changing the database path selects/initializes a database there; the original database
and artifact files remain intact. No automatic data migration or deletion takes place.
Changed configuration clears the completion marker. **Reset setup state only** clears
that marker and leaves all configuration, records and artifacts intact.

Precedence: explicitly supplied process environment → saved local configuration →
`.env` defaults → built-in sibling defaults. Process-controlled fields are disabled
with an explanation in Settings; remove the process override to edit them in the UI.
Paths are relative to the workspace repository root, never the current shell directory.
`WORKSPACE_CONFIG_PATH` optionally selects another local settings file; automated browser
tests use this to avoid touching personal configuration. Never commit that file.

### Setup troubleshooting

- **Database unavailable:** Setup and Settings remain accessible if SQLite cannot open.
  Choose a writable SQLite file path, save, restart, and check again. Preserve existing
  files; do not delete the database to fix permissions. Invalid ports/environment values
  must be corrected in the shell or .env if they prevent startup before the API binds.
- **Permission check fails:** verify the displayed database directory and filesystem
  permissions. The repository must also permit writing the local settings file.
- **EasySeek test fails:** check both tools use the same localhost port, enable the
  optional handoff, and configure the actual extension origin. A found repository does
  not prove the extension is installed. EasySeek marking continues when the API is offline.
- **Gmail unavailable:** connect Gmail in the sibling's Codex session via its external
  authentication UI. The workspace cannot inherit or bypass a desktop-session connector.
- **Missing/stale queue:** finish the sibling daily workflow and rerun health checks.
  A CSV alone does not prove the review-queue JSON is present or fresh.
- **Career Ops incomplete:** follow its PORTABILITY.md and doctor output locally. Keep
  credentials in its existing tooling. CLI connection and doctor readiness are separate;
  a healthy profile alone does not prove model access.
- **Settings file invalid:** repair its JSON/allowed path fields locally; the API refuses
  to overwrite malformed configuration silently. No credential fields are allowed.
- **Save seems ineffective:** restart both servers and check for explicit process
  overrides. Final verification cannot complete while saved changes await restart.

Setup API: `GET /api/setup/state`; JSON-only POSTs to `/api/setup/settings`,
`/api/setup/check`, `/api/setup/complete`, `/api/setup/reset`,
`/api/setup/career-ops/test`, and `/api/setup/job-alerts/daily`. All are restricted to
loopback hosts and same-workspace origins. Unknown keys and remote endpoints are rejected.
No new database migration is needed. `tests/setup.test.ts` exercises an empty temporary
configuration/database, restart persistence, reset retention, unavailable storage,
credential/origin rejection and sanitized doctor results. `tests/setup.spec.ts` verifies
the browser wizard, external handoff, persistence, completion, reset and narrow layouts.

### Career Ops read-only execution on Windows

The provider ignores general user CLI configuration to keep each invocation predictable.
On Windows it explicitly selects `windows.sandbox="elevated"`, the native Windows
sandbox implementation, while retaining `--sandbox read-only` and approval `never`.
This does not give the model unrestricted administrator access or write access to
candidate files. Existing execution-policy rules remain in effect. Windows sandbox
setup must already be available through the installed Codex CLI; the adapter does
not disable protection or silently switch to an unrestricted mode on failure.

If a run reports that execution policy blocked source reading, it has not produced
a fit analysis. Its `needs_input` record remains visible; retry creates a new run.
The connection test checks installation/login prerequisites, not a full model run.
After updating this adapter, restart the workspace and retry Analyze Fit. No credential
changes or copying private candidate files into chat are needed.

Career Ops receives the saved JD as a **snapshot evaluation**, with the original URL
as attribution. Reports must distinguish fit against that text from current hiring
status (unverified without reliable evidence). Missing candidate evidence stays unknown;
explicit workflow confirmation gates and known closed-posting evidence still apply.
A snapshot evaluation is not a claim that the employer is currently accepting applications.

Launcher GUI regression check (Windows, isolated configuration and ports):

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File tests/launcher-gui.ps1
```

This clicks the actual WinForms Start/Stop buttons for two cycles, uses temporary
configuration/database and free ports, verifies the frontend API proxy, and checks
for GUI errors. It does not open browser tabs or modify personal settings. The GUI
uses one asynchronous reader per output stream and a thread-safe message queue;
its timer cannot re-enter while opening the browser or processing status updates.
