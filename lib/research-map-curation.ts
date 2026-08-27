export type ResearchTrackPaperCurationStatus = "active" | "deactivated";
export type ResearchTrackPaperCurationReasonCode =
  | "off_topic"
  | "duplicate"
  | "weak_evidence"
  | "misleading_role"
  | "selection_contradiction"
  | "semantic_mismatch"
  | "restored";

export type ResearchTrackPaperCurationResult = {
  changed: number;
  trackId: string;
  paperId: string;
  status: ResearchTrackPaperCurationStatus;
};

export class ResearchTrackPaperCurationError extends Error {
  code: "not_found" | "confirmed_evidence_protected" | "invalid_reason";

  constructor(code: "not_found" | "confirmed_evidence_protected" | "invalid_reason", message: string) {
    super(message);
    this.name = "ResearchTrackPaperCurationError";
    this.code = code;
  }
}

const REASON_COPY: Record<ResearchTrackPaperCurationReasonCode, { zh: string; en: string }> = {
  off_topic: { zh: "论文与这条研究路线缺少直接主题联系。", en: "The paper lacks a direct topical connection to this research route." },
  duplicate: { zh: "该节点与路线中已保留的论文重复。", en: "This node duplicates a paper already retained in the route." },
  weak_evidence: { zh: "现有摘要或结构化证据不足以支持它作为路线代表作。", en: "Available abstract or structured evidence is too weak for a representative route node." },
  misleading_role: { zh: "当前证据无法支持它在路线中的阶段定位。", en: "Current evidence does not support this paper's assigned stage in the route." },
  selection_contradiction: { zh: "模型选择结果与其理由矛盾：理由明确表示该论文不相关或不应纳入。", en: "The model selection contradicted its rationale, which explicitly said the paper was unrelated or should not be included." },
  semantic_mismatch: { zh: "独立语义复核确认该论文与这条研究路线存在明确主题错配。", en: "An independent semantic review found a clear topical mismatch with this research route." },
  restored: { zh: "人工复核后恢复为活跃路线节点。", en: "Restored as an active route node after review." },
};

export function researchTrackPaperCurationReason(reasonCode: ResearchTrackPaperCurationReasonCode) {
  return REASON_COPY[reasonCode];
}

/**
 * Rejects a structurally invalid model selection: the model returned a paper
 * in `selections` while its own rationale explicitly says not to include it.
 * This is deliberately narrow; nuanced topical judgment remains with the
 * quality model and user curation.
 */
export function routePaperSelectionContradiction(input: { rationaleZh?: string; rationaleEn?: string }) {
  const en = (input.rationaleEn || "").toLocaleLowerCase();
  const zh = (input.rationaleZh || "").replace(/\s+/g, "");
  return /\b(?:so|therefore|thus) (?:it |this (?:paper|work) )?(?:is |should be )?rejected\b/.test(en)
    || /\b(?:not selected|should not be (?:selected|included)|must be rejected)\b/.test(en)
    || (/\b(?:unrelated|no direct relevance|outside the (?:scope|direction))\b/.test(en)
      && /\b(?:reject|exclude|not (?:include|select))/.test(en))
    || /(?:因此|所以|应当|应该|予以)?(?:拒绝|不选入|不应纳入|不予纳入)/.test(zh)
    || (/(?:不相关|无直接关联|缺少直接相关)/.test(zh) && /(?:拒绝|排除|不纳入)/.test(zh));
}

/**
 * Keeps a paper reviewable when it has no provenance ledger (legacy data) or
 * at least one live source. A deactivated route source is ignored without
 * suppressing an independent journal, author, database, or other route source.
 */
export function activeResearchRouteSupplyPredicate(paperAlias = "p") {
  if (!/^[a-z_][a-z0-9_]*$/i.test(paperAlias)) throw new Error("Unsafe SQL alias");
  return `(
   NOT EXISTS (SELECT 1 FROM monitor_candidate_sources any_source
    WHERE any_source.space_id = ${paperAlias}.space_id AND any_source.paper_id = ${paperAlias}.id)
   OR EXISTS (
    SELECT 1 FROM monitor_candidate_sources active_source
    LEFT JOIN monitor_discovery_coverage active_coverage ON active_coverage.space_id = active_source.space_id
     AND active_coverage.horizon = ${paperAlias}.horizon AND active_coverage.source_key = active_source.source_key
     AND active_coverage.query_key = active_source.query_key
    WHERE active_source.space_id = ${paperAlias}.space_id AND active_source.paper_id = ${paperAlias}.id
     AND NOT EXISTS (
      SELECT 1 FROM research_track_papers inactive_route_paper
      WHERE inactive_route_paper.space_id = ${paperAlias}.space_id
       AND inactive_route_paper.canonical_id = ${paperAlias}.canonical_id
       AND inactive_route_paper.track_id = active_coverage.route_id
       AND inactive_route_paper.curation_status = 'deactivated'
     )
   )
  )`;
}

type CurationRow = {
  id: string;
  track_id: string;
  canonical_id: string;
  title: string;
  rationale_zh: string;
  rationale_en: string;
  curation_status: ResearchTrackPaperCurationStatus;
  track_title_zh: string;
  track_title_en: string;
  confirmed: number;
};

export async function curateResearchTrackPaper(database: D1Database, input: {
  spaceId: string;
  trackId: string;
  paperId: string;
  status: ResearchTrackPaperCurationStatus;
  reasonCode?: ResearchTrackPaperCurationReasonCode;
  source?: string;
  actorKind?: "user" | "system";
  auditEvidence?: Array<Record<string, unknown>>;
}): Promise<ResearchTrackPaperCurationResult> {
  const row = await database.prepare(
    `SELECT tp.id, tp.track_id, tp.canonical_id, tp.title, tp.rationale_zh, tp.rationale_en,
     tp.curation_status, track.title_zh AS track_title_zh, track.title_en AS track_title_en,
     CASE WHEN EXISTS (
      SELECT 1 FROM research_map_evidence_proposals proposal
      JOIN monitored_papers paper ON paper.id = proposal.paper_id AND paper.space_id = proposal.space_id
      WHERE proposal.space_id = tp.space_id AND proposal.track_id = tp.track_id
       AND paper.canonical_id = tp.canonical_id AND proposal.status = 'confirmed'
     ) THEN 1 ELSE 0 END AS confirmed
     FROM research_track_papers tp JOIN research_tracks track ON track.id = tp.track_id AND track.space_id = tp.space_id
     WHERE tp.id = ? AND tp.track_id = ? AND tp.space_id = ? LIMIT 1`,
  ).bind(input.paperId, input.trackId, input.spaceId).first<CurationRow>();
  if (!row) throw new ResearchTrackPaperCurationError("not_found", "Research route paper not found");
  if (input.status === "deactivated" && row.confirmed) {
    throw new ResearchTrackPaperCurationError("confirmed_evidence_protected", "Confirmed route evidence cannot be automatically deactivated");
  }
  if (row.curation_status === input.status) return { changed: 0, trackId: row.track_id, paperId: row.id, status: input.status };

  const reasonCode = input.status === "active" ? "restored" : input.reasonCode || "off_topic";
  if (!(reasonCode in REASON_COPY)) throw new ResearchTrackPaperCurationError("invalid_reason", "Unsupported curation reason");
  const reason = REASON_COPY[reasonCode];
  const source = (input.source || "user_route_curation").replace(/[^a-z0-9:_-]/gi, "").slice(0, 80) || "user_route_curation";
  const actorKind = input.actorKind === "system" ? "system" : "user";
  const evidence = JSON.stringify([
    { kind: "route", titleZh: row.track_title_zh, titleEn: row.track_title_en },
    { kind: "paper", canonicalId: row.canonical_id, title: row.title },
    ...(row.rationale_en || row.rationale_zh ? [{ kind: "selection_rationale", zh: row.rationale_zh, en: row.rationale_en }] : []),
    ...(input.auditEvidence || []).slice(0, 6),
  ]);

  await database.batch([
    database.prepare(
      `UPDATE research_track_papers SET curation_status = ?, curation_reason_code = ?, curation_reason_zh = ?,
       curation_reason_en = ?, curation_source = ?, curation_evidence_json = ?, curation_updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND track_id = ? AND space_id = ?`,
    ).bind(input.status, reasonCode, reason.zh, reason.en, source, evidence, row.id, row.track_id, input.spaceId),
    database.prepare(
      `INSERT INTO research_track_paper_curation_events
       (id, space_id, track_id, track_paper_id, action, reason_code, reason_zh, reason_en, source, actor_kind, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), input.spaceId, row.track_id, row.id, input.status === "active" ? "reactivated" : "deactivated",
      reasonCode, reason.zh, reason.en, source, actorKind, evidence),
    database.prepare(
      `UPDATE research_tracks SET
       build_status = CASE
        WHEN EXISTS (SELECT 1 FROM research_track_papers active_paper WHERE active_paper.track_id = research_tracks.id
          AND active_paper.space_id = research_tracks.space_id AND active_paper.curation_status = 'active')
         THEN CASE WHEN ? = 'active' AND build_status IN ('retryable','empty','failed') THEN 'partial' ELSE build_status END
        ELSE 'retryable' END,
       build_error = CASE
        WHEN NOT EXISTS (SELECT 1 FROM research_track_papers active_paper WHERE active_paper.track_id = research_tracks.id
          AND active_paper.space_id = research_tracks.space_id AND active_paper.curation_status = 'active') THEN 'missing_visible_evidence'
        WHEN ? = 'active' AND build_status IN ('retryable','empty','failed') THEN 'curation_restored_pending_refresh'
        ELSE build_error END,
       build_retry_at = CASE WHEN NOT EXISTS (
        SELECT 1 FROM research_track_papers active_paper WHERE active_paper.track_id = research_tracks.id
         AND active_paper.space_id = research_tracks.space_id AND active_paper.curation_status = 'active'
       ) OR (? = 'active' AND build_status IN ('retryable','empty','failed')) THEN CURRENT_TIMESTAMP ELSE build_retry_at END,
       intelligence_status = 'pending', intelligence_attempt_count = 0,
       intelligence_error = NULL, intelligence_retry_at = NULL, intelligence_lock_token = NULL,
       intelligence_lock_expires_at = NULL, intelligence_refresh_requested_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND space_id = ?`,
    ).bind(input.status, input.status, input.status, row.track_id, input.spaceId),
    database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date >= date('now')").bind(input.spaceId),
    database.prepare(
      `INSERT INTO research_paper_network_states (space_id, status, built_paper_count, model, sources_json, error, updated_at)
       VALUES (?, 'idle', 0, '', '[]', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'idle', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(input.spaceId),
  ]);
  return { changed: 1, trackId: row.track_id, paperId: row.id, status: input.status };
}
