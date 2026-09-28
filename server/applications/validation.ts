import { z } from 'zod';
import {
  applicationSources,
  applicationStages,
  artifactTypes,
} from '../../shared/tracker.js';

const text = z.string().trim().min(1).max(1000);
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const fields = {
  source: z.enum(applicationSources),
  source_job_id: text.nullable().optional(),
  canonical_key: text.nullable().optional(),
  title: text,
  company: text,
  location: text.nullable().optional(),
  url: z
    .url({ protocol: /^https?$/ })
    .max(8000)
    .nullable()
    .optional(),
  applied_at: timestamp.nullable().optional(),
  jd_markdown: z.string().max(500000).nullable().optional(),
  jd_saved_at: timestamp.nullable().optional(),
  fit_level: text.nullable().optional(),
  fit_score: z.number().min(0).max(100).nullable().optional(),
  analysis_summary: z.string().max(50000).nullable().optional(),
  next_action: z.string().max(5000).nullable().optional(),
  next_action_at: timestamp.nullable().optional(),
  notes: z.string().max(100000).nullable().optional(),
};
export const createApplicationInput = z.strictObject({
  ...fields,
  stage: z.enum(applicationStages).default('SAVED'),
});
export const updateApplicationInput = z
  .strictObject(fields)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field',
  );
export const transitionInput = z.strictObject({
  stage: z.enum(applicationStages),
  note: z.string().max(10000).nullable().optional(),
});
export const artifactInput = z.strictObject({
  type: z.enum(artifactTypes),
  path: z.string().trim().min(1).max(8000),
});
export const applicationId = z.uuid();
const includeDeleted = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');
export const detailQuery = z.strictObject({ include_deleted: includeDeleted });
export const listQuery = z.strictObject({
  include_deleted: includeDeleted,
  stage: z.enum(applicationStages).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListOptions = z.output<typeof listQuery>;

// Browser handoff uses camelCase; null/omitted optional fields never clear data.
export const importApplicationInput = z
  .strictObject({
    source: z.enum(applicationSources),
    sourceJobId: text.nullable().optional(),
    canonicalKey: text.nullable().optional(),
    title: text,
    company: text,
    location: text.nullable().optional(),
    url: fields.url,
    jdMarkdown: z.string().max(500000).nullable().optional(),
    mark: z.enum(['NONE', 'SKIP', 'SAVED', 'APPLIED']).optional(),
    requestedStage: z.enum(['SAVED', 'APPLIED']),
  })
  .superRefine((data, ctx) => {
    if (
      data.mark === 'SKIP' ||
      (data.mark === 'APPLIED' && data.requestedStage !== 'APPLIED')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['mark'],
        message: 'Mark conflicts with an active handoff',
      });
    const key = data.canonicalKey?.match(/^(seek|linkedin|other):([^:]+)$/);
    if (
      key &&
      (key[1] !== data.source ||
        (data.sourceJobId && key[2] !== data.sourceJobId))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['canonicalKey'],
        message: 'Canonical identity conflicts with source ID',
      });
    const id =
      data.sourceJobId || (key?.[1] === data.source ? key[2] : undefined);
    if (!id || (data.source !== 'other' && !/^[1-9][0-9]*$/.test(id)))
      ctx.addIssue({
        code: 'custom',
        path: ['sourceJobId'],
        message:
          'Provide a strong source job ID or source:id canonical key (numeric for SEEK/LinkedIn)',
      });
  });
