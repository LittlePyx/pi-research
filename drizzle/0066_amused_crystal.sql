CREATE TABLE `personalization_pilot_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_hash` text NOT NULL,
	`source_commit` text NOT NULL,
	`case_id` text NOT NULL,
	`variant` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
