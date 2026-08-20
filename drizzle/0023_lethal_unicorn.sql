CREATE TABLE `research_network_expansion_states` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`expansion_key` text NOT NULL,
	`seed_canonical_ids` text DEFAULT '[]' NOT NULL,
	`recommendation_offset` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text,
	`last_expanded_at` text,
	`expires_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_network_expansion_state_unique` ON `research_network_expansion_states` (`space_id`,`expansion_key`);--> statement-breakpoint
CREATE INDEX `idx_research_network_expansion_state_fresh` ON `research_network_expansion_states` (`space_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `research_network_seed_expansion_states` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`seed_paper_id` text NOT NULL,
	`reference_offset` integer DEFAULT 0 NOT NULL,
	`citation_offset` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text,
	`last_expanded_at` text,
	`expires_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seed_paper_id`) REFERENCES `research_track_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_network_seed_expansion_unique` ON `research_network_seed_expansion_states` (`space_id`,`seed_paper_id`);--> statement-breakpoint
CREATE INDEX `idx_research_network_seed_expansion_fresh` ON `research_network_seed_expansion_states` (`space_id`,`expires_at`);--> statement-breakpoint
ALTER TABLE `research_network_candidate_edges` ADD `expansion_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_network_candidate_edges` ADD `seed_set_json` text DEFAULT '[]' NOT NULL;