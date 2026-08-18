CREATE TABLE `paper_reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_reading_space_paper` ON `paper_reading_progress` (`space_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_paper_reading_space_status` ON `paper_reading_progress` (`space_id`,`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `monitor_preferences` ADD `tracked_authors` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `recommendation_tier` text DEFAULT 'browse' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `read_minutes` integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `read_depth` text DEFAULT 'focused' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `problem_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `problem_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `method_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `method_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `contribution_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `contribution_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `limitations_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `limitations_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `reading_focus_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `reading_focus_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_questions_zh` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_questions_en` text DEFAULT '[]' NOT NULL;