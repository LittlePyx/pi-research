CREATE TABLE `monitor_scheduler_ticks` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`due_space_count` integer DEFAULT 0 NOT NULL,
	`started_count` integer DEFAULT 0 NOT NULL,
	`advanced_count` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`paused_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_monitor_scheduler_ticks_created` ON `monitor_scheduler_ticks` (`created_at`);--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `last_user_activity_at` text;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `scheduled_runs_since_activity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `automation_paused_at` text;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `automation_pause_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_monitor_runs_automation_due` ON `monitor_runs` (`automation_paused_at`,`status`,`next_run_at`);