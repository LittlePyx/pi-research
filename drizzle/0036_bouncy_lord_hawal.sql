ALTER TABLE `paper_insights` ADD `proposed_recommendation_tier` text DEFAULT 'browse' NOT NULL;
--> statement-breakpoint
UPDATE `paper_insights` SET `proposed_recommendation_tier` = `recommendation_tier`
WHERE `recommendation_tier` = 'must_read';
--> statement-breakpoint
PRAGMA optimize;
