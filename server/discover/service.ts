import { open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { z } from 'zod';
import type { WorkspaceConfig } from '../../config/runtime.js';
import {
  discoverFits,
  type DiscoverData,
  type DiscoverFailure,
  type DiscoverJob,
} from '../../shared/discover.js';

const MAX_BYTES = 10 * 1024 * 1024;
const timestamp = z.iso.datetime({ offset: true });
const zone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  });
const envelope = z.object({
  timezone: zone,
  generated_at: timestamp,
  run_date: z.iso.date(),
  current_scope_available: z.boolean(),
  job_retention_days: z.number().int().positive(),
  jobs: z.array(z.unknown()).max(50000),
});
const optionalText = z.string().max(10000).nullable();
const jobSchema = z.object({
  canonical_key: z.string().min(1).max(1000),
  source: z.string().min(1).max(100),
  title: optionalText,
  company: optionalText,
  location: optionalText,
  fit: z.enum(discoverFits),
  reason: z.string().max(20000),
  first_seen_at: timestamp,
  last_seen_at: timestamp,
  url: z.string().max(20000).nullable(),
});
export class DiscoverError extends Error {
  constructor(
    readonly status: DiscoverFailure['status'],
    message: string,
    readonly hint: string,
  ) {
    super(message);
  }
}
export function localDay(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return ['year', 'month', 'day']
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join('-');
}
function dayMinus(day: string, days: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
function safeUrl(raw: string | null, source: string) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !['80', '443'].includes(url.port))
    )
      return null;
    const domains =
      source === 'SEEK'
        ? ['seek.co.nz', 'seek.com', 'seek.com.au']
        : source === 'LINKEDIN'
          ? ['linkedin.com']
          : [];
    return domains.some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith('.' + domain),
    )
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeExport(
  input: unknown,
  modifiedAt: Date,
  staleHours: number,
  now = new Date(),
): DiscoverData {
  const parsed = envelope.safeParse(input);
  if (!parsed.success)
    throw new DiscoverError(
      'invalid',
      'The review queue has an unsupported or invalid format.',
      'Regenerate review-queue.json in job-alert-workflow. No files have been changed.',
    );
  const data = parsed.data;
  if (!data.current_scope_available)
    throw new DiscoverError(
      'invalid',
      'This export does not include the retained job queue.',
      'Generate a current-scope review queue in job-alert-workflow.',
    );
  const today = localDay(now, data.timezone);
  const cutoff = dayMinus(today, 29);
  const warnings: string[] = [];
  let invalid = 0,
    unsafe = 0;
  const seen = new Set<string>();
  const jobs: DiscoverJob[] = [];
  for (const value of data.jobs) {
    const parsedJob = jobSchema.safeParse(value);
    if (!parsedJob.success) {
      invalid++;
      continue;
    }
    const job = parsedJob.data;
    if (
      Date.parse(job.first_seen_at) > Date.parse(job.last_seen_at) ||
      Date.parse(job.first_seen_at) > now.getTime() + 300000 ||
      Date.parse(job.last_seen_at) > now.getTime() + 300000
    ) {
      invalid++;
      continue;
    }
    if (seen.has(job.canonical_key)) {
      invalid++;
      continue;
    }
    seen.add(job.canonical_key);
    const lastSeen = localDay(new Date(job.last_seen_at), data.timezone);
    if (lastSeen < cutoff || lastSeen > today) continue;
    const url = safeUrl(job.url, job.source);
    if (job.url && !url) unsafe++;
    jobs.push({
      ...job,
      url,
      reason: job.reason.replace(/\s+/g, ' ').trim().slice(0, 320),
    });
  }
  if (invalid)
    warnings.push(invalid + ' invalid or duplicate export rows were omitted.');
  if (unsafe)
    warnings.push(unsafe + ' unsupported source links were disabled.');
  if (data.job_retention_days < 30)
    warnings.push(
      'The source retains only ' +
        data.job_retention_days +
        ' days; a full 30-day history is unavailable.',
    );
  if (
    data.run_date > today ||
    Date.parse(data.generated_at) > now.getTime() + 300000 ||
    modifiedAt.getTime() > now.getTime() + 300000
  )
    throw new DiscoverError(
      'invalid',
      'The export has future-dated metadata.',
      'Check the producer clock and regenerate the export.',
    );
  // generated_at is a data watermark, not the generator execution time.
  const stale =
    now.getTime() - modifiedAt.getTime() > staleHours * 3600000 ||
    data.run_date <
      localDay(new Date(now.getTime() - staleHours * 3600000), data.timezone);
  return {
    status: stale ? 'stale' : 'ready',
    timezone: data.timezone,
    today,
    last_run_date: data.run_date,
    last_run_at: null,
    export_modified_at: modifiedAt.toISOString(),
    data_updated_at: data.generated_at,
    stale_after_hours: staleHours,
    current_job_count: jobs.length,
    today_new_count: jobs.filter(
      (j) => localDay(new Date(j.first_seen_at), data.timezone) === today,
    ).length,
    jobs,
    warnings,
  };
}
export async function readDiscover(config: WorkspaceConfig, now = new Date()) {
  const root = config.projects.find((p) => p.id === 'job-alert-workflow')!.path;
  try {
    const base = await realpath(root);
    const target = await realpath(
      join(base, 'job-ops', 'exports', 'review-queue.json'),
    );
    const rel = relative(base, target);
    if (
      rel === '..' ||
      rel.startsWith('..\\') ||
      rel.startsWith('../') ||
      isAbsolute(rel)
    )
      throw new DiscoverError(
        'invalid',
        'The export resolves outside the configured sibling project.',
        'Use an export within JOB_ALERT_WORKFLOW_PATH.',
      );
    const file = await open(target, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new DiscoverError(
          'invalid',
          'The export must be a regular JSON file no larger than 10 MiB.',
          'Check the generated review queue in job-alert-workflow.',
        );
      // Bounded read even if another process grows the file after stat().
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let total = 0;
      while (total < buffer.length) {
        const result = await file.read(
          buffer,
          total,
          buffer.length - total,
          total,
        );
        if (!result.bytesRead) break;
        total += result.bytesRead;
      }
      if (total > MAX_BYTES)
        throw new DiscoverError(
          'invalid',
          'The export exceeds the 10 MiB limit.',
          'Check the generated review queue in job-alert-workflow.',
        );
      let value: unknown;
      try {
        value = JSON.parse(
          buffer
            .subarray(0, total)
            .toString('utf8')
            .replace(/^\uFEFF/, ''),
        );
      } catch {
        throw new DiscoverError(
          'invalid',
          'The review queue is not valid JSON.',
          'The producer may be updating the export. Refresh after it finishes.',
        );
      }
      return normalizeExport(value, stat.mtime, config.discoverStaleHours, now);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof DiscoverError) throw error;
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    )
      throw new DiscoverError(
        'missing',
        'Review queue export not found.',
        'Check JOB_ALERT_WORKFLOW_PATH and generate job-ops/exports/review-queue.json in the sibling project.',
      );
    throw new DiscoverError(
      'unavailable',
      'The review queue could not be read.',
      'Check file permissions and refresh. The workspace does not run ingestion or write to the sibling project.',
    );
  }
}
