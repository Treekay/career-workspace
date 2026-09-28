import type { LocalSettings } from '../config/local.js';
export type { LocalSettings };
export interface SetupState {
  values: LocalSettings;
  effective: LocalSettings;
  completedAt: string | null;
  restartRequired: boolean;
  overridden: string[];
  error: string | null;
}
export interface SetupCheck {
  ready: boolean;
  message: string;
}
export interface SetupReadiness {
  checkedAt: string;
  database: SetupCheck & { directory: string };
  easyseek: SetupCheck;
  alerts: SetupCheck & {
    config: string;
    latestRun: string | null;
    exportAvailable: boolean;
    workflowAvailable: boolean;
  };
  queue: SetupCheck;
  career: SetupCheck & {
    repoFound: boolean;
    portability: boolean;
    profile: boolean;
  };
}
export interface DoctorResult {
  status: 'Ready' | 'Needs setup' | 'Unavailable' | 'Error';
  checkedAt: string;
  missing: string[];
  warningCount: number;
  templateCount: number;
  message: string;
}
