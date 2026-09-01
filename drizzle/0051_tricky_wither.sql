CREATE TABLE IF NOT EXISTS `research_route_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`input_revision` text NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`summary_zh` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`rationale_zh` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`previous_title_zh` text NOT NULL,
	`previous_title_en` text NOT NULL,
	`previous_summary_zh` text DEFAULT '' NOT NULL,
	`previous_summary_en` text DEFAULT '' NOT NULL,
	`previous_search_queries_json` text DEFAULT '[]' NOT NULL,
	`search_queries_json` text DEFAULT '[]' NOT NULL,
	`source_paper_ids_json` text DEFAULT '[]' NOT NULL,
	`source_statement_ids_json` text DEFAULT '[]' NOT NULL,
	`source_papers_json` text DEFAULT '[]' NOT NULL,
	`source_statements_json` text DEFAULT '[]' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_route_revisions_status_check" CHECK("research_route_revisions"."status" in ('proposed', 'confirmed', 'dismissed', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_research_route_revisions_track_version` ON `research_route_revisions` (`track_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_research_route_revisions_track_input` ON `research_route_revisions` (`track_id`,`input_revision`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_route_revisions_space_status` ON `research_route_revisions` (`space_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_route_revisions_track_created` ON `research_route_revisions` (`track_id`,`created_at`);
