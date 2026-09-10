CREATE TABLE `research_comparison_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook_id` text NOT NULL,
	`space_id` text NOT NULL,
	`revision` integer NOT NULL,
	`value_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workbook_id`) REFERENCES `research_comparison_workbooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_artifact_revision` ON `research_comparison_artifacts` (`workbook_id`,`revision`);--> statement-breakpoint
CREATE TABLE `research_comparison_workbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`question` text NOT NULL,
	`source_revision` text NOT NULL,
	`source_ids_json` text NOT NULL,
	`policy` text NOT NULL,
	`draft_json` text DEFAULT '' NOT NULL,
	`content_json` text DEFAULT '' NOT NULL,
	`review_json` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`lock_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_workbooks_track` ON `research_comparison_workbooks` (`space_id`,`track_id`,`created_at`);