CREATE TABLE `paper_abstract_recovery` (
	`paper_id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`attempted_json` text DEFAULT '[]' NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
