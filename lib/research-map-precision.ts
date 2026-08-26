export const RESEARCH_ROUTE_PRECISION_GATE_VERSION = "semantic-v1";
export const RESEARCH_ROUTE_PRECISION_AUTO_DEACTIVATE_CONFIDENCE = 90;

export type ResearchRoutePrecisionVerdict = "direct" | "borderline" | "off_topic";

export type ResearchRoutePrecisionJudgment = {
  directionKey: string;
  canonicalId: string;
  verdict: ResearchRoutePrecisionVerdict;
  confidence: number;
  reasonZh: string;
  reasonEn: string;
  evidenceTerms: string[];
};

function cleanText(value: unknown, limit: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric <= 1 && numeric > 0 ? numeric * 100 : numeric)));
}

/**
 * Treat the precision audit as a fail-closed second opinion. A missing,
 * malformed, or duplicate judgment never promotes a route node.
 */
export function sanitizeResearchRoutePrecisionJudgments(
  raw: unknown,
  allowedIdentities: Set<string>,
): ResearchRoutePrecisionJudgment[] {
  if (!Array.isArray(raw)) return [];
  const judgments = new Map<string, ResearchRoutePrecisionJudgment>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const directionKey = cleanText(record.directionKey, 120);
    const canonicalId = cleanText(record.canonicalId, 500);
    const identity = `${directionKey}:${canonicalId}`;
    const verdict = cleanText(record.verdict, 24) as ResearchRoutePrecisionVerdict;
    const reasonZh = cleanText(record.reasonZh, 500);
    const reasonEn = cleanText(record.reasonEn, 700);
    if (!allowedIdentities.has(identity) || !["direct", "borderline", "off_topic"].includes(verdict)
      || !reasonZh || !reasonEn || judgments.has(identity)) continue;
    judgments.set(identity, {
      directionKey,
      canonicalId,
      verdict,
      confidence: boundedConfidence(record.confidence),
      reasonZh,
      reasonEn,
      evidenceTerms: Array.isArray(record.evidenceTerms)
        ? record.evidenceTerms.map((term) => cleanText(term, 100)).filter(Boolean).slice(0, 8)
        : [],
    });
  }
  return Array.from(judgments.values());
}

export function routePrecisionJudgmentIdentity(judgment: Pick<ResearchRoutePrecisionJudgment, "directionKey" | "canonicalId">) {
  return `${judgment.directionKey}:${judgment.canonicalId}`;
}

export function routePrecisionAcceptedForActiveNode(judgment: ResearchRoutePrecisionJudgment | undefined) {
  return judgment?.verdict === "direct" && judgment.confidence >= 60;
}

export function routePrecisionAutoDeactivates(judgment: ResearchRoutePrecisionJudgment | undefined) {
  return judgment?.verdict === "off_topic"
    && judgment.confidence >= RESEARCH_ROUTE_PRECISION_AUTO_DEACTIVATE_CONFIDENCE;
}

type StoredPrecisionAuditRow = {
  id: string;
  track_id: string;
  track_paper_id: string;
  verdict: ResearchRoutePrecisionVerdict;
  confidence: number;
  reason_zh: string;
  reason_en: string;
  evidence_json: string;
};

function parseEvidenceTerms(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => cleanText(item, 100)).filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export async function researchRoutePrecisionAuditProgress(database: D1Database, spaceId: string) {
  const row = await database.prepare(
    `WITH current_audits AS (
      SELECT audit.*, ROW_NUMBER() OVER (PARTITION BY audit.track_paper_id ORDER BY datetime(audit.created_at) DESC, audit.rowid DESC) AS audit_rank
      FROM research_track_paper_precision_audits audit
      JOIN research_track_papers paper ON paper.id = audit.track_paper_id AND paper.space_id = audit.space_id
      WHERE audit.space_id = ? AND audit.gate_version = ?
       AND datetime(audit.created_at) >= datetime(COALESCE(paper.curation_updated_at, paper.created_at))
     ), auditable_papers AS (
      SELECT paper.id FROM research_track_papers paper
      WHERE paper.space_id = ? AND paper.curation_status = 'active'
       AND NOT EXISTS (
        SELECT 1 FROM research_map_evidence_proposals proposal
        JOIN monitored_papers monitored ON monitored.id = proposal.paper_id AND monitored.space_id = proposal.space_id
        WHERE proposal.space_id = paper.space_id AND proposal.track_id = paper.track_id
         AND monitored.canonical_id = paper.canonical_id AND proposal.status = 'confirmed'
       )
     )
     SELECT
      (SELECT COUNT(*) FROM auditable_papers paper WHERE NOT EXISTS (
       SELECT 1 FROM current_audits audit WHERE audit.track_paper_id = paper.id AND audit.audit_rank = 1
      )) AS pending_count,
      (SELECT COUNT(*) FROM current_audits audit JOIN auditable_papers paper ON paper.id = audit.track_paper_id
       WHERE audit.audit_rank = 1 AND audit.status = 'shadow') AS shadow_count,
      (SELECT COUNT(*) FROM current_audits audit JOIN auditable_papers paper ON paper.id = audit.track_paper_id
       WHERE audit.audit_rank = 1 AND audit.status = 'shadow' AND audit.verdict = 'off_topic' AND audit.confidence >= 90) AS high_confidence_off_topic_count`,
  ).bind(spaceId, RESEARCH_ROUTE_PRECISION_GATE_VERSION, spaceId).first<Record<string, unknown>>();
  return {
    pending: Math.max(0, Number(row?.pending_count) || 0),
    shadow: Math.max(0, Number(row?.shadow_count) || 0),
    highConfidenceOffTopic: Math.max(0, Number(row?.high_confidence_off_topic_count) || 0),
  };
}

/**
 * Applies only high-confidence off-topic judgments that were already stored by
 * an earlier shadow pass. Confirmed evidence is excluded both by SQL and by the
 * curation guard; every paper and event remains durable and reversible.
 */
export async function applyStoredResearchRoutePrecisionAudits(database: D1Database, spaceId: string) {
  const stored = await database.prepare(
    `WITH latest AS (
      SELECT audit.*, ROW_NUMBER() OVER (PARTITION BY audit.track_paper_id ORDER BY datetime(audit.created_at) DESC, audit.rowid DESC) AS audit_rank
      FROM research_track_paper_precision_audits audit
      JOIN research_track_papers paper ON paper.id = audit.track_paper_id AND paper.space_id = audit.space_id
      WHERE audit.space_id = ? AND audit.gate_version = ? AND audit.status = 'shadow'
       AND datetime(audit.created_at) >= datetime(COALESCE(paper.curation_updated_at, paper.created_at))
     )
     SELECT latest.id, latest.track_id, latest.track_paper_id, latest.verdict, latest.confidence,
      latest.reason_zh, latest.reason_en, latest.evidence_json
     FROM latest JOIN research_track_papers paper ON paper.id = latest.track_paper_id AND paper.space_id = latest.space_id
     WHERE latest.audit_rank = 1 AND latest.verdict = 'off_topic' AND latest.confidence >= 90
      AND paper.curation_status = 'active' AND NOT EXISTS (
       SELECT 1 FROM research_map_evidence_proposals proposal
       JOIN monitored_papers monitored ON monitored.id = proposal.paper_id AND monitored.space_id = proposal.space_id
       WHERE proposal.space_id = paper.space_id AND proposal.track_id = paper.track_id
        AND monitored.canonical_id = paper.canonical_id AND proposal.status = 'confirmed'
      ) ORDER BY latest.confidence DESC, datetime(latest.created_at) ASC LIMIT 32`,
  ).bind(spaceId, RESEARCH_ROUTE_PRECISION_GATE_VERSION).all<StoredPrecisionAuditRow>();
  let appliedCount = 0;
  for (const audit of stored.results) {
    const result = await curateResearchTrackPaper(database, {
      spaceId,
      trackId: audit.track_id,
      paperId: audit.track_paper_id,
      status: "deactivated",
      reasonCode: "semantic_mismatch",
      source: "system_semantic_precision_guard",
      actorKind: "system",
      auditEvidence: [{
        kind: "independent_semantic_precision_audit",
        gateVersion: RESEARCH_ROUTE_PRECISION_GATE_VERSION,
        verdict: audit.verdict,
        confidence: audit.confidence,
        reasonZh: audit.reason_zh,
        reasonEn: audit.reason_en,
        evidenceTerms: parseEvidenceTerms(audit.evidence_json),
      }],
    });
    if (result.changed) appliedCount += 1;
    await database.prepare(
      "UPDATE research_track_paper_precision_audits SET status = 'applied', applied_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'shadow'",
    ).bind(audit.id).run();
    if (result.changed) await database.prepare(
      `UPDATE research_tracks SET build_status = CASE WHEN EXISTS (
        SELECT 1 FROM research_track_papers active_paper WHERE active_paper.track_id = research_tracks.id
         AND active_paper.space_id = research_tracks.space_id AND active_paper.curation_status = 'active'
       ) THEN 'partial' ELSE 'retryable' END,
       build_error = CASE WHEN NOT EXISTS (
        SELECT 1 FROM research_track_papers active_paper WHERE active_paper.track_id = research_tracks.id
         AND active_paper.space_id = research_tracks.space_id AND active_paper.curation_status = 'active'
       ) THEN 'missing_visible_evidence'
       WHEN EXISTS (
        SELECT 1 FROM research_track_paper_precision_audits boundary_audit
        JOIN research_track_papers boundary_paper ON boundary_paper.id = boundary_audit.track_paper_id
        WHERE boundary_audit.track_id = research_tracks.id AND boundary_audit.space_id = research_tracks.space_id
         AND boundary_audit.gate_version = ? AND boundary_audit.verdict = 'borderline'
         AND boundary_paper.curation_status = 'active'
         AND datetime(boundary_audit.created_at) >= datetime(COALESCE(boundary_paper.curation_updated_at, boundary_paper.created_at))
       ) THEN 'precision_boundary_pending' ELSE 'semantic_precision_curation_pending_refresh' END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
    ).bind(RESEARCH_ROUTE_PRECISION_GATE_VERSION, audit.track_id, spaceId).run();
  }
  return appliedCount;
}
import { curateResearchTrackPaper } from "./research-map-curation.ts";
