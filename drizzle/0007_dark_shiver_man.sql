CREATE TABLE `research_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`file_names` text DEFAULT '[]' NOT NULL,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`safety_attested` integer DEFAULT false NOT NULL,
	`analysis_json` text NOT NULL,
	`analysis_model` text DEFAULT '' NOT NULL,
	`input_chars` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_imports_space_hash` ON `research_imports` (`space_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_research_imports_space_status_created` ON `research_imports` (`space_id`,`status`,`created_at`);