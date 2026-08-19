CREATE TABLE `monitor_daily_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`brief_date` text NOT NULL,
	`scan_job_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`headline_zh` text DEFAULT '' NOT NULL,
	`headline_en` text DEFAULT '' NOT NULL,
	`overview_zh` text DEFAULT '' NOT NULL,
	`overview_en` text DEFAULT '' NOT NULL,
	`signals_zh` text DEFAULT '[]' NOT NULL,
	`signals_en` text DEFAULT '[]' NOT NULL,
	`reading_plan_zh` text DEFAULT '[]' NOT NULL,
	`reading_plan_en` text DEFAULT '[]' NOT NULL,
	`watchlist_zh` text DEFAULT '[]' NOT NULL,
	`watchlist_en` text DEFAULT '[]' NOT NULL,
	`paper_ids` text DEFAULT '[]' NOT NULL,
	`metrics_json` text DEFAULT '{}' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_daily_briefs_space_date` ON `monitor_daily_briefs` (`space_id`,`brief_date`);--> statement-breakpoint
CREATE INDEX `idx_monitor_daily_briefs_space_updated` ON `monitor_daily_briefs` (`space_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `lock_token` text;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `lock_expires_at` text;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `last_trigger` text DEFAULT 'visit' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `trigger_source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `resume_of_job_id` text;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `checkpoint` text DEFAULT 'queued' NOT NULL;