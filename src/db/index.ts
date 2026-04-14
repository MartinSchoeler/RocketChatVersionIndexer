import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import * as schema from './schema.js';

let db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(config.dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!db) {
    db = createDb();
  }
  return db;
}

export function initializeDb() {
  const db = getDb();

  // Create tables directly using SQL (push-style, no migration files needed)
  db.run(/*sql*/`
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      major INTEGER NOT NULL,
      minor INTEGER NOT NULL,
      patch INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      endpoint_count INTEGER DEFAULT 0,
      indexed_at TEXT
    )
  `);

  db.run(/*sql*/`
    CREATE TABLE IF NOT EXISTS endpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL REFERENCES versions(id),
      path TEXT NOT NULL,
      method TEXT NOT NULL,
      param_type TEXT,
      return_type TEXT,
      type_block TEXT,
      impl_code TEXT,
      impl_config TEXT,
      type_file TEXT,
      impl_file TEXT,
      impl_start_line INTEGER,
      impl_end_line INTEGER
    )
  `);

  db.run(/*sql*/`
    CREATE UNIQUE INDEX IF NOT EXISTS endpoints_version_path_method
    ON endpoints(version_id, path, method)
  `);

  db.run(/*sql*/`
    CREATE INDEX IF NOT EXISTS endpoints_path_method
    ON endpoints(path, method)
  `);

  db.run(/*sql*/`
    CREATE TABLE IF NOT EXISTS indexing_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL REFERENCES versions(id),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      error_msg TEXT,
      endpoints_found INTEGER DEFAULT 0
    )
  `);
}

export { schema };
