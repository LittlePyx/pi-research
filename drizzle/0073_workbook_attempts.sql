CREATE TABLE IF NOT EXISTS research_workbook_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  workbook_id TEXT NOT NULL REFERENCES research_comparison_workbooks(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  code TEXT NOT NULL,
  provider_status INTEGER NOT NULL DEFAULT 0,
  finish_reason TEXT NOT NULL DEFAULT '',
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_workbook_attempts ON research_workbook_attempts(workbook_id, created_at);
