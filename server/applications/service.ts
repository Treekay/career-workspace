import { randomUUID } from 'node:crypto';
import { ApplicationRepository } from './repository.js';
import {
  importApplicationInput,
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

export class ImportConflict extends Error {
  readonly statusCode = 409;
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
      return repository.get(application.id)!;
    });
  }
  import(input: unknown) {
    const data = importApplicationInput.parse(input);
    const sourceId =
      data.sourceJobId || data.canonicalKey!.slice(data.source.length + 1);
    return this.repository.transaction((repository) => {
      const candidates = repository.findImportIdentity(data.source, sourceId);
      if (candidates.length > 1)
        throw new ImportConflict(
          'Multiple applications match this identity; resolve duplicates manually',
        );
      const current = candidates[0];
      if (current?.deleted_at)
        throw new ImportConflict(
          'Matching application is archived; import cannot restore it',
        );
      if (current?.source_job_id && current.source_job_id !== sourceId)
        throw new ImportConflict(
          'Stored source ID conflicts with canonical identity',
        );
      const storedKey = current?.canonical_key?.match(
        /^(seek|linkedin|other):([^:]+)$/,
      );
      if (
        storedKey &&
        (storedKey[1] !== data.source || storedKey[2] !== sourceId)
      )
        throw new ImportConflict(
          'Stored canonical identity conflicts with source ID',
        );
      const now = this.now();
      if (!current) {
        const application = repository.insert({
          id: randomUUID(),
          source: data.source,
          source_job_id: sourceId,
          canonical_key: data.canonicalKey || data.source + ':' + sourceId,
          title: data.title,
          company: data.company,
          location: data.location,
          url: data.url,
          stage: data.requestedStage,
          applied_at: data.requestedStage === 'APPLIED' ? now : null,
          jd_markdown: data.jdMarkdown?.trim() ? data.jdMarkdown : null,
          jd_saved_at: data.jdMarkdown?.trim() ? now : null,
          created_at: now,
          updated_at: now,
        });
        repository.appendEvent({
          application_id: application.id,
          event_type: 'CREATED',
          stage: application.stage,
          event_at: now,
          note: 'Browser import',
        });
        return {
          outcome: 'created' as const,
          application: repository.get(application.id)!,
        };
      }
      const patch: Parameters<ApplicationRepository['update']>[1] = {};
      for (const [key, value] of Object.entries({
        title: data.title,
        company: data.company,
        location: data.location,
        url: data.url,
      })) {
        if (
          value != null &&
          current[key as 'title' | 'company' | 'location' | 'url'] !== value
        )
          Object.assign(patch, { [key]: value });
      }
      if (!current.source_job_id) patch.source_job_id = sourceId;
      if (!current.canonical_key)
        patch.canonical_key = data.canonicalKey || data.source + ':' + sourceId;
      if (data.jdMarkdown?.trim() && current.jd_markdown !== data.jdMarkdown) {
        patch.jd_markdown = data.jdMarkdown;
        patch.jd_saved_at = now;
      }
      const hasApplied = repository
        .events(current.id)
        .some(
          (e) =>
            e.stage === 'APPLIED' &&
            ['CREATED', 'STAGE_CHANGED', 'IMPORTED'].includes(e.event_type),
        );
      const advance =
        data.requestedStage === 'APPLIED' &&
        ['SAVED', 'PREPARING'].includes(current.stage) &&
        !hasApplied;
      const recordApplied = data.requestedStage === 'APPLIED' && !hasApplied;
      if (advance) patch.stage = 'APPLIED';
      if (data.requestedStage === 'APPLIED' && !current.applied_at)
        patch.applied_at = now;
      const metadataChanged = Object.keys(patch).some((key) => key !== 'stage');
      if (!Object.keys(patch).length && !recordApplied)
        return {
          outcome: 'unchanged' as const,
          application: repository.get(current.id)!,
        };
      repository.update(current.id, { ...patch, updated_at: now });
      if (advance)
        repository.appendEvent({
          application_id: current.id,
          event_type: 'STAGE_CHANGED',
          stage: 'APPLIED',
          event_at: now,
          note: 'Browser import: applied',
        });
      if (metadataChanged || (recordApplied && !advance))
        repository.appendEvent({
          application_id: current.id,
          event_type: 'IMPORTED',
          stage:
            recordApplied && !advance
              ? 'APPLIED'
              : patch.stage || current.stage,
          event_at: now,
          note:
            recordApplied && !advance
              ? 'Browser reports APPLIED; current stage preserved. Original application time unknown.'
              : 'Browser import updated job metadata or JD snapshot',
        });
      return {
        outcome: 'updated' as const,
        application: repository.get(current.id)!,
      };
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
      return repository.get(id)!;
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
  saveCareerOpsResult(
    id: string,
    input: {
      type: 'ANALYSIS' | 'CV' | 'COVER_LETTER' | 'INTERVIEW_NOTES';
      path: string;
      analysis?: {
        summary: string;
        level: string | null;
        score: number | null;
      };
      expected: {
        jd_markdown: string | null;
        stage: string;
        analysis_summary: string | null;
        fit_level: string | null;
        fit_score: number | null;
      };
    },
  ) {
    applicationId.parse(id);
    const artifactData = artifactInput.parse({
      type: input.type,
      path: input.path,
    });
    return this.repository.transaction((repository) => {
      const current = this.require(repository, id);
      const now = this.now();
      const artifact = repository.addArtifact({
        ...artifactData,
        id: randomUUID(),
        application_id: id,
        created_at: now,
      });
      const unchanged = Object.entries(input.expected).every(
        ([key, value]) => current[key as keyof typeof input.expected] === value,
      );
      const update =
        input.analysis && unchanged
          ? updateApplicationInput.parse({
              analysis_summary: input.analysis.summary,
              ...(input.analysis.level !== null
                ? { fit_level: input.analysis.level }
                : {}),
              ...(input.analysis.score !== null
                ? { fit_score: input.analysis.score }
                : {}),
            })
          : {};
      repository.update(id, { ...update, updated_at: now });
      repository.appendEvent({
        application_id: id,
        event_type: 'ARTIFACT_ADDED',
        stage: current.stage,
        event_at: now,
        note: 'Career Ops: ' + input.type,
      });
      return {
        artifact,
        analysisUpdated: Boolean(input.analysis && unchanged),
      };
    });
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
