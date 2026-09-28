import {
  or,
  and,
  asc,
  desc,
  eq,
  isNull,
  getTableColumns,
  sql,
} from 'drizzle-orm';
import type { openDatabase } from '../db/client.js';
import {
  applications,
  applicationEvents,
  artifacts,
  type NewApplication,
  type NewEvent,
  type NewArtifact,
} from '../db/schema.js';
import type { ListOptions } from './validation.js';

export type WorkspaceDatabase = ReturnType<typeof openDatabase>['db'];

// Only the service composes writes. A transaction-scoped repository keeps row
// mutations and corresponding history inserts on the same SQLite connection.
export class ApplicationRepository {
  constructor(private readonly db: Omit<WorkspaceDatabase, '$client'>) {}

  transaction<T>(work: (repository: ApplicationRepository) => T): T {
    return this.db.transaction((tx) => work(new ApplicationRepository(tx)), {
      behavior: 'immediate',
    });
  }
  get(id: string) {
    return this.db
      .select({
        ...getTableColumns(applications),
        stage_entered_at: sql<string>`coalesce((select event_at from application_events where application_id = applications.id and event_type in ('CREATED', 'STAGE_CHANGED') order by id desc limit 1), ${applications.created_at})`,
      })
      .from(applications)
      .where(eq(applications.id, id))
      .get();
  }
  list(options: ListOptions) {
    return this.db
      .select({
        ...getTableColumns(applications),
        stage_entered_at: sql<string>`coalesce((select event_at from application_events where application_id = applications.id and event_type in ('CREATED', 'STAGE_CHANGED') order by id desc limit 1), ${applications.created_at})`,
      })
      .from(applications)
      .where(
        and(
          options.include_deleted ? undefined : isNull(applications.deleted_at),
          options.stage ? eq(applications.stage, options.stage) : undefined,
        ),
      )
      .orderBy(desc(applications.created_at), asc(applications.id))
      .limit(options.limit)
      .offset(options.offset)
      .all();
  }
  findImportIdentity(source: 'seek' | 'linkedin' | 'other', sourceId: string) {
    // Include archives and duplicates: the caller must resolve conflicts, never pick arbitrarily.
    return this.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.source, source),
          or(
            eq(applications.source_job_id, sourceId),
            eq(applications.canonical_key, source + ':' + sourceId),
          ),
        ),
      )
      .all();
  }
  insert(value: NewApplication) {
    return this.db.insert(applications).values(value).returning().get();
  }
  update(
    id: string,
    value: Partial<Omit<NewApplication, 'id' | 'created_at'>>,
  ) {
    return this.db
      .update(applications)
      .set(value)
      .where(eq(applications.id, id))
      .returning()
      .get();
  }
  appendEvent(value: NewEvent) {
    return this.db.insert(applicationEvents).values(value).returning().get();
  }
  events(id: string) {
    return this.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.application_id, id))
      .orderBy(asc(applicationEvents.id))
      .all();
  }
  addArtifact(value: NewArtifact) {
    return this.db.insert(artifacts).values(value).returning().get();
  }
  artifacts(id: string) {
    return this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.application_id, id))
      .orderBy(asc(artifacts.created_at), asc(artifacts.id))
      .all();
  }
}
