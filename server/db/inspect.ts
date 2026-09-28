import Database from 'better-sqlite3';
import { readConfig } from '../../config/runtime.js';

const sqlite = new Database(readConfig().databasePath, {
  readonly: true,
  fileMustExist: true,
});
try {
  const tables = ['applications', 'application_events', 'artifacts'];
  const report = {
    tables: Object.fromEntries(
      tables.map((table) => [
        table,
        {
          columns: sqlite.pragma('table_info(' + table + ')'),
          indexes: sqlite.pragma('index_list(' + table + ')'),
          foreignKeys: sqlite.pragma('foreign_key_list(' + table + ')'),
        },
      ]),
    ),
    definitions: sqlite
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND (type = 'table' OR type = 'trigger') ORDER BY type, name",
      )
      .all(),
    foreignKeyCheck: sqlite.pragma('foreign_key_check'),
    integrityCheck: sqlite.pragma('integrity_check'),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  sqlite.close();
}
