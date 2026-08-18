CREATE TABLE `research_paper_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`source_paper_id` text NOT NULL,
	`target_paper_id` text NOT NULL,
	`kind` text NOT NULL,
	`relation_kind` text DEFAULT 'related' NOT NULL,
	`relationship_zh` text DEFAULT '' NOT NULL,
	`relationship_en` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`evidence_source` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_paper_id`) REFERENCES `research_track_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_paper_id`) REFERENCES `research_track_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_paper_edges_pair_kind_relation` ON `research_paper_edges` (`source_paper_id`,`target_paper_id`,`kind`,`relation_kind`);--> statement-breakpoint
CREATE INDEX `idx_research_paper_edges_space_kind` ON `research_paper_edges` (`space_id`,`kind`);--> statement-breakpoint
CREATE TABLE `research_paper_network_states` (
	`space_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`built_paper_count` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_paper_network_states_status` ON `research_paper_network_states` (`status`,`updated_at`);