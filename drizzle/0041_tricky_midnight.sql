ALTER TABLE `research_tracks` ADD `build_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `build_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `build_source_status_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `build_error` text;--> statement-breakpoint
ALTER TABLE `research_tracks` ADD `build_retry_at` text;--> statement-breakpoint
UPDATE `research_tracks`
SET `build_status` = 'retryable',
    `build_error` = 'missing_visible_evidence'
WHERE `expansion_count` >= 0
  AND NOT EXISTS (
    SELECT 1 FROM `research_track_papers` paper
    WHERE paper.`track_id` = `research_tracks`.`id`
      AND paper.`space_id` = `research_tracks`.`space_id`
  );--> statement-breakpoint
UPDATE `research_tracks`
SET `build_status` = 'queued'
WHERE `expansion_count` < 0;
