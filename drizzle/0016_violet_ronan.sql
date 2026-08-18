CREATE TABLE `paper_reading_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`note_hash` text NOT NULL,
	`analysis_status` text DEFAULT 'pending' NOT NULL,
	`takeaway_zh` text DEFAULT '' NOT NULL,
	`takeaway_en` text DEFAULT '' NOT NULL,
	`methods_zh` text DEFAULT '[]' NOT NULL,
	`methods_en` text DEFAULT '[]' NOT NULL,
	`questions_zh` text DEFAULT '[]' NOT NULL,
	`questions_en` text DEFAULT '[]' NOT NULL,
	`connections_zh` text DEFAULT '[]' NOT NULL,
	`connections_en` text DEFAULT '[]' NOT NULL,
	`topics_zh` text DEFAULT '[]' NOT NULL,
	`topics_en` text DEFAULT '[]' NOT NULL,
	`track_id` text,
	`model` text DEFAULT '' NOT NULL,
	`error` text,
	`analyzed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reading_memories_space_paper` ON `paper_reading_memories` (`space_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_memories_space_updated` ON `paper_reading_memories` (`space_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `query_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `total_candidate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `zero_yield_streak` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `branch_status` text DEFAULT 'exploring' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `cooldown_until` text;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `first_scanned_at` text;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `new_candidate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `duplicate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `rejected_count` integer DEFAULT 0 NOT NULL;