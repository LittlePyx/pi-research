CREATE TABLE `research_action_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`assessment_id` text,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`stage` text DEFAULT 'queued' NOT NULL,
	`input_revision` text DEFAULT '' NOT NULL,
	`headline_zh` text DEFAULT '' NOT NULL,
	`headline_en` text DEFAULT '' NOT NULL,
	`result_zh` text DEFAULT '' NOT NULL,
	`result_en` text DEFAULT '' NOT NULL,
	`decision_zh` text DEFAULT '' NOT NULL,
	`decision_en` text DEFAULT '' NOT NULL,
	`limitations_zh` text DEFAULT '' NOT NULL,
	`limitations_en` text DEFAULT '' NOT NULL,
	`search_query` text DEFAULT '' NOT NULL,
	`deliverable_json` text DEFAULT '{}' NOT NULL,
	`source_paper_ids` text DEFAULT '[]' NOT NULL,
	`source_claim_ids` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `research_problem_actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `research_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_id`) REFERENCES `research_problem_assessments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_action_runs_status_check" CHECK("research_action_runs"."status" in ('queued', 'running', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_action_runs_action_created` ON `research_action_runs` (`action_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_research_action_runs_problem_created` ON `research_action_runs` (`problem_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_research_action_runs_space_status` ON `research_action_runs` (`space_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
