CREATE TABLE `monitor_discovery_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`horizon` text NOT NULL,
	`query_key` text NOT NULL,
	`next_offset` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_discovery_space_horizon_query` ON `monitor_discovery_pages` (`space_id`,`horizon`,`query_key`);--> statement-breakpoint
CREATE TABLE `research_track_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`space_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`doi` text,
	`title` text NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`published_at` text,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`role` text NOT NULL,
	`summary_zh` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`rationale_zh` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_track_papers_track_canonical` ON `research_track_papers` (`track_id`,`canonical_id`);--> statement-breakpoint
CREATE INDEX `idx_research_track_papers_track_position` ON `research_track_papers` (`track_id`,`position`);--> statement-breakpoint
CREATE TABLE `research_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`summary_zh` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`search_queries` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`expansion_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_tracks_space_position` ON `research_tracks` (`space_id`,`position`);