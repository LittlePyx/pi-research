CREATE TABLE IF NOT EXISTS `research_map_evidence_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`track_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`scan_job_id` text,
	`map_role` text DEFAULT 'frontier' NOT NULL,
	`rationale_zh` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `research_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `research_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `monitored_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_job_id`) REFERENCES `monitor_scan_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "research_map_evidence_proposals_status_check" CHECK("research_map_evidence_proposals"."status" in ('pending', 'confirmed', 'dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_research_map_evidence_proposals_identity` ON `research_map_evidence_proposals` (`space_id`,`track_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_map_evidence_proposals_space_status` ON `research_map_evidence_proposals` (`space_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_research_map_evidence_proposals_paper_status` ON `research_map_evidence_proposals` (`paper_id`,`status`);--> statement-breakpoint
INSERT INTO `research_map_evidence_proposals`
 (`id`, `space_id`, `track_id`, `paper_id`, `scan_job_id`, `map_role`, `rationale_zh`, `rationale_en`,
  `confidence`, `status`, `decided_at`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), c.space_id, c.track_id, c.paper_id, NULL,
 COALESCE(tp.role, 'frontier'), COALESCE(NULLIF(tp.rationale_zh, ''), c.summary_zh, ''),
 COALESCE(NULLIF(tp.rationale_en, ''), c.summary_en, ''), MAX(c.confidence, i.llm_relevance_score),
 CASE
  WHEN f.feedback = 'not_relevant' THEN 'dismissed'
  WHEN COALESCE(f.saved, 0) = 1 OR f.feedback = 'relevant' OR r.status IN ('read', 'mastered', 'cited') THEN 'confirmed'
  ELSE 'pending'
 END,
 CASE
  WHEN f.feedback = 'not_relevant' OR COALESCE(f.saved, 0) = 1 OR f.feedback = 'relevant'
    OR r.status IN ('read', 'mastered', 'cited') THEN CURRENT_TIMESTAMP
  ELSE NULL
 END,
 c.created_at, CURRENT_TIMESTAMP
FROM research_map_changes c
JOIN monitored_papers p ON p.id = c.paper_id AND p.space_id = c.space_id
JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
 AND i.llm_recommended = 1 AND i.analysis_source = 'deepseek'
JOIN research_track_papers tp ON tp.track_id = c.track_id AND tp.space_id = c.space_id AND tp.canonical_id = p.canonical_id
LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
WHERE c.kind = 'new_evidence'
 -- Legacy monitor-created formal rows copied these exact LLM fields and were
 -- written in the same review transaction. Requiring all three independent
 -- fingerprints prevents a later scan from claiming an older manual or
 -- research-network node merely because it recommends the same paper.
 AND ((trim(c.summary_zh) <> '' AND trim(tp.rationale_zh) = trim(c.summary_zh))
   OR (trim(c.summary_en) <> '' AND trim(tp.rationale_en) = trim(c.summary_en)))
 AND ((trim(i.summary_zh) <> '' AND trim(tp.summary_zh) = trim(i.summary_zh))
   OR (trim(i.summary_en) <> '' AND trim(tp.summary_en) = trim(i.summary_en)))
 AND ABS(CAST(strftime('%s', tp.created_at) AS INTEGER) - CAST(strftime('%s', c.created_at) AS INTEGER)) <= 300
 AND EXISTS (
  SELECT 1 FROM recommendation_audit_events a
  WHERE a.space_id = c.space_id AND a.paper_id = c.paper_id AND a.recommended = 1
   AND ABS(CAST(strftime('%s', a.reviewed_at) AS INTEGER) - CAST(strftime('%s', c.created_at) AS INTEGER)) <= 300
 )
 -- Accepted network nodes and any node already participating in the verified
 -- paper graph are user-owned/established evidence and must never be downgraded.
 AND NOT EXISTS (
  SELECT 1 FROM research_network_candidates nc
  WHERE nc.space_id = c.space_id AND nc.canonical_id = p.canonical_id AND nc.status = 'accepted'
 )
 AND NOT EXISTS (
  SELECT 1 FROM research_paper_edges pe
  WHERE pe.space_id = c.space_id AND (pe.source_paper_id = tp.id OR pe.target_paper_id = tp.id)
 )
ON CONFLICT (`space_id`,`track_id`,`paper_id`) DO NOTHING;--> statement-breakpoint
DELETE FROM research_map_changes
WHERE kind = 'new_evidence' AND EXISTS (
 SELECT 1 FROM research_map_evidence_proposals ep
 WHERE ep.space_id = research_map_changes.space_id AND ep.track_id = research_map_changes.track_id
  AND ep.paper_id = research_map_changes.paper_id AND ep.status IN ('pending', 'dismissed')
);--> statement-breakpoint
DELETE FROM research_track_papers
WHERE EXISTS (
 SELECT 1 FROM research_map_evidence_proposals ep
 JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
 WHERE ep.space_id = research_track_papers.space_id AND ep.track_id = research_track_papers.track_id
  AND p.canonical_id = research_track_papers.canonical_id AND ep.status IN ('pending', 'dismissed')
);--> statement-breakpoint
UPDATE research_tracks
SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL, updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
 SELECT 1 FROM research_map_evidence_proposals ep
 WHERE ep.space_id = research_tracks.space_id AND ep.track_id = research_tracks.id
  AND ep.status IN ('pending', 'dismissed')
);--> statement-breakpoint
DELETE FROM monitor_query_plans
WHERE EXISTS (
 SELECT 1 FROM research_map_evidence_proposals ep
 WHERE ep.space_id = monitor_query_plans.space_id AND ep.status IN ('pending', 'dismissed')
);--> statement-breakpoint
UPDATE research_paper_network_states
SET status = 'idle', built_paper_count = 0, model = '', sources_json = '[]', error = NULL, updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
 SELECT 1 FROM research_map_evidence_proposals ep
 WHERE ep.space_id = research_paper_network_states.space_id AND ep.status IN ('pending', 'dismissed')
);--> statement-breakpoint
DELETE FROM research_network_expansion_states
WHERE EXISTS (
 SELECT 1 FROM research_map_evidence_proposals ep
 WHERE ep.space_id = research_network_expansion_states.space_id AND ep.status IN ('pending', 'dismissed')
);
