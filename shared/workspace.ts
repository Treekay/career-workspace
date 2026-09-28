import type { CareerRun } from './career-ops.js';
export interface WorkspaceSummary {
  discovery: {
    status: string;
    today: number | null;
    high: number | null;
    message: string;
    updatedAt: string | null;
  };
  activity: {
    id: number;
    applicationId: string;
    company: string;
    title: string;
    stage: string;
    type: string;
    at: string;
    note: string | null;
    archived: boolean;
  }[];
}
export interface IntegrationHealth {
  checkedAt: string;
  database: { status: string; message: string };
  easyseek: { status: string; message: string; endpoint: string };
  alerts: { status: string; message: string };
}
export interface CareerDashboard {
  applications: {
    id: string;
    company: string;
    title: string;
    stage: string;
    hasJd: boolean;
    analyzed: boolean;
  }[];
  runs: CareerRun[];
  artifacts: {
    id: string;
    applicationId: string;
    type: string;
    path: string;
    createdAt: string;
  }[];
  warnings: string[];
}
