CREATE TABLE IF NOT EXISTS paper_review_refresh (
  paper_id TEXT NOT NULL, space_id TEXT NOT NULL, revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', source_json TEXT NOT NULL DEFAULT '{}',
  draft_json TEXT NOT NULL DEFAULT '', result_json TEXT NOT NULL DEFAULT '',
  lock_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(space_id,paper_id,revision));
