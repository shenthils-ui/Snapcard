// Server-side engine: better-sqlite3 over a real file. Runs the exact same
// shared schema + store logic as the in-browser sql.js engine.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { migrate, seedIfEmpty } from '../shared/store.js';

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seedIfEmpty(db);
  return db;
}
