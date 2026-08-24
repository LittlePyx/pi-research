ALTER TABLE `monitor_scan_jobs` ADD `advance_lock_token` text;--> statement-breakpoint
ALTER TABLE `monitor_scan_jobs` ADD `advance_lock_expires_at` text;--> statement-breakpoint
UPDATE `monitor_runs`
SET `next_run_at` = CURRENT_TIMESTAMP,
    `automation_paused_at` = NULL,
    `automation_pause_reason` = '',
    `lock_token` = NULL,
    `lock_expires_at` = NULL,
    `updated_at` = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM `monitor_scan_jobs` job
  WHERE job.space_id = monitor_runs.space_id
    AND job.id = (
      SELECT latest.id FROM `monitor_scan_jobs` latest
      WHERE latest.space_id = monitor_runs.space_id
      ORDER BY latest.started_at DESC, latest.id DESC LIMIT 1
    )
    AND job.status = 'ready'
    AND json_array_length(COALESCE(json_extract(job.work_queue_json, '$.verificationDeferredIds'), '[]')) > 0
);
