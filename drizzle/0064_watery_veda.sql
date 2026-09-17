CREATE TABLE `research_maintenance` (
	`space_id` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`last_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_success_at` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lane` text DEFAULT 'graph' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_maintenance_due` ON `research_maintenance` (`next_at`,`lease_until`);--> statement-breakpoint
CREATE TABLE `research_route_library_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`paper_title` text NOT NULL,
	`abstract_text` text NOT NULL,
	`route_title` text NOT NULL,
	`relevance` text DEFAULT 'insufficient' NOT NULL,
	`assessment_json` text DEFAULT '{}' NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_route_library_review_pair` ON `research_route_library_reviews` (`track_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_route_library_review_space` ON `research_route_library_reviews` (`space_id`,`track_id`);--> statement-breakpoint
ALTER TABLE `library_graph_checks` ADD `auto_next_at` integer DEFAULT 0 NOT NULL;