# Local configuration audit

Audited 2026-09-29: runtime/local configuration, Setup APIs and UI, SQLite startup,
tracker/import/history APIs, Overview/Analytics, Discover adapter, EasySeek settings
and permissions, job-alert config/daily workflow, and Career Ops PORTABILITY/CLI adapter.
No accounts were connected, credentials changed, model generation requested, or
real application records inserted during this audit.

## Configuration ownership

**Required** means needed for the indicated feature, not necessarily a value you must
enter: defaults already satisfy most requirements. **Optional** integrations never
block tracking. **Detected** means observable locally; it does not imply authorization.
**External** means the user must authorize/configure it in the owning tool.

### Workspace values: one editor in Settings and Setup

All eleven values below share the validated `.workspace-local.json` store. Save once,
then restart both servers. Relative paths resolve from career-workspace unless noted.

| Value / local key                              | Classification and default                          | Detection / action                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite database path / `databasePath`          | Required; `./data/workspace.db`                     | Parent/data directory derived; initialized and migrated at startup. Explicit readiness check verifies read/write. Changing it selects a database, never moves existing records. |
| Local API endpoint / `endpoint`                | Required; `http://localhost:3001`                   | Port drives Fastify and Vite proxy; host remains loopback. Must differ from web port. Copy active endpoint into EasySeek.                                                       |
| Web port / `webPort`                           | Required; `5173`                                    | Default works unless occupied; strict startup failure on conflict.                                                                                                              |
| EasySeek repository / `easySeekPath`           | Optional module; `../EasySeek`                      | Repository/manifest detected. Installation and enabled state are not detectable from the workspace.                                                                             |
| Extension origins / `extensionOrigins`         | Required only for browser imports; empty by default | User copies actual extension origin from EasySeek/Chrome. Exact allowlist; no wildcard, no guessing ID. Not a credential.                                                       |
| Job Alerts repository / `jobAlertsPath`        | Optional module; `../job-alert-workflow`            | Config, CSV, review queue and recorded run date detected.                                                                                                                       |
| Discover freshness / `discoverStaleHours`      | Optional tuning; `36` hours                         | Positive hours (UI 0.01–87600); stale exports flagged, no workflow launched.                                                                                                    |
| Career Ops repository / `careerOpsPath`        | Optional module; `../career-ops`                    | PORTABILITY, workflow files and candidate prerequisites inspected for presence.                                                                                                 |
| Career Ops data root / `careerOpsDataPath`     | Optional override; blank                            | Blank uses sibling `.career-ops-data` marker, then repository root. Relative override resolves from Career Ops repository. No profiles copied.                                  |
| Career Ops executable / `careerOpsCli`         | Required for optional provider; `codex`             | Native CLI auto-detected; absolute native executable path can override. Windows shell shims/command strings rejected.                                                           |
| Career Ops timeout / `careerOpsTimeoutSeconds` | Optional tuning; `600` seconds                      | Integer 10–1800; no model/provider implementation configured here.                                                                                                              |

Setup `completedAt` is generated state, not a connection setting. Complete/reset only
changes that marker; configuration changes clear it. Reset never deletes data.
Provider artifacts are fixed at `data/applications/<application-id>/career-ops/<run-id>`;
DB-path changes do not relocate artifacts. Schema version and event history are database
state, not user configuration. Overview, Applications, details and Analytics require
no further settings. Filters/sort/range are view state, not installation configuration.

### Compatibility and bootstrap

Routine `.env` editing is **deprecated**. The old duplicate Settings diagnostics/config
panels were removed; connection diagnostics sit beside the single form. Saving captures
all current effective settings, including legacy defaults. Existing `.env` files are
not rewritten or deleted, and arbitrary environment values are never copied.

Precedence: explicit process environment → saved local values → legacy `.env` → defaults.
Settings lists legacy variable sources and disables process-controlled fields. Stop the
servers, remove the launching process override, and restart to edit those fields there.

| Legacy variable                                | Canonical Settings value                                |
| ---------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_PATH`                                | SQLite database path                                    |
| `API_PORT`                                     | Workspace localhost endpoint port                       |
| `WEB_PORT`                                     | Workspace web port                                      |
| `EASYSEEK_PATH`                                | EasySeek repository path                                |
| `IMPORT_EXTENSION_ORIGINS`                     | Allowed extension origins                               |
| `JOB_ALERT_WORKFLOW_PATH`                      | Job Alerts repository path                              |
| `DISCOVER_STALE_HOURS`                         | Discover freshness window                               |
| `CAREER_OPS_PATH`                              | Career Ops repository path                              |
| `CAREER_OPS_CODEX_PATH`                        | Career Ops CLI executable                               |
| `CAREER_OPS_TIMEOUT_SECONDS`                   | Career Ops timeout                                      |
| `CAREER_OPS_ROOT`, alias `CAREER_OPS_DATA_DIR` | Career Ops data root (ROOT takes priority when present) |

`WORKSPACE_CONFIG_PATH` is an optional bootstrap selector for an isolated local settings
file; default `.workspace-local.json`. It remains outside its own form so recovery and
tests can select a file before reading configuration. Node/npm, OS PATH/native executable
installation, and test-only `PLAYWRIGHT_CHANNEL` are tooling prerequisites, not app settings.
Keep these files private and Git-ignored. Never put tokens in path/endpoint fields.

### EasySeek: browser-owned settings and consent

| Value                                                   | Classification                                                        | Owner / action                                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unpacked repository path                                | Detected default; external install if desired                         | Chrome → extensions → Developer mode → Load unpacked → detected EasySeek folder. No silent installation.                                                                                                            |
| Extension ID / exact origin                             | Browser-generated; required for handoff                               | Copy displayed `chrome-extension://…` into workspace Settings. Re-check after changing installation/profile.                                                                                                        |
| `careerWorkspace.enabled`                               | Optional; false default; external opt-in                              | Enable in EasySeek Memory → Career Workspace. Workspace cannot silently change browser storage.                                                                                                                     |
| `careerWorkspace.url`                                   | Required for enabled handoff; bundled default `http://localhost:8765` | Copy the workspace's active endpoint, normally `http://localhost:3001`. Browser must retain its destination for offline independent operation. This is a consumer copy, not another workspace server configuration. |
| Localhost host permission                               | External browser consent                                              | Granted by Chrome when saving/testing; never pre-authorized by setup.                                                                                                                                               |
| `hideSkipped`, `hideApplied`, `hideSaved`, `hideViewed` | Optional browsing preferences                                         | Keep in EasySeek; not workspace machine configuration.                                                                                                                                                              |
| Retention `viewedDays`, `skipDays`, `savedDays`         | Optional browser-memory policy                                        | Keep in EasySeek (30/60/90/180/Never choices). Does not affect durable workspace history.                                                                                                                           |

EasySeek Test connection proves `/api/health` reachability, **not import authorization**.
After explicit configuration, marking a real job Saved/Applied verifies the handoff.
Offline/failing imports preserve the browser mark. Neither credentials nor browser cookies
are shared. No tracker UI or ingestion logic is copied into the extension/workspace.

### Job Alerts / Gmail: independent workflow policy

These existing `job-ops/config.json` values are policy owned by job-alert-workflow, not
machine-specific adapter configuration; they remain there without a second editable copy.

| Value                                  | Classification / current policy at audit                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `timezone`                             | Required workflow context; `Pacific/Auckland`                                                    |
| `job_retention_days`                   | Required retention policy; `30`                                                                  |
| `mail_lookback_days`                   | Required ingestion window; `2`                                                                   |
| `gmail_queries.seek`                   | Source search policy; `newer_than:2d {from:(seek.co.nz) from:(seek.com)}`                        |
| `gmail_queries.linkedin`               | Source search policy; `newer_than:2d from:(linkedin.com)`                                        |
| `sources`                              | Enabled source policy; SEEK and LINKEDIN                                                         |
| `daily_analysis_limit`                 | Optional workflow cap; `100`                                                                     |
| `deep_review_batch_size`               | Optional workflow batch size; `20`                                                               |
| `exports.csv`                          | Producer output contract; `job-ops/exports/jobs.csv`                                             |
| Gmail connector authorization          | External, required only for fresh ingestion; status unknown to workspace                         |
| Git identity/remote/push authorization | External, only for producer's documented Git steps; not required for reading its existing export |

The workspace detects config/output existence and validates the review queue. Source SQLite
`job-ops/data/jobs.db`, JSON `job-ops/exports/review-queue.json`, and review HTML are derived
producer paths. Configure the repository once; there is no second export path setting.
Recorded dates/file timestamps are evidence of outputs, not proof of Gmail authorization.
The daily button provides instructions to the existing Gmail-connected Codex session;
it does not start a fabricated authenticated CLI. Queries/retention still belong to the
sibling. Do not copy Gmail tokens or Git credentials to career-workspace.

### Career Ops: profile content and external provider

| Value                                                                  | Classification / ownership                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `.career-ops-data` marker                                              | Optional sibling data-root declaration, detected; leave workspace override blank to reuse it                              |
| `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`      | Candidate/onboarding prerequisites detected by filename; content managed by Career Ops, not displayed in Setup            |
| Profile targeting, language, model/spend policy, custom workflow rules | Module-owned content/policy; use Career Ops onboarding, not duplicated Settings fields                                    |
| Native Codex login and model entitlement                               | External, required only for analysis/draft actions; test is read-only, sign-in remains outside workspace                  |
| `CAREER_OPS_TRACKER`                                                   | Optional sibling-only tracker override; workspace does not use or synchronize that Markdown tracker                       |
| Gemini/OpenRouter keys and other optional plugin credentials           | Optional for other sibling modes, **not required by this workspace's native CLI adapter**; never configure/copy them here |

The explicit doctor button may initialize missing templates via the sibling's own doctor.
Connection tests inspect CLI readiness without generating content. Neither a doctor pass
nor a signed-in CLI guarantees a future model request will succeed. Career Ops is a local
integration with the CLI's existing model service, not an offline AI implementation.

## This machine: first real use

Read-only audit evidence: all three default sibling directories exist; workspace SQLite
quick_check returned `ok`; review queue was readable with 292 jobs, recorded latest run
2026-09-28 (not a verified completion timestamp). Native Codex was found but reported not
signed in. Browser installation/permissions and current Gmail authorization remain unknown.
No prior browser-import event was found. These observations are a snapshot, not a live status.

1. Start/restart `npm run dev`, open `http://127.0.0.1:5173/settings`. Default database,
   sibling paths, ports, freshness and timeout need no change on this machine. Rerun checks.
2. For EasySeek imports: install/reload `F:/code/EasySeek` in Chrome if needed. Copy its
   actual extension origin into Settings → Allowed extension origins; save and restart.
   In EasySeek enable Career Workspace, set `http://localhost:3001`, grant its localhost
   permission, save and test. Its bundled 8765 endpoint must match your selected workspace
   endpoint. Verify one intentional real Saved/Applied handoff; a health test alone is insufficient.
3. For fresh Discover results: open `F:/code/job-alert-workflow` in the existing Codex
   session, verify Gmail is connected there, then run `Run daily job alert workflow.`
   If authorization is missing, authorize it yourself through that tool's existing UI.
   Return to Settings and rerun checks. Reading the current export needs no Gmail connection.
4. For Career Ops actions: sign in to the detected native Codex CLI using its existing
   external login flow. No API key belongs in workspace Settings. Test connection, then
   explicitly run Test Career Ops and address any profile warnings inside the sibling.
5. Review readiness and mark setup complete. All integrations are optional; the local
   tracker is usable with SQLite alone. No credentials/accounts were altered by this audit.
