import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import {
  applicationStages,
  applicationSources,
  applicationEventTypes,
  artifactTypes,
} from '../../shared/tracker.js';

export const workspaceMetadata = sqliteTable('workspace_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const applications = sqliteTable(
  'applications',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: applicationSources }).notNull(),
    source_job_id: text('source_job_id'),
    canonical_key: text('canonical_key'),
    title: text('title').notNull(),
    company: text('company').notNull(),
    location: text('location'),
    url: text('url'),
    stage: text('stage', { enum: applicationStages })
      .notNull()
      .default('SAVED'),
    applied_at: text('applied_at'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
    jd_markdown: text('jd_markdown'),
    jd_saved_at: text('jd_saved_at'),
    fit_level: text('fit_level'),
    fit_score: real('fit_score'),
    analysis_summary: text('analysis_summary'),
    next_action: text('next_action'),
    next_action_at: text('next_action_at'),
    notes: text('notes'),
    deleted_at: text('deleted_at'),
  },
  (table) => [
    index('applications_canonical_key_idx').on(table.canonical_key),
    index('applications_source_job_idx').on(table.source, table.source_job_id),
    index('applications_active_stage_idx').on(table.deleted_at, table.stage),
    index('applications_next_action_idx').on(table.next_action_at),
    check(
      'applications_source_check',
      sql`${table.source} IN ('seek', 'linkedin', 'other')`,
    ),
    check(
      'applications_stage_check',
      sql`${table.stage} IN ('SAVED', 'PREPARING', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN')`,
    ),
    check('applications_title_check', sql`length(trim(${table.title})) > 0`),
    check(
      'applications_company_check',
      sql`length(trim(${table.company})) > 0`,
    ),
    check(
      'applications_fit_score_check',
      sql`${table.fit_score} IS NULL OR ${table.fit_score} BETWEEN 0 AND 100`,
    ),
  ],
);

export const applicationEvents = sqliteTable(
  'application_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    application_id: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    event_type: text('event_type', { enum: applicationEventTypes }).notNull(),
    stage: text('stage', { enum: applicationStages }).notNull(),
    event_at: text('event_at').notNull(),
    note: text('note'),
  },
  (table) => [
    index('application_events_application_idx').on(
      table.application_id,
      table.id,
    ),
    check(
      'application_events_type_check',
      sql`${table.event_type} IN ('CREATED', 'STAGE_CHANGED', 'ARCHIVED', 'ARTIFACT_ADDED', 'IMPORTED')`,
    ),
    check(
      'application_events_stage_check',
      sql`${table.stage} IN ('SAVED', 'PREPARING', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN')`,
    ),
  ],
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    application_id: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    type: text('type', { enum: artifactTypes }).notNull(),
    path: text('path').notNull(),
    created_at: text('created_at').notNull(),
  },
  (table) => [
    index('artifacts_application_idx').on(table.application_id),
    check(
      'artifacts_type_check',
      sql`${table.type} IN ('JD', 'CV', 'COVER_LETTER', 'ANALYSIS', 'INTERVIEW_NOTES')`,
    ),
    check('artifacts_path_check', sql`length(trim(${table.path})) > 0`),
  ],
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type NewEvent = typeof applicationEvents.$inferInsert;
export type NewArtifact = typeof artifacts.$inferInsert;
