ALTER TABLE `research_tracks` ADD `intelligence_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_error` text;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_retry_at` text;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_lock_token` text;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_lock_expires_at` text;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_refresh_requested_at` text;--> statement-breakpoint
UPDATE `research_tracks` SET `intelligence_status` = 'ready'
WHERE `intelligence_updated_at` IS NOT NULL AND `intelligence_json` <> '{}';--> statement-breakpoint
CREATE INDEX `idx_research_tracks_intelligence_due` ON `research_tracks` (`space_id`,`intelligence_status`,`intelligence_retry_at`,`intelligence_lock_expires_at`,`position`);
