CREATE TABLE `monitor_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`profile_key` text NOT NULL,
	`priority_venues` text DEFAULT '[]' NOT NULL,
	`user_modified` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_preferences_space` ON `monitor_preferences` (`space_id`);--> statement-breakpoint
CREATE TABLE `paper_insights` (
	`paper_id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`abstract_text` text DEFAULT '' NOT NULL,
	`summary_zh` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`why_read_zh` text DEFAULT '' NOT NULL,
	`why_read_en` text DEFAULT '' NOT NULL,
	`quality_score` integer DEFAULT 0 NOT NULL,
	`priority_venue` integer DEFAULT false NOT NULL,
	`analysis_source` text DEFAULT 'metadata' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_paper_insights_space_quality` ON `paper_insights` (`space_id`,`quality_score`);