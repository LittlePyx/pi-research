CREATE TABLE `ai_usage_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`usage_date` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_usage_daily_scope_date` ON `ai_usage_daily` (`scope`,`usage_date`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_daily_date` ON `ai_usage_daily` (`usage_date`);