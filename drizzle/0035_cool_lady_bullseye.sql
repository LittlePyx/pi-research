ALTER TABLE `paper_insights` ADD `verification_status` text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `verification_coverage_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `verification_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `verification_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendation_audit_events` ADD `verification_status` text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendation_audit_events` ADD `verification_coverage_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendation_audit_events` ADD `verification_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendation_audit_events` ADD `verification_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recommendation_audit_events` ADD `verification_output_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_action_runs` ADD `verification_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_action_runs` ADD `verification_coverage_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_action_runs` ADD `verification_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_action_runs` ADD `verification_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_action_runs` ADD `verification_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_action_runs` ADD `verification_output_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA optimize;
