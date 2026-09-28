import { randomUUID } from 'node:crypto';
import { ApplicationRepository } from './repository.js';
import {
  applicationId,
  artifactInput,
  createApplicationInput,
  detailQuery,
  listQuery,
  transitionInput,
  updateApplicationInput,
} from './validation.js';

export class ApplicationNotFound extends Error {
  readonly statusCode = 404;
  constructor() {
    super('Application not found');
  }
}

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly now = () => new Date().toISOString(),
  ) {}

  private require(
    repository: ApplicationRepository,
    id: string,
    includeDeleted = false,
  ) {
    const application = repository.get(id);
    if (!application || (application.deleted_at && !includeDeleted))
      throw new ApplicationNotFound();
    return application;
  }
  create(input: unknown) {
    const data = createApplicationInput.parse(input);
    return this.repository.transaction((repository) => {
      const now = this.now();
      const application = repository.insert({
        ...data,
        id: randomUUID(),
        canonical_key:
          data.canonical_key === undefined
            ? data.source_job_id
              ? data.source + ':' + data.source_job_id
              : null
            : data.canonical_key,
        applied_at: data.applied_at ?? (data.stage === 'APPLIED' ? now : null),
        jd_saved_at:
          data.jd_saved_at !== undefined
            ? data.jd_saved_at
            : data.jd_markdown
              ? now
              : null,
        created_at: now,
        updated_at: now,
      });
      repository.appendEvent({
        application_id: application.id,
        event_type: 'CREATED',
        stage: application.stage,
        event_at: now,
        note: null,
      });
      return application;
    });
  }
  get(id: string, query: unknown = {}) {
    applicationId.parse(id);
    return this.require(
      this.repository,
      id,
      detailQuery.parse(query).include_deleted,
    );
  }
  list(query: unknown = {}) {
    return this.repository.list(listQuery.parse(query));
  }
  update(id: string, input: unknown) {
    applicationId.parse(id);
    const data = updateApplicationInput.parse(input);
    return this.repository.transaction((repository) => {
      this.require(repository, id);
      const now = this.now();
      return repository.update(id, {
        ...data,
        ...(data.jd_markdown !== undefined && data.jd_saved_at === undefined
          ? { jd_saved_at: data.jd_markdown ? now : null }
          : {}),
        updated_at: now,
      })!;
    });
  }
  transition(id: string, input: unknown) {
    applicationId.parse(id);
    const data = transitionInput.parse(input);
    return this.repository.transaction((repository) => {
      const current = this.require(repository, id);
      if (current.stage === data.stage) return current;
      const now = this.now();
      const updated = repository.update(id, {
        stage: data.stage,
        updated_at: now,
        applied_at:
          current.applied_at ?? (data.stage === 'APPLIED' ? now : null),
      })!;
      repository.appendEvent({
        application_id: id,
        event_type: 'STAGE_CHANGED',
        stage: data.stage,
        event_at: now,
        note: data.note ?? null,
      });
      return updated;
    });
  }
  archive(id: string) {
    applicationId.parse(id);
    return this.repository.transaction((repository) => {
      const current = this.require(repository, id, true);
      if (current.deleted_at) return;
      const now = this.now();
      repository.update(id, { deleted_at: now, updated_at: now });
      repository.appendEvent({
        application_id: id,
        event_type: 'ARCHIVED',
        stage: current.stage,
        event_at: now,
        note: null,
      });
    });
  }
  events(id: string) {
    applicationId.parse(id);
    this.require(this.repository, id, true);
    return this.repository.events(id);
  }
  artifacts(id: string) {
    applicationId.parse(id);
    this.require(this.repository, id, true);
    return this.repository.artifacts(id);
  }
  addArtifact(id: string, input: unknown) {
    applicationId.parse(id);
    const data = artifactInput.parse(input);
    return this.repository.transaction((repository) => {
      const current = this.require(repository, id);
      const now = this.now();
      const artifact = repository.addArtifact({
        ...data,
        id: randomUUID(),
        application_id: id,
        created_at: now,
      });
      repository.update(id, { updated_at: now });
      repository.appendEvent({
        application_id: id,
        event_type: 'ARTIFACT_ADDED',
        stage: current.stage,
        event_at: now,
        note: data.type,
      });
      return artifact;
    });
  }
}
