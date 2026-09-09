CREATE TABLE `learning_stage_dispatches` (
	`path_id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_learning_stage_dispatch_due` ON `learning_stage_dispatches` (`next_at`,`lease_until`);