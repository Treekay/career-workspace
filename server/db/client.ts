import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { projectRoot } from '../../config/runtime.js';
import * as schema from './schema.js';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: join(projectRoot, 'drizzle') });
    db.insert(schema.workspaceMetadata)
      .values({ key: 'initialized_at', value: new Date().toISOString() })
      .onConflictDoNothing()
      .run();
    return { db, sqlite };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
