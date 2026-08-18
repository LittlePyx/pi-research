CREATE TABLE `paper_delivery_state` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`show_count` integer DEFAULT 0 NOT NULL,
	`first_shown_at` text,
	`last_shown_at` text,
	`opened_at` text,
	`snoozed_until` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_delivery_space_paper` ON `paper_delivery_state` (`space_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_paper_delivery_space_last_shown` ON `paper_delivery_state` (`space_id`,`last_shown_at`);