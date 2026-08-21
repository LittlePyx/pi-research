CREATE TABLE `paper_evidence_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`evidence_level` text DEFAULT 'metadata' NOT NULL,
	`grounding_rate` integer DEFAULT 0 NOT NULL,
	`locator_coverage` integer DEFAULT 0 NOT NULL,
	`unsupported_claims` integer DEFAULT 0 NOT NULL,
	`abstract_conflict_count` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `paper_evidence_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_evidence_audits_document` ON `paper_evidence_audits` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_paper_evidence_audits_space_level` ON `paper_evidence_audits` (`space_id`,`evidence_level`,`created_at`);--> statement-breakpoint
CREATE TABLE `paper_evidence_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`kind` text NOT NULL,
	`claim_zh` text DEFAULT '' NOT NULL,
	`claim_en` text DEFAULT '' NOT NULL,
	`evidence_quote` text DEFAULT '' NOT NULL,
	`section_label` text DEFAULT '' NOT NULL,
	`locator` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`grounded` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `paper_evidence_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_evidence_claims_document_position` ON `paper_evidence_claims` (`document_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_paper_evidence_claims_paper_kind` ON `paper_evidence_claims` (`paper_id`,`kind`);--> statement-breakpoint
CREATE TABLE `paper_evidence_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`evidence_level` text DEFAULT 'metadata' NOT NULL,
	`source_kind` text DEFAULT 'metadata' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`license` text DEFAULT '' NOT NULL,
	`text_hash` text DEFAULT '' NOT NULL,
	`extracted_chars` integer DEFAULT 0 NOT NULL,
	`section_count` integer DEFAULT 0 NOT NULL,
	`claim_count` integer DEFAULT 0 NOT NULL,
	`grounded_claim_count` integer DEFAULT 0 NOT NULL,
	`unsupported_claim_count` integer DEFAULT 0 NOT NULL,
	`coverage_score` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`error` text,
	`lock_token` text,
	`lock_expires_at` text,
	`fetched_at` text,
	`analyzed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_evidence_documents_space_paper` ON `paper_evidence_documents` (`space_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_paper_evidence_documents_space_status` ON `paper_evidence_documents` (`space_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
