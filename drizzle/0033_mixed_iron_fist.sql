CREATE TABLE `research_problem_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`assessment_id` text,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`kind` text DEFAULT 'verify' NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`rationale_zh` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `research_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_id`) REFERENCES `research_problem_assessments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_problem_actions_status_check" CHECK("research_problem_actions"."status" in ('proposed', 'accepted', 'done', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_problem_actions_problem_status` ON `research_problem_actions` (`problem_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `idx_research_problem_actions_space_updated` ON `research_problem_actions` (`space_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_problem_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`input_revision` text NOT NULL,
	`summary_zh` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`change_zh` text DEFAULT '' NOT NULL,
	`change_en` text DEFAULT '' NOT NULL,
	`uncertainty_zh` text DEFAULT '' NOT NULL,
	`uncertainty_en` text DEFAULT '' NOT NULL,
	`next_decision_zh` text DEFAULT '' NOT NULL,
	`next_decision_en` text DEFAULT '' NOT NULL,
	`next_search_query` text DEFAULT '' NOT NULL,
	`hypothesis_impacts_json` text DEFAULT '[]' NOT NULL,
	`source_statement_ids` text DEFAULT '[]' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `research_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_problem_assessments_revision` ON `research_problem_assessments` (`problem_id`,`input_revision`);--> statement-breakpoint
CREATE INDEX `idx_research_problem_assessments_track_created` ON `research_problem_assessments` (`track_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_problem_hypotheses` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`statement` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`source_statement_ids` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `research_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_problem_hypotheses_status_check" CHECK("research_problem_hypotheses"."status" in ('proposed', 'confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_problem_hypotheses_position` ON `research_problem_hypotheses` (`problem_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_research_problem_hypotheses_track_status` ON `research_problem_hypotheses` (`track_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_problems` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`working_language` text DEFAULT 'zh' NOT NULL,
	`question` text DEFAULT '' NOT NULL,
	`objective` text DEFAULT '' NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`success_criteria` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'literature' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`source_revision` text DEFAULT '' NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_problems_status_check" CHECK("research_problems"."status" in ('draft', 'active', 'paused', 'resolved')),
	CONSTRAINT "research_problems_stage_check" CHECK("research_problems"."stage" in ('literature', 'theory', 'method', 'experiment', 'writing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_problems_space_track` ON `research_problems` (`space_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `idx_research_problems_space_status` ON `research_problems` (`space_id`,`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_problem_id` text;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `problem_fit_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `uncertainty_reduction_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `actionability_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_problem_impact_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_problem_impact_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_decision_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `research_decision_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA optimize;
