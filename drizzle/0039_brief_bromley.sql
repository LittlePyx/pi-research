ALTER TABLE `monitor_scheduler_ticks` ADD `trigger_source` text DEFAULT 'cloudflare_cron' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scheduler_ticks` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `monitor_scheduler_ticks` ADD `lease_expires_at` text;--> statement-breakpoint
ALTER TABLE `monitor_scheduler_ticks` ADD `recovered_job_count` integer DEFAULT 0 NOT NULL;