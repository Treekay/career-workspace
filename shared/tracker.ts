export const applicationStages = [
  'SAVED',
  'PREPARING',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFERED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export const applicationSources = ['seek', 'linkedin', 'other'] as const;
export const artifactTypes = [
  'JD',
  'CV',
  'COVER_LETTER',
  'ANALYSIS',
  'INTERVIEW_NOTES',
] as const;
export const applicationEventTypes = [
  'CREATED',
  'STAGE_CHANGED',
  'ARCHIVED',
  'ARTIFACT_ADDED',
  'IMPORTED',
] as const;
export type ApplicationStage = (typeof applicationStages)[number];
