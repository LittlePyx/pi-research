ALTER TABLE `monitor_runs` ADD `active_job_id` text;--> statement-breakpoint
ALTER TABLE `monitor_runs` ADD `lease_generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `request_key` text;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `failure_kind` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `failure_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `next_retry_at` text;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `last_success_stage` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `last_success_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `monitor_runs` SET `active_job_id` = (
 SELECT `job`.`id` FROM `monitor_scan_jobs` `job`
 WHERE `job`.`space_id` = `monitor_runs`.`space_id` AND `job`.`status` NOT IN ('ready', 'error')
 ORDER BY datetime(`job`.`started_at`) DESC, `job`.`id` DESC LIMIT 1
) WHERE `active_job_id` IS NULL AND EXISTS (
 SELECT 1 FROM `monitor_scan_jobs` `job`
 WHERE `job`.`space_id` = `monitor_runs`.`space_id` AND `job`.`status` NOT IN ('ready', 'error')
);--> statement-breakpoint
UPDATE `monitor_scan_jobs` SET `status` = 'error', `checkpoint` = 'retry_pending',
 `failure_kind` = 'superseded', `failure_source` = 'single-flight-migration',
 `error` = COALESCE(`error`, 'superseded_by_active_job'),
 `completed_at` = COALESCE(`completed_at`, CURRENT_TIMESTAMP), `updated_at` = CURRENT_TIMESTAMP
WHERE `status` NOT IN ('ready', 'error') AND EXISTS (
 SELECT 1 FROM `monitor_runs` `run` WHERE `run`.`space_id` = `monitor_scan_jobs`.`space_id`
  AND `run`.`active_job_id` IS NOT NULL AND `run`.`active_job_id` <> `monitor_scan_jobs`.`id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitor_scan_jobs_request_key` ON `monitor_scan_jobs` (`space_id`,`request_key`) WHERE "monitor_scan_jobs"."request_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_monitor_scan_jobs_retry_due` ON `monitor_scan_jobs` (`status`,`next_retry_at`,`space_id`);--> statement-breakpoint
PRAGMA optimize;
