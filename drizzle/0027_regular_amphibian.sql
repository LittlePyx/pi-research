ALTER TABLE `learning_paths` ADD `target_track_id` text REFERENCES research_tracks(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `idx_learning_paths_space_target_updated` ON `learning_paths` (`space_id`,`target_track_id`,`updated_at`);
