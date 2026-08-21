CREATE TABLE `research_syntheses` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`status` text DEFAULT 'empty' NOT NULL,
	`input_revision` text DEFAULT '' NOT NULL,
	`question_zh` text DEFAULT '' NOT NULL,
	`question_en` text DEFAULT '' NOT NULL,
	`overview_zh` text DEFAULT '' NOT NULL,
	`overview_en` text DEFAULT '' NOT NULL,
	`change_summary_zh` text DEFAULT '' NOT NULL,
	`change_summary_en` text DEFAULT '' NOT NULL,
	`next_search_query` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`source_paper_count` integer DEFAULT 0 NOT NULL,
	`fulltext_paper_count` integer DEFAULT 0 NOT NULL,
	`claim_count` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`error` text,
	`lock_token` text,
	`lock_expires_at` text,
	`analyzed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_syntheses_space_track` ON `research_syntheses` (`space_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `idx_research_syntheses_space_updated` ON `research_syntheses` (`space_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_synthesis_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`synthesis_id` text NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`input_revision` text NOT NULL,
	`change_summary_zh` text DEFAULT '' NOT NULL,
	`change_summary_en` text DEFAULT '' NOT NULL,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`source_paper_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`synthesis_id`) REFERENCES `research_syntheses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_synthesis_revisions_identity` ON `research_synthesis_revisions` (`synthesis_id`,`input_revision`);--> statement-breakpoint
CREATE INDEX `idx_research_synthesis_revisions_track_created` ON `research_synthesis_revisions` (`track_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_synthesis_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`synthesis_id` text NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`kind` text NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`text_zh` text NOT NULL,
	`text_en` text NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`source_claim_ids` text DEFAULT '[]' NOT NULL,
	`source_paper_ids` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`synthesis_id`) REFERENCES `research_syntheses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_synthesis_statements_position` ON `research_synthesis_statements` (`synthesis_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_research_synthesis_statements_track_kind` ON `research_synthesis_statements` (`track_id`,`kind`);--> statement-breakpoint
PRAGMA optimize;
