CREATE TABLE `learning_stage_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`path_id` text NOT NULL,
	`step_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lock_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE no action
);
