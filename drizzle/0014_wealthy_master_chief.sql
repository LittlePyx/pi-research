CREATE TABLE `monitor_query_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`plan_date` text NOT NULL,
	`exploration_mode` text NOT NULL,
	`queries_json` text DEFAULT '{}' NOT NULL,
	`rationale_zh` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_query_plans_space_date` ON `monitor_query_plans` (`space_id`,`plan_date`);--> statement-breakpoint
CREATE INDEX `idx_monitor_query_plans_space_created` ON `monitor_query_plans` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_map_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`kind` text DEFAULT 'new_evidence' NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`summary_zh` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_map_changes_paper_track_kind` ON `research_map_changes` (`paper_id`,`track_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_research_map_changes_space_created` ON `research_map_changes` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_preference_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`layer` text NOT NULL,
	`kind` text NOT NULL,
	`label_zh` text NOT NULL,
	`label_en` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 50 NOT NULL,
	`weight` integer DEFAULT 50 NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`observed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_preference_signals_source` ON `research_preference_signals` (`space_id`,`source_type`,`source_id`,`kind`,`label_en`);--> statement-breakpoint
CREATE INDEX `idx_preference_signals_space_layer` ON `research_preference_signals` (`space_id`,`layer`,`active`);--> statement-breakpoint
ALTER TABLE `monitor_preferences` ADD `exploration_mode` text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_feedback` ADD `reason_code` text;--> statement-breakpoint
ALTER TABLE `paper_feedback` ADD `note` text DEFAULT '' NOT NULL;