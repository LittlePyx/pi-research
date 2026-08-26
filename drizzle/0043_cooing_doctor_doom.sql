ALTER TABLE `research_track_papers` ADD `curation_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_track_papers` ADD `curation_reason_code` text;--> statement-breakpoint
ALTER TABLE `research_track_papers` ADD `curation_reason_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_track_papers` ADD `curation_reason_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_track_papers` ADD `curation_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_track_papers` ADD `curation_evidence_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_track_papers` ADD `curation_updated_at` text;--> statement-breakpoint
CREATE INDEX `idx_research_track_papers_space_curation` ON `research_track_papers` (`space_id`,`curation_status`,`track_id`);--> statement-breakpoint
CREATE TABLE `research_track_paper_curation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`track_paper_id` text NOT NULL,
	`action` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_zh` text DEFAULT '' NOT NULL,
	`reason_en` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`actor_kind` text DEFAULT 'system' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_paper_id`) REFERENCES `research_track_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "track_paper_curation_events_action_check" CHECK("research_track_paper_curation_events"."action" in ('deactivated', 'reactivated'))
);--> statement-breakpoint
CREATE INDEX `idx_track_paper_curation_events_paper_created` ON `research_track_paper_curation_events` (`track_paper_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_track_paper_curation_events_space_created` ON `research_track_paper_curation_events` (`space_id`,`created_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `research_track_paper_curation_events`
 (`id`, `space_id`, `track_id`, `track_paper_id`, `action`, `reason_code`, `reason_zh`, `reason_en`, `source`, `actor_kind`, `evidence_json`, `created_at`)
SELECT 'migration-0043-selection-contradiction:' || paper.id, paper.space_id, paper.track_id, paper.id, 'deactivated',
 'selection_contradiction', '模型选择结果与其理由矛盾：理由明确表示该论文不相关或不应纳入。',
 'The model selection contradicted its rationale, which explicitly said the paper was unrelated or should not be included.',
 'system_model_selection_guard', 'system', json_array(json_object('kind', 'selection_rationale', 'zh', paper.rationale_zh, 'en', paper.rationale_en)), CURRENT_TIMESTAMP
FROM research_track_papers paper
WHERE paper.curation_status = 'active' AND NOT EXISTS (
 SELECT 1 FROM research_map_evidence_proposals proposal JOIN monitored_papers monitored
  ON monitored.id = proposal.paper_id AND monitored.space_id = proposal.space_id
 WHERE proposal.space_id = paper.space_id AND proposal.track_id = paper.track_id
  AND monitored.canonical_id = paper.canonical_id AND proposal.status = 'confirmed'
) AND (
 lower(paper.rationale_en) LIKE '%so it is rejected%'
 OR lower(paper.rationale_en) LIKE '%not selected%'
 OR lower(paper.rationale_en) LIKE '%should not be included%'
 OR (lower(paper.rationale_en) LIKE '%unrelated%' AND lower(paper.rationale_en) LIKE '%reject%')
 OR paper.rationale_zh LIKE '%不选入%' OR paper.rationale_zh LIKE '%不应纳入%'
 OR (paper.rationale_zh LIKE '%不相关%' AND paper.rationale_zh LIKE '%拒绝%')
);--> statement-breakpoint
UPDATE `research_track_papers` SET
 `curation_status` = 'deactivated',
 `curation_reason_code` = 'selection_contradiction',
 `curation_reason_zh` = '模型选择结果与其理由矛盾：理由明确表示该论文不相关或不应纳入。',
 `curation_reason_en` = 'The model selection contradicted its rationale, which explicitly said the paper was unrelated or should not be included.',
 `curation_source` = 'system_model_selection_guard',
 `curation_evidence_json` = json_array(json_object('kind', 'selection_rationale', 'zh', rationale_zh, 'en', rationale_en)),
 `curation_updated_at` = CURRENT_TIMESTAMP
WHERE id IN (
 SELECT track_paper_id FROM research_track_paper_curation_events
 WHERE id = 'migration-0043-selection-contradiction:' || research_track_papers.id
);--> statement-breakpoint
UPDATE `research_tracks` SET build_status = 'retryable', build_error = 'missing_visible_evidence',
 build_retry_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE build_status IN ('ready', 'partial') AND NOT EXISTS (
 SELECT 1 FROM research_track_papers paper WHERE paper.track_id = research_tracks.id
  AND paper.space_id = research_tracks.space_id AND paper.curation_status = 'active'
);--> statement-breakpoint
PRAGMA optimize;
