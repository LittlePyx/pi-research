CREATE TABLE `monitor_reliability_events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`scan_job_id` text,
	`kind` text NOT NULL,
	`stage` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`outcome` text DEFAULT 'info' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_job_id`) REFERENCES `monitor_scan_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_monitor_reliability_space_created` ON `monitor_reliability_events` (`space_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_monitor_reliability_job_created` ON `monitor_reliability_events` (`scan_job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_monitor_reliability_space_source_created` ON `monitor_reliability_events` (`space_id`,`source`,`created_at`);--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `first_recommendation_at` text;