CREATE TABLE `learning_path_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`path_id` text NOT NULL,
	`space_id` text NOT NULL,
	`kind` text DEFAULT 'foundation' NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`goal_zh` text DEFAULT '' NOT NULL,
	`goal_en` text DEFAULT '' NOT NULL,
	`why_zh` text DEFAULT '' NOT NULL,
	`why_en` text DEFAULT '' NOT NULL,
	`read_focus_zh` text DEFAULT '' NOT NULL,
	`read_focus_en` text DEFAULT '' NOT NULL,
	`checkpoint_zh` text DEFAULT '' NOT NULL,
	`checkpoint_en` text DEFAULT '' NOT NULL,
	`estimated_minutes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`resources_json` text DEFAULT '[]' NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_learning_path_steps_path_position` ON `learning_path_steps` (`path_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_learning_path_steps_space_status` ON `learning_path_steps` (`space_id`,`status`);--> statement-breakpoint
CREATE TABLE `learning_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`target` text NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`rationale_zh` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`analysis_model` text DEFAULT '' NOT NULL,
	`estimated_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_learning_paths_space_updated` ON `learning_paths` (`space_id`,`updated_at`);