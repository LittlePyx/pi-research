CREATE TABLE `research_track_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`source_track_id` text NOT NULL,
	`target_track_id` text NOT NULL,
	`kind` text DEFAULT 'builds_on' NOT NULL,
	`relationship_zh` text DEFAULT '' NOT NULL,
	`relationship_en` text DEFAULT '' NOT NULL,
	`strength` integer DEFAULT 50 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_track_edges_pair_kind` ON `research_track_edges` (`source_track_id`,`target_track_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_research_track_edges_space` ON `research_track_edges` (`space_id`);--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `discovery_round` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `user_role` text DEFAULT 'explore' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `depth_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `support_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `interaction_score` integer DEFAULT 0 NOT NULL;