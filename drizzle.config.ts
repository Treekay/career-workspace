import { defineConfig } from 'drizzle-kit';
import { join, relative } from 'node:path';
import { readConfig } from './config/runtime.js';
const config = readConfig();
export default defineConfig({
  dialect: 'sqlite',
  schema: join(config.root, 'server/db/schema.ts').replaceAll('\\', '/'),
  // Drizzle Kit snapshot discovery expects a cwd-relative path on Windows.
  out: relative(process.cwd(), join(config.root, 'drizzle')).replaceAll(
    '\\',
    '/',
  ),
  dbCredentials: { url: config.databasePath },
});
