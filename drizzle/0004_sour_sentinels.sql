ALTER TABLE `paper_insights` ADD `analysis_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `llm_recommended` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `llm_relevance_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `screening_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_paper_insights_space_recommended_quality` ON `paper_insights` (`space_id`,`llm_recommended`,`quality_score`);