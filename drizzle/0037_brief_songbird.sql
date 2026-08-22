ALTER TABLE `paper_insights` ADD `ever_recommended` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `first_recommended_at` text;--> statement-breakpoint
ALTER TABLE `paper_insights` ADD `last_recommended_at` text;--> statement-breakpoint
UPDATE `paper_insights` SET
  `ever_recommended` = 1,
  `llm_recommended` = 1,
  `analysis_source` = 'deepseek',
  `analysis_model` = COALESCE((
    SELECT audit.model FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
  ), analysis_model),
  `llm_relevance_score` = MAX(llm_relevance_score, COALESCE((
    SELECT MAX(audit.relevance_score) FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1
  ), 0)),
  `quality_score` = MAX(quality_score, COALESCE((
    SELECT MAX(audit.quality_score) FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1
  ), 0)),
  `proposed_recommendation_tier` = COALESCE((
    SELECT audit.recommendation_tier FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
  ), proposed_recommendation_tier),
  `recommendation_tier` = COALESCE((
    SELECT audit.recommendation_tier FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
  ), recommendation_tier),
  `verification_status` = COALESCE((
    SELECT audit.verification_status FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
  ), verification_status),
  `first_recommended_at` = (
    SELECT MIN(audit.reviewed_at) FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1
  ),
  `last_recommended_at` = (
    SELECT MAX(audit.reviewed_at) FROM recommendation_audit_events audit
    WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
      AND audit.recommended = 1
  )
WHERE EXISTS (
  SELECT 1 FROM recommendation_audit_events audit
  WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
    AND audit.recommended = 1
);--> statement-breakpoint
CREATE INDEX `idx_paper_insights_space_recommendation_history` ON `paper_insights` (`space_id`,`ever_recommended`,`last_recommended_at`);
