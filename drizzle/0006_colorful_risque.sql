CREATE TABLE `share_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`space_id` text NOT NULL,
	`kind` text NOT NULL,
	`locale` text DEFAULT 'zh' NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_share_snapshots_token` ON `share_snapshots` (`token`);--> statement-breakpoint
CREATE INDEX `idx_share_snapshots_space_created` ON `share_snapshots` (`space_id`,`created_at`);