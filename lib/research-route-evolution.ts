export type ResearchRouteEvolutionStatus = "proposed" | "confirmed" | "dismissed" | "superseded";

/**
 * Confirmed, independently verified evidence becomes eligible for one
 * provisional route-version assessment only after the direction intelligence
 * has caught up. Successful proposals are deduplicated by their stored
 * revision; an evidence-grounded "no material change" result is remembered by
 * the reliability event so it is not repeatedly billed. Transient failures
 * retain the evidence and are retried after a short cooldown.
 */
export const SCHEDULED_RESEARCH_ROUTE_EVOLUTION_SQL = `WITH route_evolution_candidates AS (
 SELECT rt.id AS track_id, rt.space_id, space.owner_user_id,
  MAX(COALESCE(proposal.decided_at, proposal.updated_at)) AS evidence_updated_at,
  MAX(CASE WHEN revision.model <> 'system-baseline' THEN revision.created_at ELSE NULL END) AS revision_created_at
 FROM research_tracks rt
 JOIN research_spaces space ON space.id = rt.space_id
 JOIN monitor_runs run ON run.space_id = rt.space_id
 JOIN research_map_evidence_proposals proposal
  ON proposal.track_id = rt.id AND proposal.space_id = rt.space_id AND proposal.status = 'confirmed'
 JOIN paper_insights insight ON insight.paper_id = proposal.paper_id AND insight.space_id = proposal.space_id
 LEFT JOIN research_route_revisions revision ON revision.track_id = rt.id AND revision.space_id = rt.space_id
 WHERE rt.build_status IN ('ready', 'partial')
  AND COALESCE(rt.monitoring_status, 'active') = 'active'
  AND rt.intelligence_status = 'ready' AND rt.intelligence_updated_at IS NOT NULL
  AND insight.ever_recommended = 1
  AND insight.verification_status IN ('verified', 'revised')
  AND insight.verification_coverage_score >= 70
  AND space.owner_user_id LIKE 'anonymous:%'
  AND run.automation_paused_at IS NULL
  AND run.last_user_activity_at IS NOT NULL
  AND datetime(run.last_user_activity_at) > datetime('now', '-7 days')
 GROUP BY rt.id, rt.space_id, space.owner_user_id, rt.intelligence_updated_at
 HAVING datetime(rt.intelligence_updated_at) >= datetime(MAX(COALESCE(proposal.decided_at, proposal.updated_at)))
)
SELECT candidate.track_id, candidate.space_id, candidate.owner_user_id, candidate.evidence_updated_at
FROM route_evolution_candidates candidate
WHERE (candidate.revision_created_at IS NULL
 OR datetime(candidate.revision_created_at) <= datetime(candidate.evidence_updated_at))
 AND NOT EXISTS (
  SELECT 1 FROM monitor_reliability_events event
  WHERE event.space_id = candidate.space_id
   AND event.kind = 'research_route_evolution' AND event.stage = 'scheduled'
   AND json_extract(event.metadata_json, '$.trackId') = candidate.track_id
   AND (
    (event.outcome IN ('success', 'info')
     AND datetime(event.created_at) >= datetime(candidate.evidence_updated_at))
    OR (event.outcome IN ('degraded', 'failed')
     AND datetime(event.created_at) > datetime('now', '-30 minutes'))
   )
 )
ORDER BY datetime(candidate.evidence_updated_at) ASC
LIMIT ?`;

export type ResearchRouteEvolutionDraft = {
  titleZh?: string;
  titleEn?: string;
  summaryZh?: string;
  summaryEn?: string;
  rationaleZh?: string;
  rationaleEn?: string;
  searchQueries?: string[];
  confidence?: number;
  sourcePaperIds?: string[];
  sourceStatementIds?: string[];
};

export type ResearchRouteEvolutionBasis = {
  trackId: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  searchQueries: string[];
  evidence: Array<{
    paperId: string;
    decidedAt: string | null;
    updatedAt: string | null;
    readingStatus: string;
    readingUpdatedAt: string | null;
    memoryUpdatedAt: string | null;
  }>;
  synthesisRevision: string;
  statementIds: string[];
};

export type SanitizedResearchRouteEvolution = {
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
  searchQueries: string[];
  confidence: number;
  sourcePaperIds: string[];
  sourceStatementIds: string[];
};

function cleanText(value: unknown, limit: number) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function stableHash(values: string[]) {
  let first = 2166136261;
  let second = 2246822519;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    first = Math.imul(first ^ 31, 16777619);
    second = Math.imul(second ^ 127, 668265263);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function uniqueStrings(values: unknown, allowed?: Set<string>, limit = 8) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.flatMap((value) => {
    const normalized = cleanText(value, 320);
    return normalized && (!allowed || allowed.has(normalized)) ? [normalized] : [];
  }))).slice(0, limit);
}

export function safeResearchRouteQuery(value: unknown) {
  const query = cleanText(value, 220);
  if (query.length < 8 || /(?:^|\s)(?:site|filetype|url|doi|author):/i.test(query)) return "";
  if (["{", "}", "<", ">", "[", "]"].some((character) => query.includes(character))
    || /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(query)) return "";
  return query;
}

export function researchRouteEvolutionInputRevision(basis: ResearchRouteEvolutionBasis) {
  const evidence = basis.evidence.map((item) => [
    item.paperId,
    item.decidedAt || "",
    item.updatedAt || "",
    item.readingStatus,
    item.readingUpdatedAt || "",
    item.memoryUpdatedAt || "",
  ].join(":")).sort();
  const statements = [...basis.statementIds].sort();
  const fields = [
    basis.trackId,
    basis.synthesisRevision,
    ...evidence,
    ...statements,
  ];
  return `route-evolution-v1:${evidence.length}:${statements.length}:${stableHash(fields)}`;
}

export function sanitizeResearchRouteEvolution(
  draft: ResearchRouteEvolutionDraft,
  basis: Pick<ResearchRouteEvolutionBasis, "titleZh" | "titleEn" | "summaryZh" | "summaryEn" | "searchQueries">,
  allowedPaperIds: Set<string>,
  allowedStatementIds: Set<string>,
) {
  const sourcePaperIds = uniqueStrings(draft.sourcePaperIds, allowedPaperIds, 8);
  const sourceStatementIds = uniqueStrings(draft.sourceStatementIds, allowedStatementIds, 8);
  if (!sourcePaperIds.length) return null;

  const titleZh = cleanText(draft.titleZh, 180) || cleanText(basis.titleZh, 180);
  const titleEn = cleanText(draft.titleEn, 220) || cleanText(basis.titleEn, 220);
  const summaryZh = cleanText(draft.summaryZh, 1000);
  const summaryEn = cleanText(draft.summaryEn, 1400);
  const rationaleZh = cleanText(draft.rationaleZh, 900);
  const rationaleEn = cleanText(draft.rationaleEn, 1200);
  const searchQueries = Array.from(new Set((Array.isArray(draft.searchQueries) ? draft.searchQueries : [])
    .map(safeResearchRouteQuery).filter(Boolean))).slice(0, 4);
  if (!titleZh || !titleEn || summaryZh.length < 24 || summaryEn.length < 40 || !rationaleZh || !rationaleEn || !searchQueries.length) return null;

  const confidenceCap = Math.min(92, 64 + sourcePaperIds.length * 5 + Math.min(12, sourceStatementIds.length * 3));
  const confidence = Math.max(0, Math.min(confidenceCap, Math.round(Number(draft.confidence) || 0)));
  const previousQueries = basis.searchQueries.map(safeResearchRouteQuery).filter(Boolean);
  const changed = titleZh !== cleanText(basis.titleZh, 180)
    || titleEn !== cleanText(basis.titleEn, 220)
    || summaryZh !== cleanText(basis.summaryZh, 1000)
    || summaryEn !== cleanText(basis.summaryEn, 1400)
    || JSON.stringify(searchQueries) !== JSON.stringify(previousQueries);
  if (!changed) return null;
  return { titleZh, titleEn, summaryZh, summaryEn, rationaleZh, rationaleEn, searchQueries, confidence, sourcePaperIds, sourceStatementIds } satisfies SanitizedResearchRouteEvolution;
}

export function researchRouteEvolutionDecisionAllowed(status: ResearchRouteEvolutionStatus, inputRevision: string, currentRevision: string) {
  return status === "proposed" && Boolean(inputRevision) && inputRevision === currentRevision;
}
