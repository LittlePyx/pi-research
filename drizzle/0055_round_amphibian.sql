PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_research_gap_discovery_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`purpose` text DEFAULT 'route' NOT NULL,
	`origin` text NOT NULL,
	`signal_revision` text NOT NULL,
	`query_text` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`queued_count` integer DEFAULT 0 NOT NULL,
	`source_status_json` text DEFAULT '[]' NOT NULL,
	`error` text,
	`next_retry_at` text,
	`lock_token` text,
	`lock_expires_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_gap_discovery_origin_check" CHECK("__new_research_gap_discovery_jobs"."origin" in ('direction', 'synthesis', 'problem')),
	CONSTRAINT "research_gap_discovery_status_check" CHECK("__new_research_gap_discovery_jobs"."status" in ('pending', 'running', 'retryable', 'ready', 'empty', 'degraded', 'superseded'))
);
--> statement-breakpoint
INSERT INTO `__new_research_gap_discovery_jobs`("id", "space_id", "track_id", "purpose", "origin", "signal_revision", "query_text", "status", "attempt_count", "queued_count", "source_status_json", "error", "next_retry_at", "lock_token", "lock_expires_at", "completed_at", "created_at", "updated_at") SELECT "id", "space_id", "track_id", "purpose", "origin", "signal_revision", "query_text", "status", "attempt_count", "queued_count", "source_status_json", "error", "next_retry_at", "lock_token", "lock_expires_at", "completed_at", "created_at", "updated_at" FROM `research_gap_discovery_jobs`;--> statement-breakpoint
DROP TABLE `research_gap_discovery_jobs`;--> statement-breakpoint
ALTER TABLE `__new_research_gap_discovery_jobs` RENAME TO `research_gap_discovery_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_gap_discovery_signal` ON `research_gap_discovery_jobs` (`space_id`,`track_id`,`purpose`,`signal_revision`);--> statement-breakpoint
CREATE INDEX `idx_research_gap_discovery_due` ON `research_gap_discovery_jobs` (`status`,`next_retry_at`,`lock_expires_at`,`attempt_count`);--> statement-breakpoint
CREATE INDEX `idx_research_gap_discovery_track_created` ON `research_gap_discovery_jobs` (`track_id`,`created_at`);