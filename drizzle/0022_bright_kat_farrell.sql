CREATE TABLE `research_network_candidate_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`seed_paper_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`kind` text NOT NULL,
	`direction` text NOT NULL,
	`is_influential` integer DEFAULT false NOT NULL,
	`intents_json` text DEFAULT '[]' NOT NULL,
	`contexts_json` text DEFAULT '[]' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`evidence_source` text DEFAULT 'semantic-scholar' NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seed_paper_id`) REFERENCES `research_track_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `research_network_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_network_candidate_edges_unique` ON `research_network_candidate_edges` (`seed_paper_id`,`candidate_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_research_network_candidate_edges_space_seed_seen` ON `research_network_candidate_edges` (`space_id`,`seed_paper_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_research_network_candidate_edges_space_candidate_seen` ON `research_network_candidate_edges` (`space_id`,`candidate_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `research_network_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`s2_paper_id` text,
	`openalex_id` text,
	`doi` text,
	`title` text NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`published_at` text,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`abstract_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ghost' NOT NULL,
	`metadata_source` text DEFAULT 'semantic-scholar' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_network_candidates_space_canonical` ON `research_network_candidates` (`space_id`,`canonical_id`);--> statement-breakpoint
CREATE INDEX `idx_research_network_candidates_space_status_seen` ON `research_network_candidates` (`space_id`,`status`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_research_network_candidates_space_s2` ON `research_network_candidates` (`space_id`,`s2_paper_id`);