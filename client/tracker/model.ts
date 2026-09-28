import { formatDate } from '../format';
import type { ApplicationStage } from '../../shared/tracker';
export interface Application {
  id: string;
  source: 'seek' | 'linkedin' | 'other';
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  stage: ApplicationStage;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  stage_entered_at: string;
  jd_markdown: string | null;
  jd_saved_at: string | null;
  fit_level: string | null;
  fit_score: number | null;
  analysis_summary: string | null;
  next_action: string | null;
  next_action_at: string | null;
  notes: string | null;
  deleted_at: string | null;
}
export interface ApplicationEvent {
  id: number;
  event_type: string;
  stage: ApplicationStage;
  event_at: string;
  note: string | null;
}
export interface Artifact {
  id: string;
  type: string;
  path: string;
  created_at: string;
}
export const labels: Record<ApplicationStage, string> = {
  SAVED: 'Saved',
  PREPARING: 'Preparing',
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFERED: 'Offered',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};
export const colors: Record<ApplicationStage, string> = {
  SAVED: '#91a59a',
  PREPARING: '#688b76',
  APPLIED: '#a4aab2',
  SCREENING: '#727e8b',
  INTERVIEW: '#32816a',
  OFFERED: '#286548',
  REJECTED: '#b85b60',
  WITHDRAWN: '#cea4a5',
};
export const closed = (a: Application) =>
  a.stage === 'REJECTED' || a.stage === 'WITHDRAWN';
export const waiting = (a: Application) =>
  a.stage === 'APPLIED' || a.stage === 'SCREENING';
export function matches(a: Application, filter: string) {
  return (
    filter === 'All' ||
    (filter === 'Closed'
      ? closed(a)
      : filter === 'Waiting'
        ? waiting(a)
        : !closed(a))
  );
}
export function daysInStage(a: Application, now = Date.now()) {
  return Math.max(
    0,
    Math.floor(
      (now - new Date(a.stage_entered_at || a.created_at).getTime()) / 86400000,
    ),
  );
}
export const date = (value: string | null) => formatDate(value);
export const dateTime = (value: string | null, timeZone?: string) =>
  formatDate(value, true, timeZone);
export function fit(a: Application) {
  return (
    [a.fit_level, a.fit_score === null ? null : a.fit_score + '/100']
      .filter(Boolean)
      .join(' · ') || 'Not assessed'
  );
}
