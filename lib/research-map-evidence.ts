export type ResearchMapEvidenceProposalInput = {
  id?: string;
  spaceId: string;
  trackId: string;
  paperId: string;
  scanJobId?: string | null;
  mapRole?: string;
  rationaleZh: string;
  rationaleEn: string;
  confidence: number;
};

type EvidenceProposalRow = {
  id: string;
  proposal_order: number;
  track_id: string;
  paper_id: string;
  map_role: string;
  rationale_zh: string;
  rationale_en: string;
  confidence: number;
  status: "pending" | "confirmed" | "dismissed";
  canonical_id: string;
  doi: string | null;
  paper_title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  citation_count: number;
  summary_zh: string;
  summary_en: string;
  track_title_zh: string;
  track_title_en: string;
};

export const PERSISTENT_RESEARCH_MAP_ACCEPTANCE_ID_PREFIX = "network-accept:";

export type ResearchMapEvidenceDecision = {
  changed: number;
  trackIds: string[];
};

export type RouteGapResearchMapEvidenceInput = {
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
  abstractText: string;
  mapRole: string;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
  confidence: number;
  model: string;
};

type ConfirmedEvidenceSyncRow = {
  id: string;
  track_id: string;
  paper_id: string;
  map_role: string;
  rationale_zh: string;
  rationale_en: string;
  confidence: number;
  canonical_id: string;
  doi: string | null;
  paper_title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  citation_count: number;
  summary_zh: string;
  summary_en: string;
  track_title_zh: string;
  track_title_en: string;
};

function normalizedRole(role: string | undefined) {
  return role === "milestone" ? "milestone" : "frontier";
}

function normalizedConfidence(confidence: number) {
  return Math.max(0, Math.min(100, Math.round(Number(confidence) || 0)));
}

export function researchEvidenceHorizon(publishedAt: string | null, now = new Date()) {
  const published = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (!Number.isFinite(published)) return "years" as const;
  const ageDays = Math.max(0, (now.getTime() - published) / 86_400_000);
  if (ageDays <= 14) return "days" as const;
  if (ageDays <= 183) return "months" as const;
  return "years" as const;
}

export async function upsertPendingResearchMapEvidence(
  database: D1Database,
  inputs: ResearchMapEvidenceProposalInput[],
) {
  if (!inputs.length) return;
  const statements = inputs.flatMap((input) => [
    database.prepare(
      `UPDATE research_map_evidence_proposals SET status = 'dismissed', decided_at = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ? AND track_id <> ? AND status = 'pending'
       AND (
        NOT EXISTS (
          SELECT 1 FROM research_map_evidence_proposals target
          WHERE target.space_id = ? AND target.paper_id = ? AND target.track_id = ?
        )
        OR EXISTS (
          SELECT 1 FROM research_map_evidence_proposals target
          WHERE target.space_id = ? AND target.paper_id = ? AND target.track_id = ?
           AND (target.status <> 'dismissed' OR target.decided_at IS NULL)
        )
       )`,
    ).bind(
      input.spaceId, input.paperId, input.trackId,
      input.spaceId, input.paperId, input.trackId,
      input.spaceId, input.paperId, input.trackId,
    ),
    database.prepare(
      `UPDATE research_map_evidence_proposals SET status = 'dismissed', decided_at = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND track_id = ? AND paper_id = ? AND status = 'pending'
       AND EXISTS (
         SELECT 1 FROM research_track_papers tp JOIN monitored_papers mp
          ON mp.space_id = tp.space_id AND mp.canonical_id = tp.canonical_id
         WHERE tp.space_id = ? AND tp.track_id = ? AND mp.id = ?
       )`,
    ).bind(input.spaceId, input.trackId, input.paperId, input.spaceId, input.trackId, input.paperId),
    database.prepare(
      `INSERT INTO research_map_evidence_proposals
       (id, space_id, track_id, paper_id, scan_job_id, map_role, rationale_zh, rationale_en, confidence, status)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
       WHERE NOT EXISTS (
         SELECT 1 FROM research_track_papers tp JOIN monitored_papers mp
          ON mp.space_id = tp.space_id AND mp.canonical_id = tp.canonical_id
         WHERE tp.space_id = ? AND tp.track_id = ? AND mp.id = ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM research_map_evidence_proposals confirmed
         WHERE confirmed.space_id = ? AND confirmed.paper_id = ? AND confirmed.status = 'confirmed'
       )
       ON CONFLICT(space_id, track_id, paper_id) DO UPDATE SET
         scan_job_id = CASE WHEN research_map_evidence_proposals.status = 'pending'
          OR (research_map_evidence_proposals.status = 'dismissed' AND research_map_evidence_proposals.decided_at IS NULL)
          THEN excluded.scan_job_id ELSE research_map_evidence_proposals.scan_job_id END,
         map_role = CASE WHEN research_map_evidence_proposals.status = 'pending'
          OR (research_map_evidence_proposals.status = 'dismissed' AND research_map_evidence_proposals.decided_at IS NULL)
          THEN excluded.map_role ELSE research_map_evidence_proposals.map_role END,
         rationale_zh = CASE WHEN research_map_evidence_proposals.status = 'pending'
          OR (research_map_evidence_proposals.status = 'dismissed' AND research_map_evidence_proposals.decided_at IS NULL)
          THEN excluded.rationale_zh ELSE research_map_evidence_proposals.rationale_zh END,
         rationale_en = CASE WHEN research_map_evidence_proposals.status = 'pending'
          OR (research_map_evidence_proposals.status = 'dismissed' AND research_map_evidence_proposals.decided_at IS NULL)
          THEN excluded.rationale_en ELSE research_map_evidence_proposals.rationale_en END,
         confidence = CASE WHEN research_map_evidence_proposals.status = 'pending'
          OR (research_map_evidence_proposals.status = 'dismissed' AND research_map_evidence_proposals.decided_at IS NULL)
          THEN excluded.confidence ELSE research_map_evidence_proposals.confidence END,
         status = CASE WHEN research_map_evidence_proposals.status = 'dismissed'
          AND research_map_evidence_proposals.decided_at IS NULL THEN 'pending' ELSE research_map_evidence_proposals.status END,
         decided_at = CASE WHEN research_map_evidence_proposals.status = 'dismissed'
          AND research_map_evidence_proposals.decided_at IS NULL THEN NULL ELSE research_map_evidence_proposals.decided_at END,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      input.id || crypto.randomUUID(), input.spaceId, input.trackId, input.paperId, input.scanJobId || null,
      normalizedRole(input.mapRole), input.rationaleZh, input.rationaleEn, normalizedConfidence(input.confidence),
      input.spaceId, input.trackId, input.paperId,
      input.spaceId, input.paperId,
    ),
  ]);
  await database.batch(statements);
}

/** Persists a route-gap result as reviewable evidence, never as a formal map paper. */
export async function upsertRouteGapResearchMapEvidence(
  database: D1Database,
  spaceId: string,
  trackId: string,
  inputs: RouteGapResearchMapEvidenceInput[],
) {
  const uniqueInputs = Array.from(new Map(inputs.map((input) => [input.canonicalId, input])).values());
  if (!uniqueInputs.length) return { pendingCount: 0, paperIds: [] as string[] };

  await database.batch(uniqueInputs.map((input) => database.prepare(
    `INSERT INTO monitored_papers
     (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon, citation_count, relevance_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'route-gap', ?, ?, ?)
     ON CONFLICT(space_id, canonical_id) DO UPDATE SET
      doi = COALESCE(excluded.doi, monitored_papers.doi), title = excluded.title, authors = excluded.authors,
      venue = excluded.venue, url = excluded.url, published_at = excluded.published_at,
      horizon = excluded.horizon, citation_count = MAX(monitored_papers.citation_count, excluded.citation_count),
      relevance_score = MAX(monitored_papers.relevance_score, excluded.relevance_score), last_seen_at = CURRENT_TIMESTAMP`,
  ).bind(
    `route-gap:${crypto.randomUUID()}`, spaceId, input.canonicalId, input.doi, input.title, input.authors,
    input.venue, input.url, input.publishedAt, researchEvidenceHorizon(input.publishedAt),
    Math.max(0, Math.round(input.citationCount)), normalizedConfidence(input.confidence),
  )));

  const placeholders = uniqueInputs.map(() => "?").join(", ");
  const paperRows = await database.prepare(
    `SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${placeholders})`,
  ).bind(spaceId, ...uniqueInputs.map((input) => input.canonicalId)).all<{ id: string; canonical_id: string }>();
  const paperIdByCanonicalId = new Map(paperRows.results.map((row) => [row.canonical_id, row.id]));
  const persisted = uniqueInputs.flatMap((input) => {
    const paperId = paperIdByCanonicalId.get(input.canonicalId);
    return paperId ? [{ input, paperId }] : [];
  });
  if (!persisted.length) return { pendingCount: 0, paperIds: [] as string[] };

  await database.batch(persisted.map(({ input, paperId }) => database.prepare(
    `INSERT INTO paper_insights
     (paper_id, space_id, abstract_text, summary_zh, summary_en, why_read_zh, why_read_en,
      quality_score, analysis_source, analysis_model, llm_recommended, llm_relevance_score, screening_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'route-gap', ?, 1, ?, ?)
     ON CONFLICT(paper_id) DO UPDATE SET
      abstract_text = CASE WHEN LENGTH(excluded.abstract_text) > LENGTH(paper_insights.abstract_text)
       THEN excluded.abstract_text ELSE paper_insights.abstract_text END,
      summary_zh = excluded.summary_zh, summary_en = excluded.summary_en,
      why_read_zh = excluded.why_read_zh, why_read_en = excluded.why_read_en,
      quality_score = MAX(paper_insights.quality_score, excluded.quality_score),
      analysis_source = CASE WHEN paper_insights.analysis_source IN ('metadata', 'route-gap')
       THEN 'route-gap' ELSE paper_insights.analysis_source END,
      analysis_model = CASE WHEN paper_insights.analysis_source IN ('metadata', 'route-gap')
       THEN excluded.analysis_model ELSE paper_insights.analysis_model END,
      llm_recommended = MAX(paper_insights.llm_recommended, excluded.llm_recommended),
      llm_relevance_score = MAX(paper_insights.llm_relevance_score, excluded.llm_relevance_score),
      screening_reason = excluded.screening_reason, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    paperId, spaceId, input.abstractText, input.summaryZh, input.summaryEn, input.rationaleZh, input.rationaleEn,
    normalizedConfidence(input.confidence), input.model, normalizedConfidence(input.confidence), input.rationaleEn,
  )));

  await upsertPendingResearchMapEvidence(database, persisted.map(({ input, paperId }) => ({
    spaceId,
    trackId,
    paperId,
    mapRole: input.mapRole,
    rationaleZh: input.rationaleZh,
    rationaleEn: input.rationaleEn,
    confidence: normalizedConfidence(input.confidence),
  })));
  const paperIds = persisted.map((item) => item.paperId);
  const pending = await database.prepare(
    `SELECT COUNT(*) AS count FROM research_map_evidence_proposals
     WHERE space_id = ? AND track_id = ? AND status = 'pending'
      AND paper_id IN (${paperIds.map(() => "?").join(", ")})`,
  ).bind(spaceId, trackId, ...paperIds).first<{ count: number }>();
  return { pendingCount: Number(pending?.count || 0), paperIds };
}

async function evidenceRows(database: D1Database, spaceId: string, paperId: string) {
  const rows = await database.prepare(
    `SELECT ep.id, ep.rowid AS proposal_order, ep.track_id, ep.paper_id, ep.map_role, ep.rationale_zh, ep.rationale_en, ep.confidence, ep.status,
     p.canonical_id, p.doi, p.title AS paper_title, p.authors, p.venue, p.url, p.published_at, p.citation_count,
     COALESCE(i.summary_zh, '') AS summary_zh, COALESCE(i.summary_en, '') AS summary_en,
     t.title_zh AS track_title_zh, t.title_en AS track_title_en
     FROM research_map_evidence_proposals ep
     JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
     JOIN research_tracks t ON t.id = ep.track_id AND t.space_id = ep.space_id
     LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE ep.space_id = ? AND ep.paper_id = ?
     ORDER BY CASE ep.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, ep.rowid DESC`,
  ).bind(spaceId, paperId).all<EvidenceProposalRow>();
  return rows.results;
}

function activeEvidenceRow(rows: EvidenceProposalRow[]) {
  return rows[0] || null;
}

function isPersistentExplicitAcceptance(row: EvidenceProposalRow) {
  return row.status === "confirmed" && row.id.startsWith(PERSISTENT_RESEARCH_MAP_ACCEPTANCE_ID_PREFIX);
}

function invalidationStatements(database: D1Database, spaceId: string, trackIds: string[]) {
  const statements: D1PreparedStatement[] = trackIds.map((trackId) => database.prepare(
    `UPDATE research_tracks SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
  ).bind(trackId, spaceId));
  statements.push(
    database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date >= date('now')").bind(spaceId),
    database.prepare(
      `INSERT INTO research_paper_network_states (space_id, status, built_paper_count, model, sources_json, error, updated_at)
       VALUES (?, 'idle', 0, '', '[]', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'idle', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(spaceId),
  );
  return statements;
}

/**
 * Repairs formal map rows from the reviewed evidence ledger only. This is the
 * safe replacement for the legacy recommendation reconciler: pending model
 * proposals are never routed or promoted here, and no LLM call is involved.
 */
export async function reconcileConfirmedResearchMapEvidence(
  database: D1Database,
  spaceId: string,
): Promise<ResearchMapEvidenceDecision> {
  const rows = await database.prepare(
    `SELECT ep.id, ep.track_id, ep.paper_id, ep.map_role, ep.rationale_zh, ep.rationale_en, ep.confidence,
     p.canonical_id, p.doi, p.title AS paper_title, p.authors, p.venue, p.url, p.published_at, p.citation_count,
     COALESCE(i.summary_zh, '') AS summary_zh, COALESCE(i.summary_en, '') AS summary_en,
     t.title_zh AS track_title_zh, t.title_en AS track_title_en
     FROM research_map_evidence_proposals ep
     JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
     JOIN research_tracks t ON t.id = ep.track_id AND t.space_id = ep.space_id
     LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE ep.space_id = ? AND ep.status = 'confirmed'
      AND (
       NOT EXISTS (
        SELECT 1 FROM research_track_papers tp
        WHERE tp.space_id = ep.space_id AND tp.track_id = ep.track_id AND tp.canonical_id = p.canonical_id
       )
       OR NOT EXISTS (
        SELECT 1 FROM research_map_changes c
        WHERE c.space_id = ep.space_id AND c.track_id = ep.track_id AND c.paper_id = ep.paper_id
         AND c.kind = 'new_evidence'
       )
      )
     ORDER BY COALESCE(ep.decided_at, ep.updated_at) DESC, ep.rowid DESC
     LIMIT 24`,
  ).bind(spaceId).all<ConfirmedEvidenceSyncRow>();
  if (!rows.results.length) return { changed: 0, trackIds: [] };

  const statements: D1PreparedStatement[] = [];
  const trackIds = Array.from(new Set(rows.results.map((row) => row.track_id)));
  for (const row of rows.results) {
    statements.push(
      database.prepare(
        `INSERT INTO research_track_papers
         (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role,
          summary_zh, summary_en, rationale_zh, rationale_en, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          (SELECT COALESCE(MAX(position) + 1, 0) FROM research_track_papers WHERE track_id = ?))
         ON CONFLICT(track_id, canonical_id) DO UPDATE SET
          role = excluded.role,
          summary_zh = CASE WHEN excluded.summary_zh <> '' THEN excluded.summary_zh ELSE research_track_papers.summary_zh END,
          summary_en = CASE WHEN excluded.summary_en <> '' THEN excluded.summary_en ELSE research_track_papers.summary_en END,
          rationale_zh = CASE WHEN excluded.rationale_zh <> '' THEN excluded.rationale_zh ELSE research_track_papers.rationale_zh END,
          rationale_en = CASE WHEN excluded.rationale_en <> '' THEN excluded.rationale_en ELSE research_track_papers.rationale_en END`,
      ).bind(
        `proposal-track-paper:${row.id}`, row.track_id, spaceId, row.canonical_id, row.doi, row.paper_title,
        row.authors, row.venue, row.url, row.published_at, row.citation_count, normalizedRole(row.map_role),
        row.summary_zh, row.summary_en, row.rationale_zh, row.rationale_en, row.track_id,
      ),
      database.prepare(
        `INSERT INTO research_map_changes
         (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
         VALUES (?, ?, ?, ?, 'new_evidence', ?, ?, ?, ?, ?)
         ON CONFLICT(paper_id, track_id, kind) DO UPDATE SET
          title_zh = excluded.title_zh, title_en = excluded.title_en,
          summary_zh = excluded.summary_zh, summary_en = excluded.summary_en,
          confidence = excluded.confidence`,
      ).bind(
        `proposal-map-change:${row.id}`, spaceId, row.track_id, row.paper_id,
        `${row.track_title_zh}新增证据：${row.paper_title}`.slice(0, 420),
        `New evidence for ${row.track_title_en}: ${row.paper_title}`.slice(0, 520),
        row.rationale_zh, row.rationale_en, normalizedConfidence(row.confidence),
      ),
    );
  }
  statements.push(...invalidationStatements(database, spaceId, trackIds));
  await database.batch(statements);
  return { changed: rows.results.length, trackIds };
}

const decisionCtes = `WITH active AS (
  SELECT ep.* FROM research_map_evidence_proposals ep
  WHERE ep.space_id = ?1 AND ep.paper_id = ?2
  ORDER BY CASE ep.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, ep.rowid DESC
  LIMIT 1
), final_state AS (
  SELECT COALESCE(f.saved, 0) AS saved, COALESCE(f.feedback, '') AS feedback,
   COALESCE(r.status, 'unread') AS reading_status
  FROM monitored_papers p
  LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
  LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
  WHERE p.space_id = ?1 AND p.id = ?2
)`;

const finalStateAccepts = `final_state.feedback <> 'not_relevant'
 AND (final_state.saved = 1 OR final_state.feedback = 'relevant'
  OR final_state.reading_status IN ('read', 'mastered', 'cited'))`;
const finalStateDismisses = "final_state.feedback = 'not_relevant'";
const finalStateIsNeutral = `final_state.feedback <> 'not_relevant' AND final_state.saved = 0
 AND final_state.feedback <> 'relevant' AND final_state.reading_status NOT IN ('read', 'mastered', 'cited')`;
const activeDecisionChanges = `(
 (${finalStateAccepts} AND active.status <> 'confirmed')
 OR (${finalStateDismisses} AND active.status <> 'dismissed')
 OR (${finalStateIsNeutral} AND active.status <> 'pending'
  AND NOT (active.status = 'confirmed' AND active.id LIKE '${PERSISTENT_RESEARCH_MAP_ACCEPTANCE_ID_PREFIX}%'))
)`;

/**
 * Returns, but deliberately does not execute, the complete evidence reconciliation.
 * Callers can append these statements after their feedback/progress UPSERT in the
 * same D1 batch, so every predicate observes the transaction's final paper state.
 */
export function reconcileResearchMapEvidenceStatements(
  database: D1Database,
  spaceId: string,
  paperId: string,
) {
  const bind = (sql: string, id?: string) => database.prepare(sql).bind(...(id ? [spaceId, paperId, id] : [spaceId, paperId]));
  return [
    bind(
      `${decisionCtes}
       INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role,
        summary_zh, summary_en, rationale_zh, rationale_en, position)
       SELECT ?3, active.track_id, ?1, p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at,
        p.citation_count, CASE WHEN active.map_role = 'milestone' THEN 'milestone' ELSE 'frontier' END,
        COALESCE(i.summary_zh, ''), COALESCE(i.summary_en, ''), active.rationale_zh, active.rationale_en,
        (SELECT COALESCE(MAX(position) + 1, 0) FROM research_track_papers WHERE track_id = active.track_id)
       FROM active JOIN final_state
       JOIN monitored_papers p ON p.id = active.paper_id AND p.space_id = active.space_id
       LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
       WHERE active.status <> 'confirmed' AND ${finalStateAccepts}
       ON CONFLICT(track_id, canonical_id) DO UPDATE SET role = excluded.role,
        summary_zh = CASE WHEN excluded.summary_zh <> '' THEN excluded.summary_zh ELSE research_track_papers.summary_zh END,
        summary_en = CASE WHEN excluded.summary_en <> '' THEN excluded.summary_en ELSE research_track_papers.summary_en END,
        rationale_zh = excluded.rationale_zh, rationale_en = excluded.rationale_en`,
      `proposal-track-paper:${crypto.randomUUID()}`,
    ),
    bind(
      `${decisionCtes}
       INSERT INTO research_map_changes
       (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
       SELECT ?3, ?1, active.track_id, ?2, 'new_evidence',
        substr(t.title_zh || '新增证据：' || p.title, 1, 420),
        substr('New evidence for ' || t.title_en || ': ' || p.title, 1, 520),
        active.rationale_zh, active.rationale_en, MAX(0, MIN(100, active.confidence))
       FROM active JOIN final_state
       JOIN monitored_papers p ON p.id = active.paper_id AND p.space_id = active.space_id
       JOIN research_tracks t ON t.id = active.track_id AND t.space_id = active.space_id
       WHERE active.status <> 'confirmed' AND ${finalStateAccepts}
       ON CONFLICT(paper_id, track_id, kind) DO UPDATE SET title_zh = excluded.title_zh, title_en = excluded.title_en,
        summary_zh = excluded.summary_zh, summary_en = excluded.summary_en, confidence = excluded.confidence`,
      `proposal-map-change:${crypto.randomUUID()}`,
    ),
    bind(
      `${decisionCtes}
       DELETE FROM research_map_changes WHERE space_id = ?1 AND paper_id = ?2 AND kind = 'new_evidence'
        AND track_id = (SELECT track_id FROM active)
        AND EXISTS (SELECT 1 FROM active JOIN final_state WHERE
         (${finalStateDismisses} AND active.status <> 'dismissed')
         OR (${finalStateIsNeutral} AND active.status <> 'pending'
          AND NOT (active.status = 'confirmed' AND active.id LIKE '${PERSISTENT_RESEARCH_MAP_ACCEPTANCE_ID_PREFIX}%')))`,
    ),
    bind(
      `${decisionCtes}
       DELETE FROM research_track_papers WHERE space_id = ?1
        AND track_id = (SELECT track_id FROM active)
        AND canonical_id = (SELECT canonical_id FROM monitored_papers WHERE id = ?2 AND space_id = ?1)
        AND EXISTS (SELECT 1 FROM active JOIN final_state WHERE
         (${finalStateDismisses} AND active.status <> 'dismissed')
         OR (${finalStateIsNeutral} AND active.status <> 'pending'
          AND NOT (active.status = 'confirmed' AND active.id LIKE '${PERSISTENT_RESEARCH_MAP_ACCEPTANCE_ID_PREFIX}%')))`,
    ),
    bind(
      `${decisionCtes}
       UPDATE research_tracks SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT track_id FROM active) AND space_id = ?1
        AND EXISTS (SELECT 1 FROM active JOIN final_state WHERE ${activeDecisionChanges})`,
    ),
    bind(
      `${decisionCtes}
       DELETE FROM monitor_query_plans WHERE space_id = ?1 AND plan_date >= date('now')
        AND EXISTS (SELECT 1 FROM active JOIN final_state WHERE ${activeDecisionChanges})`,
    ),
    bind(
      `${decisionCtes}
       INSERT INTO research_paper_network_states
       (space_id, status, built_paper_count, model, sources_json, error, updated_at)
       SELECT ?1, 'idle', 0, '', '[]', NULL, CURRENT_TIMESTAMP
       WHERE EXISTS (SELECT 1 FROM active JOIN final_state WHERE ${activeDecisionChanges})
       ON CONFLICT(space_id) DO UPDATE SET status = 'idle', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ),
    bind(
      `${decisionCtes}
       UPDATE research_map_evidence_proposals SET status = 'confirmed',
        decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM active) AND space_id = ?1
        AND EXISTS (SELECT 1 FROM final_state WHERE ${finalStateAccepts})
        AND status <> 'confirmed'`,
    ),
    bind(
      `${decisionCtes}
       UPDATE research_map_evidence_proposals SET status = 'dismissed', decided_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM active) AND space_id = ?1
        AND EXISTS (SELECT 1 FROM final_state WHERE ${finalStateDismisses})
        AND status <> 'dismissed'`,
    ),
    bind(
      `${decisionCtes}
       UPDATE research_map_evidence_proposals SET status = 'pending', decided_at = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM active) AND space_id = ?1
        AND EXISTS (SELECT 1 FROM final_state WHERE ${finalStateIsNeutral})
        AND status <> 'pending'
        AND NOT (status = 'confirmed' AND id LIKE '${PERSISTENT_RESEARCH_MAP_ACCEPTANCE_ID_PREFIX}%')`,
    ),
  ];
}

export async function promoteResearchMapEvidence(
  database: D1Database,
  spaceId: string,
  paperId: string,
): Promise<ResearchMapEvidenceDecision> {
  const rows = await evidenceRows(database, spaceId, paperId);
  const row = activeEvidenceRow(rows);
  if (!row) return { changed: 0, trackIds: [] };
  const trackIds = [row.track_id];
  if (row.status === "confirmed") return { changed: 0, trackIds };
  const statements: D1PreparedStatement[] = [];
  statements.push(
      database.prepare(
        `INSERT INTO research_track_papers
         (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role,
          summary_zh, summary_en, rationale_zh, rationale_en, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          (SELECT COALESCE(MAX(position) + 1, 0) FROM research_track_papers WHERE track_id = ?))
         ON CONFLICT(track_id, canonical_id) DO UPDATE SET
          role = excluded.role,
          summary_zh = CASE WHEN excluded.summary_zh <> '' THEN excluded.summary_zh ELSE research_track_papers.summary_zh END,
          summary_en = CASE WHEN excluded.summary_en <> '' THEN excluded.summary_en ELSE research_track_papers.summary_en END,
          rationale_zh = CASE WHEN excluded.rationale_zh <> '' THEN excluded.rationale_zh ELSE research_track_papers.rationale_zh END,
          rationale_en = CASE WHEN excluded.rationale_en <> '' THEN excluded.rationale_en ELSE research_track_papers.rationale_en END`,
      ).bind(
        crypto.randomUUID(), row.track_id, spaceId, row.canonical_id, row.doi, row.paper_title, row.authors,
        row.venue, row.url, row.published_at, row.citation_count, normalizedRole(row.map_role), row.summary_zh,
        row.summary_en, row.rationale_zh, row.rationale_en, row.track_id,
      ),
      database.prepare(
        `INSERT INTO research_map_changes
         (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
         VALUES (?, ?, ?, ?, 'new_evidence', ?, ?, ?, ?, ?)
         ON CONFLICT(paper_id, track_id, kind) DO UPDATE SET
          title_zh = excluded.title_zh, title_en = excluded.title_en,
          summary_zh = excluded.summary_zh, summary_en = excluded.summary_en,
          confidence = excluded.confidence`,
      ).bind(
        crypto.randomUUID(), spaceId, row.track_id, paperId,
        `${row.track_title_zh}新增证据：${row.paper_title}`.slice(0, 420),
        `New evidence for ${row.track_title_en}: ${row.paper_title}`.slice(0, 520),
        row.rationale_zh, row.rationale_en, normalizedConfidence(row.confidence),
      ),
      database.prepare(
        `UPDATE research_map_evidence_proposals SET status = 'confirmed', decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
      ).bind(row.id, spaceId),
  );
  statements.push(...invalidationStatements(database, spaceId, trackIds));
  await database.batch(statements);
  return { changed: 1, trackIds };
}

export async function promoteAlreadyAcceptedResearchMapEvidence(
  database: D1Database,
  spaceId: string,
  paperIds: string[],
): Promise<ResearchMapEvidenceDecision> {
  const uniquePaperIds = Array.from(new Set(paperIds.filter(Boolean)));
  if (!uniquePaperIds.length) return { changed: 0, trackIds: [] };
  const accepted = await database.prepare(
    `SELECT DISTINCT p.id FROM monitored_papers p
     LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
     LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
     WHERE p.space_id = ? AND p.id IN (${uniquePaperIds.map(() => "?").join(", ")})
      AND (f.saved = 1 OR f.feedback = 'relevant' OR r.status IN ('read','mastered','cited'))`,
  ).bind(spaceId, ...uniquePaperIds).all<{ id: string }>();
  let changed = 0;
  const trackIds = new Set<string>();
  for (const row of accepted.results) {
    const result = await promoteResearchMapEvidence(database, spaceId, row.id);
    changed += result.changed;
    result.trackIds.forEach((trackId) => trackIds.add(trackId));
  }
  return { changed, trackIds: Array.from(trackIds) };
}

export async function dismissResearchMapEvidence(
  database: D1Database,
  spaceId: string,
  paperId: string,
): Promise<ResearchMapEvidenceDecision> {
  const rows = await evidenceRows(database, spaceId, paperId);
  const row = activeEvidenceRow(rows);
  if (!row || row.status === "dismissed") return { changed: 0, trackIds: [] };
  const trackIds = [row.track_id];
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `UPDATE research_map_evidence_proposals SET status = 'dismissed', decided_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
    ).bind(row.id, spaceId),
    database.prepare(
      "DELETE FROM research_map_changes WHERE space_id = ? AND track_id = ? AND paper_id = ? AND kind = 'new_evidence'",
    ).bind(spaceId, row.track_id, paperId),
    database.prepare(
      "DELETE FROM research_track_papers WHERE space_id = ? AND track_id = ? AND canonical_id = ?",
    ).bind(spaceId, row.track_id, row.canonical_id),
  ];
  statements.push(...invalidationStatements(database, spaceId, trackIds));
  await database.batch(statements);
  return { changed: 1, trackIds };
}

export async function resetResearchMapEvidenceToPending(
  database: D1Database,
  spaceId: string,
  paperId: string,
): Promise<ResearchMapEvidenceDecision> {
  const rows = await evidenceRows(database, spaceId, paperId);
  const row = activeEvidenceRow(rows);
  if (!row || row.status === "pending" || isPersistentExplicitAcceptance(row)) {
    return { changed: 0, trackIds: row ? [row.track_id] : [] };
  }
  const trackIds = [row.track_id];
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `UPDATE research_map_evidence_proposals SET status = 'pending', decided_at = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
    ).bind(row.id, spaceId),
    database.prepare(
      "DELETE FROM research_map_changes WHERE space_id = ? AND track_id = ? AND paper_id = ? AND kind = 'new_evidence'",
    ).bind(spaceId, row.track_id, paperId),
    database.prepare(
      "DELETE FROM research_track_papers WHERE space_id = ? AND track_id = ? AND canonical_id = ?",
    ).bind(spaceId, row.track_id, row.canonical_id),
  ];
  statements.push(...invalidationStatements(database, spaceId, trackIds));
  await database.batch(statements);
  return { changed: 1, trackIds };
}

export async function reconcileResearchMapEvidenceDecision(
  database: D1Database,
  spaceId: string,
  paperId: string,
) {
  const row = activeEvidenceRow(await evidenceRows(database, spaceId, paperId));
  if (!row) return { changed: 0, trackIds: [] };
  const state = await database.prepare(
    `SELECT COALESCE(f.saved, 0) AS saved, f.feedback, COALESCE(r.status, 'unread') AS reading_status
     FROM monitored_papers p
     LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
     LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
     WHERE p.id = ? AND p.space_id = ? LIMIT 1`,
  ).bind(paperId, spaceId).first<{ saved: number; feedback: string | null; reading_status: string }>();
  if (!state) return { changed: 0, trackIds: [] };
  const accepted = state.feedback !== "not_relevant"
    && Boolean(state.saved || state.feedback === "relevant" || ["read", "mastered", "cited"].includes(state.reading_status));
  const dismissed = state.feedback === "not_relevant";
  const shouldChange = accepted ? row.status !== "confirmed"
    : dismissed ? row.status !== "dismissed"
      : row.status !== "pending" && !isPersistentExplicitAcceptance(row);
  if (!shouldChange) return { changed: 0, trackIds: [row.track_id] };
  await database.batch(reconcileResearchMapEvidenceStatements(database, spaceId, paperId));
  return { changed: 1, trackIds: [row.track_id] };
}

export function confirmedExternalResearchMapEvidenceStatements(
  database: D1Database,
  input: ResearchMapEvidenceProposalInput & {
    paperCanonicalId?: string;
    paperTitle: string;
    trackTitleZh: string;
    trackTitleEn: string;
  },
) {
  const proposalId = input.id || crypto.randomUUID();
  const canonicalId = input.paperCanonicalId?.trim() || "";
  const paperLookup = canonicalId ? "p.canonical_id = ?2" : "p.id = ?2";
  const paperLookupValue = canonicalId || input.paperId;
  const supersededProposal = `ep.space_id = ?1 AND ${paperLookup} AND ep.track_id <> ?3
   AND ep.status IN ('pending', 'confirmed')`;
  const supersedeStatements = [
    database.prepare(
      `UPDATE research_tracks SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE space_id = ?1 AND id IN (
        SELECT ep.track_id FROM research_map_evidence_proposals ep
        JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
        WHERE ${supersededProposal}
       )`,
    ).bind(input.spaceId, paperLookupValue, input.trackId),
    database.prepare(
      `DELETE FROM research_map_changes AS change WHERE change.space_id = ?1 AND EXISTS (
        SELECT 1 FROM research_map_evidence_proposals ep
        JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
        WHERE ${supersededProposal} AND ep.track_id = change.track_id AND ep.paper_id = change.paper_id
         AND change.kind = 'new_evidence'
       )`,
    ).bind(input.spaceId, paperLookupValue, input.trackId),
    database.prepare(
      `DELETE FROM research_track_papers AS track_paper WHERE track_paper.space_id = ?1 AND EXISTS (
        SELECT 1 FROM research_map_evidence_proposals ep
        JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
        WHERE ${supersededProposal} AND ep.track_id = track_paper.track_id
         AND p.canonical_id = track_paper.canonical_id
       )`,
    ).bind(input.spaceId, paperLookupValue, input.trackId),
    database.prepare(
      `UPDATE research_map_evidence_proposals AS ep SET status = 'dismissed',
       decided_at = CASE WHEN ep.status = 'confirmed' THEN COALESCE(ep.decided_at, CURRENT_TIMESTAMP) ELSE NULL END,
       updated_at = CURRENT_TIMESTAMP WHERE ep.space_id = ?1 AND ep.track_id <> ?3
       AND ep.status IN ('pending', 'confirmed') AND EXISTS (
        SELECT 1 FROM monitored_papers p WHERE p.id = ep.paper_id AND p.space_id = ep.space_id AND ${paperLookup}
       )`,
    ).bind(input.spaceId, paperLookupValue, input.trackId),
  ];
  const proposalStatement = canonicalId
    ? database.prepare(
      `INSERT INTO research_map_evidence_proposals
       (id, space_id, track_id, paper_id, scan_job_id, map_role, rationale_zh, rationale_en, confidence, status, decided_at)
       SELECT ?, ?, ?, p.id, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP
       FROM monitored_papers p WHERE p.space_id = ? AND p.canonical_id = ?
       ON CONFLICT DO UPDATE SET id = excluded.id,
        scan_job_id = COALESCE(excluded.scan_job_id, research_map_evidence_proposals.scan_job_id),
        map_role = excluded.map_role, rationale_zh = excluded.rationale_zh, rationale_en = excluded.rationale_en,
        confidence = excluded.confidence, status = 'confirmed',
        decided_at = COALESCE(research_map_evidence_proposals.decided_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      proposalId, input.spaceId, input.trackId, input.scanJobId || null, normalizedRole(input.mapRole),
      input.rationaleZh, input.rationaleEn, normalizedConfidence(input.confidence), input.spaceId, canonicalId,
    )
    : database.prepare(
      `INSERT INTO research_map_evidence_proposals
       (id, space_id, track_id, paper_id, scan_job_id, map_role, rationale_zh, rationale_en, confidence, status, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)
       ON CONFLICT DO UPDATE SET id = excluded.id,
        scan_job_id = COALESCE(excluded.scan_job_id, research_map_evidence_proposals.scan_job_id),
        map_role = excluded.map_role, rationale_zh = excluded.rationale_zh, rationale_en = excluded.rationale_en,
        confidence = excluded.confidence, status = 'confirmed',
        decided_at = COALESCE(research_map_evidence_proposals.decided_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      proposalId, input.spaceId, input.trackId, input.paperId, input.scanJobId || null,
      normalizedRole(input.mapRole), input.rationaleZh, input.rationaleEn, normalizedConfidence(input.confidence),
    );
  const mapChangeStatement = canonicalId
    ? database.prepare(
      `INSERT INTO research_map_changes
       (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
       SELECT ?, ?, ?, p.id, 'new_evidence', ?, ?, ?, ?, ?
       FROM monitored_papers p WHERE p.space_id = ? AND p.canonical_id = ?
       ON CONFLICT(paper_id, track_id, kind) DO UPDATE SET title_zh = excluded.title_zh, title_en = excluded.title_en,
        summary_zh = excluded.summary_zh, summary_en = excluded.summary_en, confidence = excluded.confidence`,
    ).bind(
      `proposal-map-change:${proposalId}`, input.spaceId, input.trackId,
      `${input.trackTitleZh}新增证据：${input.paperTitle}`.slice(0, 420),
      `New evidence for ${input.trackTitleEn}: ${input.paperTitle}`.slice(0, 520),
      input.rationaleZh, input.rationaleEn, normalizedConfidence(input.confidence), input.spaceId, canonicalId,
    )
    : database.prepare(
      `INSERT INTO research_map_changes
       (id, space_id, track_id, paper_id, kind, title_zh, title_en, summary_zh, summary_en, confidence)
       VALUES (?, ?, ?, ?, 'new_evidence', ?, ?, ?, ?, ?)
       ON CONFLICT(paper_id, track_id, kind) DO UPDATE SET title_zh = excluded.title_zh, title_en = excluded.title_en,
        summary_zh = excluded.summary_zh, summary_en = excluded.summary_en, confidence = excluded.confidence`,
    ).bind(
      `proposal-map-change:${proposalId}`, input.spaceId, input.trackId, input.paperId,
      `${input.trackTitleZh}新增证据：${input.paperTitle}`.slice(0, 420),
      `New evidence for ${input.trackTitleEn}: ${input.paperTitle}`.slice(0, 520),
      input.rationaleZh, input.rationaleEn, normalizedConfidence(input.confidence),
    );
  return [
    ...supersedeStatements,
    proposalStatement,
    mapChangeStatement,
    database.prepare(
      `UPDATE research_tracks SET intelligence_json = '{}', intelligence_model = '', intelligence_updated_at = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
    ).bind(input.trackId, input.spaceId),
    database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date >= date('now')").bind(input.spaceId),
    database.prepare(
      `INSERT INTO research_paper_network_states (space_id, status, built_paper_count, model, sources_json, error, updated_at)
       VALUES (?, 'idle', 0, '', '[]', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'idle', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(input.spaceId),
  ];
}
