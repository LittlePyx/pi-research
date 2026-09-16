CREATE TABLE `learning_plan_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text,
	`target` text NOT NULL,
	`goal` text NOT NULL,
	`background` text DEFAULT '' NOT NULL,
	`source_revision` text NOT NULL,
	`draft_json` text NOT NULL,
	`model` text NOT NULL,
	`base_path_id` text,
	`applied_path_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_learning_preview_applied_path` ON `learning_plan_previews` (`applied_path_id`);