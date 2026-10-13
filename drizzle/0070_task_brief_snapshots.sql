CREATE TABLE monitor_task_briefs (
 id TEXT PRIMARY KEY NOT NULL,
 space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
 scan_job_id TEXT NOT NULL REFERENCES monitor_scan_jobs(id) ON DELETE CASCADE,
 payload_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX idx_monitor_task_briefs_space_job ON monitor_task_briefs(space_id,scan_job_id,created_at);
