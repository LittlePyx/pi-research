ALTER TABLE `monitor_scheduler_ticks` ADD `previous_tick_at` text;--> statement-breakpoint
ALTER TABLE `monitor_scheduler_ticks` ADD `gap_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_scheduler_ticks` ADD `health_status` text DEFAULT 'healthy' NOT NULL;