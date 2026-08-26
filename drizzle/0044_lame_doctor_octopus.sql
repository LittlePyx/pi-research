CREATE TABLE `research_track_paper_precision_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`track_paper_id` text NOT NULL,
	`gate_version` text NOT NULL,
	`verdict` text NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`reason_zh` text DEFAULT '' NOT NULL,
	`reason_en` text DEFAULT '' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'shadow' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_paper_id`) REFERENCES `research_track_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "track_paper_precision_audits_verdict_check" CHECK("research_track_paper_precision_audits"."verdict" in ('direct', 'borderline', 'off_topic')),
	CONSTRAINT "track_paper_precision_audits_status_check" CHECK("research_track_paper_precision_audits"."status" in ('shadow', 'applied', 'superseded'))
);
--> statement-breakpoint
CREATE INDEX `idx_track_paper_precision_audits_paper_created` ON `research_track_paper_precision_audits` (`track_paper_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_track_paper_precision_audits_space_status` ON `research_track_paper_precision_audits` (`space_id`,`status`,`created_at`);