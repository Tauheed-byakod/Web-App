import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const uploadDir = path.resolve(root, process.env.UPLOAD_DIR || 'uploads');
const dbPath = path.resolve(root, process.env.DATABASE_PATH || 'data/civicgaps.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.exec(schema);
const pointColumns = db.pragma('table_info(point_ledger)');
if (!pointColumns.some(column => column.name === 'period')) {
  db.exec(`
    ALTER TABLE point_ledger RENAME TO point_ledger_legacy;
    CREATE TABLE point_ledger (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK (action IN ('report','resolved','upvote','vote')),
      points INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      period TEXT NOT NULL DEFAULT '',
      UNIQUE (user_id, issue_id, action, period)
    );
    INSERT INTO point_ledger (id,user_id,issue_id,action,points,created_at,period)
      SELECT id,user_id,issue_id,action,points,created_at,'' FROM point_ledger_legacy;
    DROP TABLE point_ledger_legacy;
    CREATE INDEX IF NOT EXISTS idx_points_user_time ON point_ledger(user_id, created_at);
  `);
}
