CREATE TABLE `semantic_scholar_throttles` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_key` text NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`next_allowed_at` text,
	`last_status` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_semantic_scholar_throttles_scope` ON `semantic_scholar_throttles` (`scope_key`);--> statement-breakpoint
CREATE INDEX `idx_semantic_scholar_throttles_next` ON `semantic_scholar_throttles` (`next_allowed_at`);--> statement-breakpoint
ALTER TABLE `research_network_expansion_states` ADD `similarity_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_network_expansion_states` ADD `similarity_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_network_expansion_states` ADD `similarity_expires_at` text;--> statement-breakpoint
ALTER TABLE `research_network_expansion_states` ADD `lock_token` text;--> statement-breakpoint
ALTER TABLE `research_network_expansion_states` ADD `lock_expires_at` text;