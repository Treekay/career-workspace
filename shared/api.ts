export interface HealthResponse {
  status: 'ok' | 'error';
  service: 'career-workspace';
  database: 'ok' | 'unavailable';
}
export interface SetupResponse {
  database: { path: string };
  projects: {
    id: string;
    name: string;
    configuredPath: string;
    path: string;
    available: boolean;
  }[];
}
