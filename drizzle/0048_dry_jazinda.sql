CREATE TABLE `external_source_throttles` (
	`source_key` text PRIMARY KEY NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`next_allowed_at` text,
	`last_status` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
