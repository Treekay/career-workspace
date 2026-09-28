import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const localPath = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(
    (s) => !/[\x00-\x1f]/.test(s) && !/^[a-z]+:\/\//i.test(s),
    'Use a local filesystem path',
  );
const numeric = (min: number, max: number, integer = false) =>
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (s) =>
        Number.isFinite(Number(s)) &&
        Number(s) >= min &&
        Number(s) <= max &&
        (!integer || Number.isInteger(Number(s))),
    )
    .transform((s) => String(Number(s)));
export const settingsSchema = z.strictObject({
  webPort: numeric(1, 65535, true).default('5173'),
  discoverStaleHours: numeric(0.01, 87600).default('36'),
  careerOpsTimeoutSeconds: numeric(10, 1800, true).default('600'),
  careerOpsDataPath: z
    .string()
    .trim()
    .max(4096)
    .refine((s) => s === '' || localPath.safeParse(s).success)
    .default(''),
  databasePath: localPath,
  easySeekPath: localPath,
  jobAlertsPath: localPath,
  careerOpsPath: localPath,
  careerOpsCli: localPath,
  endpoint: z
    .string()
    .max(200)
    .refine((s) => {
      try {
        const u = new URL(s);
        return (
          u.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(u.hostname) &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          u.pathname === '/' &&
          Number(u.port || '80') > 0 &&
          /^http:\/\/(localhost|127\.0\.0\.1):[0-9]+\/?$/.test(s)
        );
      } catch {
        return false;
      }
    }, 'Use an http://localhost:port endpoint without credentials or extra paths'),
  extensionOrigins: z
    .string()
    .max(4096)
    .refine(
      (s) =>
        !s.trim() ||
        s
          .split(',')
          .every(
            (v) =>
              /^chrome-extension:\/\/[a-p]{32}$/.test(v.trim()) ||
              /^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
                v.trim(),
              ),
          ),
      'Use exact local extension origins separated by commas',
    ),
});
export type LocalSettings = z.infer<typeof settingsSchema>;
const documentSchema = z.strictObject({
  values: settingsSchema.partial().extend({
    webPort: settingsSchema.shape.webPort.removeDefault().optional(),
    discoverStaleHours: settingsSchema.shape.discoverStaleHours
      .removeDefault()
      .optional(),
    careerOpsTimeoutSeconds: settingsSchema.shape.careerOpsTimeoutSeconds
      .removeDefault()
      .optional(),
    careerOpsDataPath: settingsSchema.shape.careerOpsDataPath
      .removeDefault()
      .optional(),
  }),
  completedAt: z.iso.datetime().nullable(),
});
export type LocalDocument = z.infer<typeof documentSchema>;
export function readLocal(file: string): LocalDocument {
  if (!existsSync(file)) return { values: {}, completedAt: null };
  if (statSync(file).size > 32768)
    throw new Error(
      'Local settings file is invalid. Check its format; no credentials belong here.',
    );
  return documentSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
export function writeLocal(file: string, value: LocalDocument) {
  const data = documentSchema.parse(value);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  let created = false;
  try {
    writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    created = true;
    renameSync(temporary, file);
  } finally {
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}
