import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Infrastructure metadata only. Application/tracker schema is intentionally deferred.
export const workspaceMetadata = sqliteTable('workspace_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
