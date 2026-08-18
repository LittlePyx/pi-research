ALTER TABLE `research_tracks` ADD `intelligence_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `intelligence_updated_at` text;