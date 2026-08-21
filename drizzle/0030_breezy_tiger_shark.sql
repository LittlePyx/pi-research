CREATE TABLE `paper_engagement_events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`weight` integer DEFAULT 0 NOT NULL,
	`dwell_ms` integer DEFAULT 0 NOT NULL,
	`context` text DEFAULT 'today' NOT NULL,
	`route_id` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_engagement_space_event` ON `paper_engagement_events` (`space_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `idx_paper_engagement_space_paper_time` ON `paper_engagement_events` (`space_id`,`paper_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_paper_engagement_space_route_time` ON `paper_engagement_events` (`space_id`,`route_id`,`occurred_at`);--> statement-breakpoint
PRAGMA optimize;
