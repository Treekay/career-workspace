export const careerActions = [
  'analyze-fit',
  'tailor-cv',
  'cover-letter',
  'networking-plan',
  'interview-prep',
] as const;
export type CareerAction = (typeof careerActions)[number];
export const careerLabels: Record<CareerAction, string> = {
  'analyze-fit': 'Analyze Fit',
  'tailor-cv': 'Tailor CV',
  'cover-letter': 'Draft Cover Letter',
  'networking-plan': 'Networking Plan',
  'interview-prep': 'Interview Prep',
};
export interface CareerConnection {
  status: 'Connected' | 'Missing' | 'Invalid';
  configuredPath: string;
  path: string;
  dataPath: string;
  cliPath: string | null;
  message: string;
}
export interface CareerRun {
  id: string;
  applicationId: string;
  action: CareerAction;
  status: 'running' | 'completed' | 'failed' | 'needs_input' | 'interrupted';
  startedAt: string;
  finishedAt: string | null;
  message: string;
  artifactPath: string | null;
}
