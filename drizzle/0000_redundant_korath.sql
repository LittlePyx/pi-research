CREATE TABLE `paper_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`feedback` text,
	`saved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_feedback_space_paper` ON `paper_feedback` (`space_id`,`paper_id`);--> statement-breakpoint
CREATE TABLE `research_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`locale` text DEFAULT 'zh' NOT NULL,
	`model` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_conversations_space` ON `research_conversations` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`member_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`accent` text DEFAULT 'blue' NOT NULL,
	`preferred_locale` text DEFAULT 'zh' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_research_spaces_owner` ON `research_spaces` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_spaces_owner_name` ON `research_spaces` (`owner_user_id`,`name`);--> statement-breakpoint
CREATE TABLE `research_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`title` text NOT NULL,
	`research_question` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_threads_space` ON `research_threads` (`space_id`);