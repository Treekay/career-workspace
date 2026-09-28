import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

function findRoot(start: string): string {
  let current = start;
  while (true) {
    const manifest = join(current, 'package.json');
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, 'utf8')).name === 'career-workspace'
    )
      return current;
    const parent = dirname(current);
    if (parent === current)
      throw new Error('Cannot locate career-workspace root');
    current = parent;
  }
}
export const projectRoot = findRoot(dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: join(projectRoot, '.env'), quiet: true });

function port(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new Error(name + ' must be an integer from 1 to 65535');
  return Number(value);
}
export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
  root = projectRoot,
) {
  const apiPort = port(env.API_PORT, 3001, 'API_PORT');
  const webPort = port(env.WEB_PORT, 5173, 'WEB_PORT');
  if (apiPort === webPort) throw new Error('API_PORT and WEB_PORT must differ');
  const path = (value: string | undefined, fallback: string) => {
    if (value !== undefined && !value.trim())
      throw new Error('Configured paths cannot be empty');
    return resolve(root, value ?? fallback);
  };
  const discoverStaleHours = Number(env.DISCOVER_STALE_HOURS ?? 36);
  if (!Number.isFinite(discoverStaleHours) || discoverStaleHours <= 0)
    throw new Error('DISCOVER_STALE_HOURS must be a positive number');
  return {
    discoverStaleHours,
    root,
    host: '127.0.0.1' as const,
    apiPort,
    webPort,
    databasePath: path(env.DATABASE_PATH, './data/workspace.db'),
    projects: [
      {
        id: 'easyseek',
        name: 'EasySeek',
        configuredPath: env.EASYSEEK_PATH ?? '../EasySeek',
        path: path(env.EASYSEEK_PATH, '../EasySeek'),
      },
      {
        id: 'job-alert-workflow',
        name: 'Job Alert Workflow',
        configuredPath: env.JOB_ALERT_WORKFLOW_PATH ?? '../job-alert-workflow',
        path: path(env.JOB_ALERT_WORKFLOW_PATH, '../job-alert-workflow'),
      },
      {
        id: 'career-ops',
        name: 'Career Ops',
        configuredPath: env.CAREER_OPS_PATH ?? '../career-ops',
        path: path(env.CAREER_OPS_PATH, '../career-ops'),
      },
    ],
  };
}
export type WorkspaceConfig = ReturnType<typeof readConfig>;
