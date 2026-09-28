import type { ApplicationStage } from './tracker.js';
export interface AnalyticsApplication {
  id: string;
  company: string;
  title: string;
  stage: ApplicationStage;
  fit_score: number | null;
  deleted_at: string | null;
  applied_at: string | null;
}
export interface AnalyticsEvent {
  id: number;
  application_id: string;
  event_type: string;
  stage: ApplicationStage;
  event_at: string;
}
export interface ConversionMetric {
  label: string;
  numerator: number;
  denominator: number;
  rate: number | null;
}
export interface AnalyticsRow extends AnalyticsApplication {
  days: number | null;
  stage_since: string | null;
}
export interface ScatterPoint extends AnalyticsApplication {
  score: number;
  progression: number;
  progression_label: string;
}
export interface VolumeBucket {
  start: string;
  count: number;
}
export interface AnalyticsReport {
  generated_at: string;
  total: number;
  archived: number;
  conversions: ConversionMetric[];
  paths: { stages: ApplicationStage[]; count: number }[];
  paths_count: number;
  without_applied_event: number;
  waiting: AnalyticsRow[];
  fit: AnalyticsApplication[];
  scatter: {
    points: ScatterPoint[];
    eligible: boolean;
    reason: string | null;
    minimum: number;
  };
  volume: {
    weekly: VolumeBucket[];
    monthly: VolumeBucket[];
    included: number;
    undated: number;
  };
}
