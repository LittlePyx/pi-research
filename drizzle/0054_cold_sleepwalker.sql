DROP INDEX `idx_research_gap_discovery_signal`;--> statement-breakpoint
ALTER TABLE `research_gap_discovery_jobs` ADD `purpose` text DEFAULT 'route' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_gap_discovery_signal` ON `research_gap_discovery_jobs` (`space_id`,`track_id`,`purpose`,`signal_revision`);--> statement-breakpoint
ALTER TABLE `learning_path_steps` ADD `evidence_query` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_path_steps` ADD `discovery_job_id` text;--> statement-breakpoint
ALTER TABLE `learning_paths` ADD `parent_path_id` text;--> statement-breakpoint
ALTER TABLE `learning_paths` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_paths` ADD `source_revision` text DEFAULT '' NOT NULL;