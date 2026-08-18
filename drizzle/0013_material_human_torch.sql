CREATE TABLE `monitor_candidate_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`source_key` text NOT NULL,
	`channel` text NOT NULL,
	`query_key` text NOT NULL,
	`appearances` integer DEFAULT 1 NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_candidate_source_identity` ON `monitor_candidate_sources` (`paper_id`,`source_key`,`query_key`);--> statement-breakpoint
CREATE INDEX `idx_monitor_candidate_sources_space` ON `monitor_candidate_sources` (`space_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `monitor_discovery_coverage` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`horizon` text NOT NULL,
	`source_key` text NOT NULL,
	`channel` text NOT NULL,
	`query_key` text NOT NULL,
	`next_cursor` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`candidate_count` integer DEFAULT 0 NOT NULL,
	`new_candidate_count` integer DEFAULT 0 NOT NULL,
	`last_scanned_at` text,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_coverage_scope` ON `monitor_discovery_coverage` (`space_id`,`horizon`,`source_key`,`query_key`);--> statement-breakpoint
CREATE INDEX `idx_monitor_coverage_space_scanned` ON `monitor_discovery_coverage` (`space_id`,`last_scanned_at`);--> statement-breakpoint
CREATE TABLE `monitor_scan_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`current_horizon` text DEFAULT '' NOT NULL,
	`current_source` text DEFAULT '' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`reviewed_count` integer DEFAULT 0 NOT NULL,
	`recommended_count` integer DEFAULT 0 NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_monitor_scan_jobs_space_updated` ON `monitor_scan_jobs` (`space_id`,`updated_at`);