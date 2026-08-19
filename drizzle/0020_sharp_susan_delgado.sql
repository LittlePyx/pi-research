ALTER TABLE `monitor_discovery_coverage` ADD `route_id` text;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `exploration_role` text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitor_discovery_coverage` ADD `adaptive_score` integer DEFAULT 55 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_monitor_coverage_space_route` ON `monitor_discovery_coverage` (`space_id`,`route_id`,`last_scanned_at`);