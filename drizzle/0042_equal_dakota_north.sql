CREATE INDEX `idx_research_tracks_retry_due` ON `research_tracks` (`build_status`,`build_retry_at`,`build_attempt_count`,`space_id`);--> statement-breakpoint
PRAGMA optimize;
