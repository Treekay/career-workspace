import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { z } from 'zod';
import type { WorkspaceConfig } from '../../config/runtime.js';
import {
  careerActions,
  type CareerAction,
  type CareerRun,
} from '../../shared/career-ops.js';
import { ApplicationService } from '../applications/service.js';
import { applicationId } from '../applications/validation.js';
import { connection, modes, workflowPrompt } from './provider.js';
import { runProcess, type Runner } from './process.js';
export const resultSchema = z
  .strictObject({
    status: z.enum(['completed', 'needs_input']),
    document_markdown: z.string().max(500000),
    summary: z.string().trim().min(1).max(50000),
    fit_level: z.string().max(1000).nullable(),
    fit_score: z.number().min(0).max(100).nullable(),
    fit_score_max: z.union([z.literal(5), z.literal(100)]).nullable(),
  })
  .refine(
    (r) => r.status !== 'completed' || Boolean(r.document_markdown.trim()),
    'Completed result must include a document',
  )
  .refine(
    (r) =>
      (r.fit_score === null && r.fit_score_max === null) ||
      (r.fit_score !== null &&
        r.fit_score_max !== null &&
        r.fit_score <= r.fit_score_max),
    'Score requires a valid explicit scale',
  );
const runSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  action: z.enum(careerActions),
  status: z.enum([
    'running',
    'completed',
    'failed',
    'needs_input',
    'interrupted',
  ]),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  message: z.string(),
  artifactPath: z.string().nullable(),
});
export class CareerError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}
export class CareerOpsService {
  private active = new Map<
    string,
    { controller: AbortController; work: Promise<void> }
  >();
  private starting = false;
  private closed = false;
  constructor(
    private config: WorkspaceConfig,
    private applications: ApplicationService,
    private runner: Runner = runProcess,
  ) {}
  connection() {
    return connection(this.config, this.runner);
  }
  private directory(appId: string, runId?: string, create = false) {
    applicationId.parse(appId);
    if (runId) applicationId.parse(runId);
    const segments = [
      'data',
      'applications',
      appId,
      'career-ops',
      ...(runId ? [runId] : []),
    ];
    const root = realpathSync(this.config.root);
    let target = root;
    for (const segment of segments) {
      target = join(target, segment);
      if (existsSync(target)) {
        const rel = relative(root, realpathSync(target));
        if (
          isAbsolute(rel) ||
          rel === '..' ||
          rel.startsWith('..\\') ||
          rel.startsWith('../')
        )
          throw new CareerError(
            'Application output path leaves workspace storage.',
            409,
          );
      } else if (create) mkdirSync(target);
    }
    return target;
  }
  private read(file: string, limit = 2 * 1024 * 1024) {
    const root = realpathSync(this.config.root);
    const rel = relative(root, realpathSync(file));
    if (
      isAbsolute(rel) ||
      rel === '..' ||
      rel.startsWith('..\\') ||
      rel.startsWith('../')
    )
      throw new CareerError('Provider output leaves workspace storage.', 409);
    if (!statSync(file).isFile() || statSync(file).size > limit)
      throw new CareerError('Provider output is too large or invalid.', 422);
    const handle = openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(limit + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = readSync(
          handle,
          buffer,
          count,
          buffer.length - count,
          count,
        );
        if (!read) break;
        count += read;
      }
      if (count > limit)
        throw new CareerError('Provider output is too large.', 422);
      return buffer.subarray(0, count).toString('utf8');
    } finally {
      closeSync(handle);
    }
  }
  private persist(run: CareerRun) {
    const dir = this.directory(run.applicationId, run.id);
    const temporary = join(dir, 'run-' + randomUUID() + '.tmp');
    writeFileSync(temporary, JSON.stringify(run), { flag: 'wx' });
    renameSync(temporary, join(dir, 'run.json'));
  }
  list(appId: string): CareerRun[] {
    this.applications.get(appId, { include_deleted: 'true' });
    const dir = this.directory(appId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((id) => z.uuid().safeParse(id).success)
      .map((id) => {
        try {
          const run = runSchema.parse(
            JSON.parse(
              this.read(join(this.directory(appId, id), 'run.json'), 100000),
            ),
          );
          if (run.applicationId !== appId || run.id !== id) return null;
          return run.status === 'running' && !this.active.has(id)
            ? {
                ...run,
                status: 'interrupted' as const,
                message:
                  'The workspace restarted before this run completed. Retry explicitly.',
              }
            : run;
        } catch {
          return null;
        }
      })
      .filter((run): run is CareerRun => run !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  document(appId: string, runId: string) {
    const run = this.list(appId).find((r) => r.id === runId);
    if (!run?.artifactPath)
      throw new CareerError('Result document not found.', 404);
    const dir = this.directory(appId, runId);
    const file = join(dir, 'result.md');
    if (realpathSync(file) !== join(realpathSync(dir), 'result.md'))
      throw new CareerError('Invalid artifact path.', 409);
    return this.read(file);
  }
  async start(appId: string, input: unknown): Promise<CareerRun> {
    const { action } = z
      .strictObject({ action: z.enum(careerActions) })
      .parse(input);
    if (this.closed || this.starting || this.active.size)
      throw new CareerError(
        'Career Ops is already running. Wait for completion before starting another action.',
        409,
      );
    this.starting = true;
    try {
      const info = await this.connection();
      if (info.status !== 'Connected') throw new CareerError(info.message, 503);
      const app = this.applications.get(appId);
      if (!app.jd_markdown?.trim())
        throw new CareerError(
          'Save a full JD snapshot before running Career Ops.',
          409,
        );
      if (this.closed)
        throw new CareerError('Workspace is shutting down.', 503);
      const run: CareerRun = {
        id: randomUUID(),
        applicationId: appId,
        action,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        message: 'Running career-ops ' + modes[action] + ' workflow.',
        artifactPath: null,
      };
      const dir = this.directory(appId, run.id, true);
      const context = {
        application: {
          id: app.id,
          source: app.source,
          source_job_id: app.source_job_id,
          canonical_key: app.canonical_key,
          title: app.title,
          company: app.company,
          location: app.location,
          url: app.url,
          stage: app.stage,
          applied_at: app.applied_at,
        },
        jd_markdown: app.jd_markdown,
        existing_analysis: {
          summary: app.analysis_summary,
          fit_level: app.fit_level,
          fit_score: app.fit_score,
          fit_score_max: 100,
        },
      };
      writeFileSync(
        join(dir, 'request.json'),
        JSON.stringify(context, null, 2),
        { flag: 'wx' },
      );
      const jsonSchema = {
        type: 'object',
        additionalProperties: false,
        required: [
          'status',
          'document_markdown',
          'summary',
          'fit_level',
          'fit_score',
          'fit_score_max',
        ],
        properties: {
          status: { type: 'string', enum: ['completed', 'needs_input'] },
          document_markdown: { type: 'string' },
          summary: { type: 'string' },
          fit_level: { type: ['string', 'null'] },
          fit_score: { type: ['number', 'null'] },
          fit_score_max: { type: ['number', 'null'], enum: [5, 100, null] },
        },
      };
      writeFileSync(join(dir, 'schema.json'), JSON.stringify(jsonSchema), {
        flag: 'wx',
      });
      this.persist(run);
      const controller = new AbortController();
      const work = (async () => {
        try {
          const output = join(dir, 'response.json');
          const result = await this.runner({
            bin: info.cliPath!,
            cwd: dir,
            timeout: this.config.careerOpsTimeoutSeconds * 1000,
            signal: controller.signal,
            args: [
              '--ask-for-approval',
              'never',
              '--search',
              'exec',
              '--sandbox',
              'read-only',
              '--ignore-user-config',
              '--ephemeral',
              '--skip-git-repo-check',
              '--output-schema',
              join(dir, 'schema.json'),
              '--output-last-message',
              output,
              '-',
            ],
            input: workflowPrompt(info, action, context),
          });
          if (controller.signal.aborted)
            throw new Error('Career Ops run was cancelled.');
          if (result.code !== 0)
            throw new Error(
              'Career Ops CLI failed. Check local CLI login, model access and sandbox setup, then retry. No result was imported.',
            );
          const parsed = resultSchema.safeParse(JSON.parse(this.read(output)));
          if (!parsed.success)
            throw new Error(
              'Career Ops returned an invalid result. No fields or artifacts were imported.',
            );
          const value = parsed.data;
          if (value.status === 'needs_input') {
            run.status = 'needs_input';
            run.message = value.summary;
            return;
          }
          const file = join(dir, 'result.md');
          writeFileSync(file, value.document_markdown, { flag: 'wx' });
          const type = {
            'analyze-fit': 'ANALYSIS',
            'tailor-cv': 'CV',
            'cover-letter': 'COVER_LETTER',
            'networking-plan': 'ANALYSIS',
            'interview-prep': 'INTERVIEW_NOTES',
          } as const;
          const saved = this.applications.saveCareerOpsResult(appId, {
            type: type[action],
            path: relative(this.config.root, file).replaceAll('\\', '/'),
            ...(action === 'analyze-fit'
              ? {
                  analysis: {
                    summary: value.summary,
                    level: value.fit_level,
                    score:
                      value.fit_score === null
                        ? null
                        : (value.fit_score / value.fit_score_max!) * 100,
                  },
                }
              : {}),
            expected: {
              jd_markdown: app.jd_markdown,
              stage: app.stage,
              analysis_summary: app.analysis_summary,
              fit_level: app.fit_level,
              fit_score: app.fit_score,
            },
          });
          run.status = 'completed';
          run.artifactPath = saved.artifact.path;
          run.message =
            action === 'analyze-fit' && !saved.analysisUpdated
              ? 'Draft saved. Application context changed during the run; current analysis fields were preserved.'
              : 'Draft saved as a new artifact. Review before using it.';
        } catch (error) {
          run.status = 'failed';
          run.message =
            error instanceof CareerError
              ? error.message
              : error instanceof SyntaxError
                ? 'Career Ops returned malformed JSON. No result was imported.'
                : error instanceof Error
                  ? error.message
                  : 'Career Ops failed.';
        } finally {
          run.finishedAt = new Date().toISOString();
          try {
            this.persist(run);
          } finally {
            this.active.delete(run.id);
          }
        }
      })();
      this.active.set(run.id, { controller, work });
      void work.catch(() => {
        /* An output-storage failure is visible as interrupted on the next read. */
      });
      return { ...run };
    } finally {
      this.starting = false;
    }
  }
  async close() {
    this.closed = true;
    for (const run of this.active.values()) run.controller.abort();
    await Promise.allSettled([...this.active.values()].map((run) => run.work));
  }
}
