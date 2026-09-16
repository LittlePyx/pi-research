CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`delivery_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`subscription_id`) REFERENCES `email_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_delivery_date` ON `email_deliveries` (`subscription_id`,`delivery_date`);--> statement-breakpoint
CREATE TABLE `email_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`verified_at` text,
	`send_time` text DEFAULT '10:00' NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`locale` text DEFAULT 'zh' NOT NULL,
	`code_hash` text DEFAULT '' NOT NULL,
	`code_expires` integer DEFAULT 0 NOT NULL,
	`code_attempts` integer DEFAULT 0 NOT NULL,
	`verification_day` text DEFAULT '' NOT NULL,
	`verification_count` integer DEFAULT 0 NOT NULL,
	`verification_sent_at` integer DEFAULT 0 NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`next_send_at` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_subscription_space` ON `email_subscriptions` (`space_id`);--> statement-breakpoint
CREATE INDEX `idx_email_subscription_due` ON `email_subscriptions` (`enabled`,`next_send_at`);--> statement-breakpoint
CREATE TABLE `library_graph_checks` (
	`paper_id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`checked_at` text,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_library_graph_space` ON `library_graph_checks` (`space_id`);--> statement-breakpoint
CREATE TABLE `research_route_library` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`status` text NOT NULL,
	`category` text DEFAULT 'related' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_route_library_track_paper` ON `research_route_library` (`track_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `idx_route_library_space` ON `research_route_library` (`space_id`,`track_id`);