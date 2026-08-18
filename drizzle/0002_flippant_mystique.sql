CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`new_count` integer DEFAULT 0 NOT NULL,
	`scanned_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_runs_space` ON `monitor_runs` (`space_id`);--> statement-breakpoint
CREATE TABLE `monitored_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`doi` text,
	`title` text NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`published_at` text,
	`source` text DEFAULT 'crossref' NOT NULL,
	`horizon` text NOT NULL,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`relevance_score` integer DEFAULT 0 NOT NULL,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitored_papers_space_canonical` ON `monitored_papers` (`space_id`,`canonical_id`);--> statement-breakpoint
CREATE INDEX `idx_monitored_papers_space_discovered` ON `monitored_papers` (`space_id`,`discovered_at`);