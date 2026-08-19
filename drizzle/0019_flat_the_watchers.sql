CREATE TABLE `recommendation_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`scan_job_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`decision` text NOT NULL,
	`is_paper` integer DEFAULT true NOT NULL,
	`recommended` integer DEFAULT false NOT NULL,
	`horizon` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`relevance_score` integer DEFAULT 0 NOT NULL,
	`quality_score` integer DEFAULT 0 NOT NULL,
	`recommendation_tier` text DEFAULT 'browse' NOT NULL,
	`screening_reason` text DEFAULT '' NOT NULL,
	`provenance_json` text DEFAULT '[]' NOT NULL,
	`appearance_count` integer DEFAULT 1 NOT NULL,
	`allocated_input_tokens` integer DEFAULT 0 NOT NULL,
	`allocated_output_tokens` integer DEFAULT 0 NOT NULL,
	`reviewed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_job_id`) REFERENCES `monitor_scan_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recommendation_audit_job_paper` ON `recommendation_audit_events` (`scan_job_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_recommendation_audit_space_reviewed` ON `recommendation_audit_events` (`space_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_recommendation_audit_space_decision_reviewed` ON `recommendation_audit_events` (`space_id`,`decision`,`reviewed_at`);