export const discoverFits = [
  'HIGH',
  'MEDIUM',
  'LOW',
  'SKIP',
  'UNASSESSED',
] as const;
export type DiscoverFit = (typeof discoverFits)[number];
export interface DiscoverJob {
  canonical_key: string;
  source: string;
  title: string | null;
  company: string | null;
  location: string | null;
  fit: DiscoverFit;
  reason: string;
  first_seen_at: string;
  last_seen_at: string;
  url: string | null;
}
export interface DiscoverData {
  status: 'ready' | 'stale';
  timezone: string;
  today: string;
  last_run_date: string;
  last_run_at: null;
  export_modified_at: string;
  data_updated_at: string;
  stale_after_hours: number;
  current_job_count: number;
  today_new_count: number;
  jobs: DiscoverJob[];
  warnings: string[];
}
export interface DiscoverFailure {
  status: 'missing' | 'invalid' | 'unavailable';
  error: string;
  hint: string;
}
