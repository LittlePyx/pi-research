CREATE TABLE `monitor_weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`week_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`title_zh` text DEFAULT '' NOT NULL,
	`title_en` text DEFAULT '' NOT NULL,
	`overview_zh` text DEFAULT '' NOT NULL,
	`overview_en` text DEFAULT '' NOT NULL,
	`gains_zh` text DEFAULT '[]' NOT NULL,
	`gains_en` text DEFAULT '[]' NOT NULL,
	`gaps_zh` text DEFAULT '[]' NOT NULL,
	`gaps_en` text DEFAULT '[]' NOT NULL,
	`next_steps_zh` text DEFAULT '[]' NOT NULL,
	`next_steps_en` text DEFAULT '[]' NOT NULL,
	`source_days` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_weekly_reviews_space_week` ON `monitor_weekly_reviews` (`space_id`,`week_key`);--> statement-breakpoint
CREATE INDEX `idx_monitor_weekly_reviews_space_updated` ON `monitor_weekly_reviews` (`space_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`kind` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`body_zh` text DEFAULT '' NOT NULL,
	`body_en` text DEFAULT '' NOT NULL,
	`action_view` text DEFAULT 'today' NOT NULL,
	`entity_id` text,
	`read_at` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_notifications_space_dedupe` ON `research_notifications` (`space_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_research_notifications_space_read_created` ON `research_notifications` (`space_id`,`read_at`,`created_at`);