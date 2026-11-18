export const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS wards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('citizen','official','admin')),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Pothole','Streetlight','Water Leak','Garbage','Drainage','Other')),
  photo_path TEXT,
  after_photo_path TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported','Acknowledged','In Progress','Resolved','Rejected')),
  priority_score INTEGER NOT NULL DEFAULT 0,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS issue_events (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  old_status TEXT,
  new_status TEXT NOT NULL CHECK (new_status IN ('Reported','Acknowledged','In Progress','Resolved','Rejected')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS upvotes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, issue_id)
);
CREATE TABLE IF NOT EXISTS monthly_votes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, issue_id, month)
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS point_ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('report','resolved','upvote','vote')),
  points INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  period TEXT NOT NULL DEFAULT '',
  UNIQUE (user_id, issue_id, action, period)
);
CREATE INDEX IF NOT EXISTS idx_issues_status_created ON issues(status, created_at);
CREATE INDEX IF NOT EXISTS idx_issues_category_location ON issues(category, latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_issues_department_status ON issues(department_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_ward_status ON issues(ward_id, status);
CREATE INDEX IF NOT EXISTS idx_events_issue_time ON issue_events(issue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_month_issue ON monthly_votes(month, issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue_time ON comments(issue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_time ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_points_user_time ON point_ledger(user_id, created_at);
`;
