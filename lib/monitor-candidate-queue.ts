export type MonitorCandidateHorizon = "days" | "months" | "years";
export type MonitorCandidateChannel = "topic" | "journal" | "author" | "semantic" | "preprint" | "citation";

export type MonitorCandidateProvenance = {
  sourceKey: string;
  channel: MonitorCandidateChannel;
  queryKey: string;
  queryText?: string;
  routeId?: string;
  appearances?: number;
};

export type MonitorCandidateInput = {
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  abstractText: string;
  horizon: MonitorCandidateHorizon;
  citationCount: number;
  relevanceScore: number;
  qualityScore: number;
  priorityVenue: boolean;
  source: string;
  provenance: MonitorCandidateProvenance[];
};

export type MonitorCandidateQueueResult = {
  candidateCount: number;
  newCandidateCount: number;
  queuedForReviewCount: number;
  reviewingCount: number;
  recommendedCount: number;
  alreadyReviewedCount: number;
  canonicalIds: string[];
};

type QueueOptions = {
  /** Route/network discovery records its query scope here so later review keeps track provenance. */
  recordDiscoveryCoverage?: boolean;
};

type PersistedPaperRow = {
  id: string;
  canonical_id: string;
};

type ExistingIdentityRow = PersistedPaperRow & {
  doi: string | null;
  title: string;
  authors: string;
  published_at: string | null;
};

type InsightStageRow = {
  canonical_id: string;
  analysis_source: string;
  analysis_model: string;
  llm_recommended: number;
};

const MAX_BATCH_SIZE = 70;
const TITLE_IDENTITY_LOOKUP_BATCH_SIZE = 16;
const TITLE_IDENTITY_LOOKUP_TOKEN_LIMIT = 160;
const TITLE_IDENTITY_LOOKUP_TOKENS_PER_TITLE = 2;

/**
 * Current route-pipeline workload plus the durable history of recommendations
 * that originated from a route. Explicitly dismissed papers leave the live
 * queue immediately, while recommendation audit history remains intact.
 */
export const RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL = `WITH queue_counts AS (
  SELECT coverage.route_id AS track_id,
   COUNT(DISTINCT CASE WHEN i.analysis_source = 'metadata' OR i.analysis_model = '' THEN cs.paper_id END) AS queued_count,
   COUNT(DISTINCT CASE WHEN i.analysis_source = 'deepseek_screened' THEN cs.paper_id END) AS reviewing_count,
   MAX(cs.last_seen_at) AS last_queued_at
  FROM monitor_candidate_sources cs
  JOIN monitored_papers p ON p.id = cs.paper_id AND p.space_id = cs.space_id
  JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
  JOIN monitor_discovery_coverage coverage ON coverage.space_id = cs.space_id AND coverage.horizon = p.horizon
   AND coverage.source_key = cs.source_key AND coverage.query_key = cs.query_key
  WHERE cs.space_id = ? AND COALESCE(coverage.route_id, '') <> ''
   AND NOT EXISTS (
    SELECT 1 FROM research_track_papers inactive_route_paper
    WHERE inactive_route_paper.space_id = cs.space_id
     AND inactive_route_paper.track_id = coverage.route_id
     AND inactive_route_paper.canonical_id = p.canonical_id
     AND inactive_route_paper.curation_status = 'deactivated'
   )
   AND NOT EXISTS (
    SELECT 1 FROM paper_feedback dismissed
    WHERE dismissed.space_id = cs.space_id AND dismissed.paper_id = cs.paper_id
     AND dismissed.feedback = 'not_relevant'
   )
  GROUP BY coverage.route_id
 ), latest_recommended AS (
  SELECT * FROM (
   SELECT audit.*,
    ROW_NUMBER() OVER (PARTITION BY audit.space_id, audit.paper_id ORDER BY audit.reviewed_at DESC, audit.rowid DESC) AS audit_rank
   FROM recommendation_audit_events audit
   WHERE audit.space_id = ?
  ) WHERE audit_rank = 1 AND recommended = 1
 ), recommended_counts AS (
  SELECT json_extract(origin.value, '$.routeId') AS track_id,
   COUNT(DISTINCT audit.paper_id) AS recommended_count
  FROM latest_recommended audit
  JOIN json_each(audit.provenance_json) origin
  WHERE json_extract(origin.value, '$.routeId') IS NOT NULL
   AND json_extract(origin.value, '$.originKind') IN
    ('route_foundation', 'route_milestone', 'route_frontier', 'route_gap', 'route_synthesis', 'route_network', 'route_search')
  GROUP BY json_extract(origin.value, '$.routeId')
 ), track_ids AS (
  SELECT track_id FROM queue_counts UNION SELECT track_id FROM recommended_counts
 )
 SELECT track_ids.track_id,
  COALESCE(queue_counts.queued_count, 0) AS queued_count,
  COALESCE(queue_counts.reviewing_count, 0) AS reviewing_count,
  COALESCE(recommended_counts.recommended_count, 0) AS recommended_count,
  queue_counts.last_queued_at
 FROM track_ids
 LEFT JOIN queue_counts ON queue_counts.track_id = track_ids.track_id
 LEFT JOIN recommended_counts ON recommended_counts.track_id = track_ids.track_id`;

/**
 * Workspace-wide route funnel counts. Every paper is counted once even when
 * the same discovery supports several routes; per-route attribution remains
 * available through RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL.
 */
export const RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL = `WITH route_candidates AS (
  SELECT DISTINCT cs.space_id, cs.paper_id, i.analysis_source, i.analysis_model
  FROM monitor_candidate_sources cs
  JOIN monitored_papers p ON p.id = cs.paper_id AND p.space_id = cs.space_id
  JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
  JOIN monitor_discovery_coverage coverage ON coverage.space_id = cs.space_id AND coverage.horizon = p.horizon
   AND coverage.source_key = cs.source_key AND coverage.query_key = cs.query_key
  WHERE cs.space_id = ? AND COALESCE(coverage.route_id, '') <> ''
   AND NOT EXISTS (
    SELECT 1 FROM research_track_papers inactive_route_paper
    WHERE inactive_route_paper.space_id = cs.space_id
     AND inactive_route_paper.track_id = coverage.route_id
     AND inactive_route_paper.canonical_id = p.canonical_id
     AND inactive_route_paper.curation_status = 'deactivated'
   )
   AND NOT EXISTS (
    SELECT 1 FROM paper_feedback dismissed
    WHERE dismissed.space_id = cs.space_id AND dismissed.paper_id = cs.paper_id
     AND dismissed.feedback = 'not_relevant'
   )
 ), latest_audits AS (
  SELECT * FROM (
   SELECT audit.*,
    ROW_NUMBER() OVER (PARTITION BY audit.space_id, audit.paper_id ORDER BY audit.reviewed_at DESC, audit.rowid DESC) AS audit_rank
   FROM recommendation_audit_events audit WHERE audit.space_id = ?
  ) WHERE audit_rank = 1
 ), route_recommended AS (
  SELECT DISTINCT audit.space_id, audit.paper_id
  FROM latest_audits audit JOIN json_each(audit.provenance_json) origin
  WHERE audit.recommended = 1 AND COALESCE(json_extract(origin.value, '$.routeId'), '') <> ''
   AND json_extract(origin.value, '$.originKind') IN
    ('route_foundation', 'route_milestone', 'route_frontier', 'route_gap', 'route_synthesis', 'route_network', 'route_search')
 )
 SELECT
  (SELECT COUNT(*) FROM route_candidates) AS discovered_count,
  (SELECT COUNT(*) FROM route_candidates
   WHERE analysis_source = 'metadata' OR analysis_model = '') AS queued_count,
  (SELECT COUNT(*) FROM route_candidates
   WHERE analysis_source = 'deepseek_screened') AS reviewing_count,
  (SELECT COUNT(*) FROM route_candidates candidate WHERE EXISTS (
   SELECT 1 FROM recommendation_audit_events review
   WHERE review.space_id = candidate.space_id AND review.paper_id = candidate.paper_id AND review.is_paper = 1
  )) AS deep_reviewed_count,
  (SELECT COUNT(*) FROM route_recommended) AS recommended_count,
  (SELECT COUNT(*) FROM route_recommended recommendation WHERE EXISTS (
   SELECT 1 FROM paper_feedback feedback
   WHERE feedback.space_id = recommendation.space_id AND feedback.paper_id = recommendation.paper_id
    AND (feedback.feedback = 'relevant' OR feedback.saved = 1)
  )) AS accepted_count,
  (SELECT COUNT(DISTINCT proposal.paper_id) FROM research_map_evidence_proposals proposal
   WHERE proposal.space_id = ? AND proposal.status = 'confirmed') AS confirmed_evidence_count,
  (SELECT COUNT(DISTINCT proposal.paper_id) FROM research_map_evidence_proposals proposal
   WHERE proposal.space_id = ? AND proposal.status = 'pending') AS pending_evidence_count`;

/**
 * User-facing route health is derived from the durable discovery ledger and
 * formal recommendation history. It intentionally excludes token, failure,
 * and model-audit details: researchers need to know whether a route is
 * producing useful reading, not how the internal machinery is graded.
 */
export const RESEARCH_ROUTE_DISCOVERY_EFFECT_SQL = `WITH route_coverage AS (
  SELECT * FROM monitor_discovery_coverage
  WHERE space_id = ? AND COALESCE(route_id, '') <> ''
 ), coverage_effects AS (
  SELECT route_id AS track_id,
   SUM(attempt_count) AS attempt_count,
   SUM(CASE WHEN source_key = 'research-route:frontier'
     OR (source_key LIKE 'crossref:route:%' AND source_key NOT LIKE 'crossref:route-gap:%' AND horizon IN ('days', 'months'))
     THEN attempt_count ELSE 0 END) AS frontier_attempts,
   SUM(CASE WHEN source_key = 'research-route:foundation'
     OR (source_key LIKE 'crossref:route:%' AND source_key NOT LIKE 'crossref:route-gap:%' AND horizon = 'years')
     THEN attempt_count ELSE 0 END) AS foundation_attempts,
   SUM(CASE WHEN source_key = 'research-route:gap' OR source_key LIKE 'crossref:route-gap:%'
     THEN attempt_count ELSE 0 END) AS gap_attempts,
   SUM(CASE WHEN source_key = 'research-route:network'
     OR (channel = 'citation' AND source_key LIKE 'semantic_scholar:%')
     THEN attempt_count ELSE 0 END) AS network_attempts,
   MAX(last_scanned_at) AS last_scanned_at
  FROM route_coverage GROUP BY route_id
 ), route_candidates AS (
  SELECT DISTINCT coverage.space_id, coverage.route_id AS track_id, candidate.paper_id
  FROM route_coverage coverage
  JOIN monitor_candidate_sources candidate ON candidate.space_id = coverage.space_id
   AND candidate.source_key = coverage.source_key AND candidate.query_key = coverage.query_key
  JOIN monitored_papers paper ON paper.id = candidate.paper_id AND paper.space_id = candidate.space_id
   AND paper.horizon = coverage.horizon
 ), latest_audits AS (
  SELECT * FROM (
   SELECT audit.*,
    ROW_NUMBER() OVER (PARTITION BY audit.space_id, audit.paper_id ORDER BY audit.reviewed_at DESC, audit.rowid DESC) AS audit_rank
   FROM recommendation_audit_events audit WHERE audit.space_id = ?
  ) WHERE audit_rank = 1
 ), route_reviews AS (
  SELECT candidate.track_id,
   COUNT(DISTINCT candidate.paper_id) AS discovered_count,
   COUNT(DISTINCT CASE WHEN EXISTS (
    SELECT 1 FROM recommendation_audit_events review
    WHERE review.space_id = candidate.space_id
     AND review.paper_id = candidate.paper_id AND review.is_paper = 1
   ) THEN candidate.paper_id END) AS deep_reviewed_count
  FROM route_candidates candidate GROUP BY candidate.track_id
 ), recommended_routes AS (
  SELECT DISTINCT audit.space_id, audit.paper_id, json_extract(origin.value, '$.routeId') AS track_id
  FROM latest_audits audit JOIN json_each(audit.provenance_json) origin
  WHERE audit.recommended = 1 AND COALESCE(json_extract(origin.value, '$.routeId'), '') <> ''
   AND json_extract(origin.value, '$.originKind') IN
    ('route_foundation', 'route_milestone', 'route_frontier', 'route_gap', 'route_synthesis', 'route_network', 'route_search')
 ), route_outcomes AS (
  SELECT recommendation.track_id,
   COUNT(DISTINCT recommendation.paper_id) AS recommended_count,
   COUNT(DISTINCT CASE WHEN feedback.feedback = 'relevant' OR feedback.saved = 1 THEN recommendation.paper_id END) AS accepted_count
  FROM recommended_routes recommendation
  LEFT JOIN paper_feedback feedback ON feedback.paper_id = recommendation.paper_id
   AND feedback.space_id = recommendation.space_id
  GROUP BY recommendation.track_id
 ), track_ids AS (
  SELECT track_id FROM coverage_effects UNION SELECT track_id FROM route_reviews UNION SELECT track_id FROM route_outcomes
 )
 SELECT track_ids.track_id,
  COALESCE(coverage.attempt_count, 0) AS attempt_count,
  COALESCE(coverage.frontier_attempts, 0) AS frontier_attempts,
  COALESCE(coverage.foundation_attempts, 0) AS foundation_attempts,
  COALESCE(coverage.gap_attempts, 0) AS gap_attempts,
  COALESCE(coverage.network_attempts, 0) AS network_attempts,
  COALESCE(reviews.discovered_count, 0) AS discovered_count,
  COALESCE(reviews.deep_reviewed_count, 0) AS deep_reviewed_count,
  COALESCE(outcomes.recommended_count, 0) AS recommended_count,
  COALESCE(outcomes.accepted_count, 0) AS accepted_count,
  coverage.last_scanned_at
 FROM track_ids
 LEFT JOIN coverage_effects coverage ON coverage.track_id = track_ids.track_id
 LEFT JOIN route_reviews reviews ON reviews.track_id = track_ids.track_id
 LEFT JOIN route_outcomes outcomes ON outcomes.track_id = track_ids.track_id`;

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function normalizedDoi(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || "";
}

function normalizedTitleKey(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function boundedTitleLookupTokens(value: string) {
  // Provider metadata can contain an unbroken, oversized title token. D1
  // rejects oversized LIKE patterns, so identity prefetch uses bounded literal
  // substrings and leaves the exact title/author/year decision to JavaScript.
  return Array.from(new Set(value.split(/\s+/).filter(Boolean)))
    .sort((left, right) => right.length - left.length)
    .slice(0, TITLE_IDENTITY_LOOKUP_TOKENS_PER_TITLE)
    .map((token) => token.slice(0, TITLE_IDENTITY_LOOKUP_TOKEN_LIMIT));
}

function normalizedAuthorTokens(value: string) {
  return Array.from(new Set(value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/)
    .filter((token) => token.length >= 3))).sort();
}

function publicationYear(value: string | null | undefined) {
  return value?.match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

export function compatibleResearchWorkMetadata(
  left: Pick<MonitorCandidateInput, "title" | "authors" | "publishedAt">,
  right: Pick<MonitorCandidateInput, "title" | "authors" | "publishedAt">,
) {
  if (normalizedTitleKey(left.title) !== normalizedTitleKey(right.title)) return false;
  const leftYear = publicationYear(left.publishedAt);
  const rightYear = publicationYear(right.publishedAt);
  if (leftYear && rightYear && leftYear !== rightYear) return false;
  const leftAuthors = normalizedAuthorTokens(left.authors);
  const rightAuthors = normalizedAuthorTokens(right.authors);
  if (leftAuthors.length && rightAuthors.length && !leftAuthors.some((token) => rightAuthors.includes(token))) return false;
  return true;
}

export function researchWorkIdentitySignature(candidate: Pick<MonitorCandidateInput, "title" | "authors" | "publishedAt">) {
  const title = normalizedTitleKey(candidate.title);
  const authors = normalizedAuthorTokens(candidate.authors).slice(0, 3).join("-") || "unknown-author";
  return `${title}\u001f${authors}\u001f${publicationYear(candidate.publishedAt) || "unknown-year"}`;
}

async function sharedCanonicalId(candidate: MonitorCandidateInput) {
  const doi = normalizedDoi(candidate.doi);
  if (doi) return `doi:${doi}`;
  // Provider IDs are discovery provenance, not a durable work identity. Title,
  // author, and year metadata keep same-title works separate; compatibility
  // checks below still merge provider records when one source omits a field.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(researchWorkIdentitySignature(candidate)));
  return "title:" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function coalesceBatchWorkIdentities(candidates: MonitorCandidateInput[]) {
  const byTitle = new Map<string, MonitorCandidateInput[]>();
  for (const candidate of candidates) {
    const titleKey = normalizedTitleKey(candidate.title);
    const group = byTitle.get(titleKey) || [];
    group.push(candidate);
    byTitle.set(titleKey, group);
  }
  return candidates.map((candidate) => {
    if (candidate.doi) return candidate;
    const compatible = (byTitle.get(normalizedTitleKey(candidate.title)) || [])
      .filter((entry) => compatibleResearchWorkMetadata(candidate, entry));
    const doiCanonicals = Array.from(new Set(compatible
      .map((entry) => normalizedDoi(entry.doi)).filter(Boolean).map((doi) => `doi:${doi}`)));
    // A unique DOI discovered in the same batch is the strongest identity. If
    // multiple distinct DOI records share a title, keep them separate rather
    // than guessing which one owns the provider-only record.
    if (doiCanonicals.length === 1) return { ...candidate, canonicalId: doiCanonicals[0] };
    const providerCanonicals = Array.from(new Set(compatible.filter((entry) => !entry.doi).map((entry) => entry.canonicalId))).sort();
    const singleCompatibleCluster = compatible.every((left, index) => compatible.slice(index + 1)
      .every((right) => compatibleResearchWorkMetadata(left, right)));
    return providerCanonicals.length && singleCompatibleCluster ? { ...candidate, canonicalId: providerCanonicals[0] } : candidate;
  });
}

async function existingRowsForTitles(database: D1Database, spaceId: string, candidates: MonitorCandidateInput[]) {
  const titleLookups = Array.from(new Set(candidates.map((candidate) => normalizedTitleKey(candidate.title)).filter(Boolean)));
  const rows = new Map<string, ExistingIdentityRow>();
  for (let start = 0; start < titleLookups.length; start += TITLE_IDENTITY_LOOKUP_BATCH_SIZE) {
    const chunk = titleLookups.slice(start, start + TITLE_IDENTITY_LOOKUP_BATCH_SIZE);
    const tokenGroups = chunk.map(boundedTitleLookupTokens).filter((tokens) => tokens.length > 0);
    const clauses = tokenGroups.map((tokens) => `(${tokens.map(() => "instr(lower(title), ?) > 0").join(" AND ")})`);
    const parameters = tokenGroups.flat();
    if (!clauses.length) continue;
    const result = await database.prepare(
      `SELECT id, canonical_id, doi, title, authors, published_at FROM monitored_papers
       WHERE space_id = ? AND (${clauses.join(" OR ")})`,
    ).bind(spaceId, ...parameters).all<ExistingIdentityRow>();
    for (const row of result.results) rows.set(row.id, row);
  }
  return Array.from(rows.values());
}

function reuseExistingWorkIdentities(candidates: MonitorCandidateInput[], existingRows: ExistingIdentityRow[]) {
  const rowsByTitle = new Map<string, ExistingIdentityRow[]>();
  for (const row of existingRows) {
    const titleKey = normalizedTitleKey(row.title);
    const group = rowsByTitle.get(titleKey) || [];
    group.push(row);
    rowsByTitle.set(titleKey, group);
  }
  return candidates.map((candidate) => {
    const rows = (rowsByTitle.get(normalizedTitleKey(candidate.title)) || []).filter((row) => compatibleResearchWorkMetadata(candidate, {
      title: row.title,
      authors: row.authors,
      publishedAt: row.published_at,
    }));
    const exact = rows.find((row) => row.canonical_id === candidate.canonicalId);
    if (exact) return candidate;
    const candidateDoi = normalizedDoi(candidate.doi);
    const sameDoi = candidateDoi && rows.find((row) => normalizedDoi(row.doi) === candidateDoi);
    if (sameDoi) return { ...candidate, canonicalId: sameDoi.canonical_id };
    const noDoiRows = rows.filter((row) => !normalizedDoi(row.doi));
    const existingDois = new Set(rows.map((row) => normalizedDoi(row.doi)).filter(Boolean));
    if (candidateDoi) {
      // Upgrade a prior provider-only discovery in place without changing its
      // paper ID or losing review/feedback state. A conflicting DOI blocks the
      // title fallback so genuinely distinct DOI works remain separate.
      if (!existingDois.size && noDoiRows.length === 1) return { ...candidate, canonicalId: noDoiRows[0].canonical_id };
      return candidate;
    }
    if (noDoiRows.length === 1) return { ...candidate, canonicalId: noDoiRows[0].canonical_id };
    if (existingDois.size === 1 && rows.length === 1) return { ...candidate, canonicalId: rows[0].canonical_id };
    return candidate;
  });
}

function uniqueCandidates(candidates: MonitorCandidateInput[]) {
  const byCanonicalId = new Map<string, MonitorCandidateInput>();
  for (const candidate of candidates) {
    const canonicalId = candidate.canonicalId.trim();
    if (!canonicalId || !candidate.title.trim()) continue;
    const current = byCanonicalId.get(canonicalId);
    if (!current) {
      byCanonicalId.set(canonicalId, { ...candidate, canonicalId });
      continue;
    }
    const provenance = new Map<string, MonitorCandidateProvenance>();
    for (const entry of [...current.provenance, ...candidate.provenance]) {
      const key = `${entry.sourceKey}\u001f${entry.queryKey}`;
      if (!entry.sourceKey.trim() || !entry.queryKey.trim() || provenance.has(key)) continue;
      provenance.set(key, entry);
    }
    byCanonicalId.set(canonicalId, {
      ...(candidate.abstractText.length > current.abstractText.length ? candidate : current),
      canonicalId,
      doi: current.doi || candidate.doi,
      citationCount: Math.max(current.citationCount, candidate.citationCount),
      relevanceScore: Math.max(current.relevanceScore, candidate.relevanceScore),
      qualityScore: Math.max(current.qualityScore, candidate.qualityScore),
      priorityVenue: current.priorityVenue || candidate.priorityVenue,
      provenance: Array.from(provenance.values()),
    });
  }
  return Array.from(byCanonicalId.values());
}

async function existingCanonicalIds(database: D1Database, spaceId: string, canonicalIds: string[]) {
  const existing = new Set<string>();
  for (let start = 0; start < canonicalIds.length; start += MAX_BATCH_SIZE) {
    const chunk = canonicalIds.slice(start, start + MAX_BATCH_SIZE);
    const rows = await database.prepare(
      `SELECT canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(spaceId, ...chunk).all<{ canonical_id: string }>();
    for (const row of rows.results) existing.add(row.canonical_id);
  }
  return existing;
}

/**
 * Adds discoveries from every product surface to the same persistent review
 * pool used by the daily monitor. It never marks a paper recommended and never
 * writes formal research-map evidence. Existing DeepSeek decisions are kept.
 */
export async function enqueueMonitorCandidates(
  database: D1Database,
  spaceId: string,
  inputs: MonitorCandidateInput[],
  options: QueueOptions = {},
): Promise<MonitorCandidateQueueResult> {
  const normalizedInputs = await Promise.all(inputs.map(async (candidate) => ({
    ...candidate,
    canonicalId: await sharedCanonicalId(candidate),
  })));
  const batchCoalesced = uniqueCandidates(coalesceBatchWorkIdentities(normalizedInputs));
  const existingIdentityRows = await existingRowsForTitles(database, spaceId, batchCoalesced);
  const candidates = uniqueCandidates(reuseExistingWorkIdentities(batchCoalesced, existingIdentityRows));
  if (!candidates.length) return {
    candidateCount: 0,
    newCandidateCount: 0,
    queuedForReviewCount: 0,
    reviewingCount: 0,
    recommendedCount: 0,
    alreadyReviewedCount: 0,
    canonicalIds: [],
  };

  const canonicalIds = candidates.map((candidate) => candidate.canonicalId);
  const existingIds = await existingCanonicalIds(database, spaceId, canonicalIds);
  const candidateByCanonicalId = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const paperIds = new Map<string, string>();

  for (let start = 0; start < candidates.length; start += MAX_BATCH_SIZE) {
    const chunk = candidates.slice(start, start + MAX_BATCH_SIZE);
    await database.batch(chunk.map((candidate) => database.prepare(
      `INSERT INTO monitored_papers
       (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon, citation_count, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(space_id, canonical_id) DO UPDATE SET
        doi = COALESCE(monitored_papers.doi, excluded.doi), title = excluded.title, authors = excluded.authors,
        venue = excluded.venue, url = excluded.url, published_at = COALESCE(excluded.published_at, monitored_papers.published_at),
        horizon = excluded.horizon, last_seen_at = CURRENT_TIMESTAMP,
        citation_count = MAX(monitored_papers.citation_count, excluded.citation_count),
        relevance_score = MAX(monitored_papers.relevance_score, excluded.relevance_score)`,
    ).bind(
      crypto.randomUUID(), spaceId, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors,
      candidate.venue, candidate.url, candidate.publishedAt, candidate.source, candidate.horizon,
      Math.max(0, Math.round(candidate.citationCount || 0)), boundedScore(candidate.relevanceScore),
    )));
    const rows = await database.prepare(
      `SELECT id, canonical_id FROM monitored_papers WHERE space_id = ? AND canonical_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(spaceId, ...chunk.map((candidate) => candidate.canonicalId)).all<PersistedPaperRow>();
    for (const row of rows.results) paperIds.set(row.canonical_id, row.id);
  }

  const insightStatements = Array.from(paperIds.entries()).flatMap(([canonicalId, paperId]) => {
    const candidate = candidateByCanonicalId.get(canonicalId);
    if (!candidate) return [];
    return [database.prepare(
      `INSERT INTO paper_insights (paper_id, space_id, abstract_text, quality_score, priority_venue, analysis_source)
       VALUES (?, ?, ?, ?, ?, 'metadata')
       ON CONFLICT(paper_id) DO UPDATE SET
        abstract_text = CASE WHEN LENGTH(excluded.abstract_text) > LENGTH(paper_insights.abstract_text)
         THEN excluded.abstract_text ELSE paper_insights.abstract_text END,
        quality_score = MAX(paper_insights.quality_score, excluded.quality_score),
        priority_venue = MAX(paper_insights.priority_venue, excluded.priority_venue),
        analysis_source = CASE WHEN paper_insights.analysis_source = 'route-gap' THEN 'metadata' ELSE paper_insights.analysis_source END,
        analysis_model = CASE WHEN paper_insights.analysis_source = 'route-gap' THEN '' ELSE paper_insights.analysis_model END,
        llm_recommended = CASE WHEN paper_insights.analysis_source = 'route-gap' THEN 0 ELSE paper_insights.llm_recommended END,
        updated_at = CURRENT_TIMESTAMP
       WHERE paper_insights.analysis_source IN ('metadata', 'route-gap')`,
    ).bind(paperId, spaceId, candidate.abstractText, boundedScore(candidate.qualityScore), candidate.priorityVenue ? 1 : 0)];
  });
  for (let start = 0; start < insightStatements.length; start += MAX_BATCH_SIZE) {
    await database.batch(insightStatements.slice(start, start + MAX_BATCH_SIZE));
  }

  const provenanceRows = Array.from(paperIds.entries()).flatMap(([canonicalId, paperId]) => {
    const candidate = candidateByCanonicalId.get(canonicalId);
    if (!candidate) return [];
    const unique = new Map<string, MonitorCandidateProvenance>();
    for (const entry of candidate.provenance) {
      const sourceKey = entry.sourceKey.trim();
      const queryKey = entry.queryKey.trim();
      if (!sourceKey || !queryKey) continue;
      unique.set(`${sourceKey}\u001f${queryKey}`, { ...entry, sourceKey, queryKey });
    }
    return Array.from(unique.values()).map((entry) => ({ canonicalId, paperId, candidate, entry }));
  });
  const sourceStatements = provenanceRows.map(({ paperId, entry }) => database.prepare(
    `INSERT INTO monitor_candidate_sources (id, space_id, paper_id, source_key, channel, query_key, appearances)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(paper_id, source_key, query_key) DO UPDATE SET
      appearances = monitor_candidate_sources.appearances + excluded.appearances, last_seen_at = CURRENT_TIMESTAMP`,
  ).bind(
    crypto.randomUUID(), spaceId, paperId, entry.sourceKey, entry.channel, entry.queryKey,
    Math.max(1, Math.round(entry.appearances || 1)),
  ));
  for (let start = 0; start < sourceStatements.length; start += MAX_BATCH_SIZE) {
    await database.batch(sourceStatements.slice(start, start + MAX_BATCH_SIZE));
  }

  if (options.recordDiscoveryCoverage) {
    const coverageGroups = new Map<string, {
      horizon: MonitorCandidateHorizon;
      entry: MonitorCandidateProvenance;
      canonicalIds: Set<string>;
    }>();
    for (const { canonicalId, candidate, entry } of provenanceRows) {
      const key = `${candidate.horizon}\u001f${entry.sourceKey}\u001f${entry.queryKey}`;
      const current = coverageGroups.get(key) || { horizon: candidate.horizon, entry, canonicalIds: new Set<string>() };
      current.canonicalIds.add(canonicalId);
      coverageGroups.set(key, current);
    }
    const coverageStatements = Array.from(coverageGroups.values()).map(({ horizon, entry, canonicalIds: branchIds }) => {
      const newCandidateCount = Array.from(branchIds).filter((id) => !existingIds.has(id)).length;
      return database.prepare(
        `INSERT INTO monitor_discovery_coverage
         (id, space_id, horizon, source_key, channel, query_key, query_text, route_id, exploration_role,
          adaptive_score, attempt_count, candidate_count, total_candidate_count, new_candidate_count,
          branch_status, first_scanned_at, last_scanned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'core', 70, 1, ?, ?, ?, 'revisit', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(space_id, horizon, source_key, query_key) DO UPDATE SET
          channel = excluded.channel,
          query_text = CASE WHEN excluded.query_text <> '' THEN excluded.query_text ELSE monitor_discovery_coverage.query_text END,
          route_id = COALESCE(excluded.route_id, monitor_discovery_coverage.route_id),
          adaptive_score = MAX(monitor_discovery_coverage.adaptive_score, excluded.adaptive_score),
          attempt_count = monitor_discovery_coverage.attempt_count + 1,
          candidate_count = excluded.candidate_count,
          total_candidate_count = monitor_discovery_coverage.total_candidate_count + excluded.total_candidate_count,
          new_candidate_count = monitor_discovery_coverage.new_candidate_count + excluded.new_candidate_count,
          zero_yield_streak = CASE WHEN excluded.candidate_count > 0 THEN 0 ELSE monitor_discovery_coverage.zero_yield_streak + 1 END,
          branch_status = 'revisit', first_scanned_at = COALESCE(monitor_discovery_coverage.first_scanned_at, CURRENT_TIMESTAMP),
          last_scanned_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        crypto.randomUUID(), spaceId, horizon, entry.sourceKey, entry.channel, entry.queryKey,
        (entry.queryText || "").trim().slice(0, 500), entry.routeId?.trim() || null,
        branchIds.size, branchIds.size, newCandidateCount,
      );
    });
    for (let start = 0; start < coverageStatements.length; start += MAX_BATCH_SIZE) {
      await database.batch(coverageStatements.slice(start, start + MAX_BATCH_SIZE));
    }
  }

  const stageRows: InsightStageRow[] = [];
  for (let start = 0; start < canonicalIds.length; start += MAX_BATCH_SIZE) {
    const chunk = canonicalIds.slice(start, start + MAX_BATCH_SIZE);
    const rows = await database.prepare(
      `SELECT p.canonical_id, i.analysis_source, i.analysis_model, i.llm_recommended
       FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
       WHERE p.space_id = ? AND p.canonical_id IN (${chunk.map(() => "?").join(", ")})
        AND NOT EXISTS (
         SELECT 1 FROM paper_feedback dismissed
         WHERE dismissed.space_id = p.space_id AND dismissed.paper_id = p.id
          AND dismissed.feedback = 'not_relevant'
        )`,
    ).bind(spaceId, ...chunk).all<InsightStageRow>();
    stageRows.push(...rows.results);
  }
  const queuedForReviewCount = stageRows.filter((row) => row.analysis_source === "metadata" || !row.analysis_model).length;
  const reviewingCount = stageRows.filter((row) => row.analysis_source === "deepseek_screened").length;
  const recommendedCount = stageRows.filter((row) => row.analysis_source === "deepseek" && Boolean(row.llm_recommended)).length;
  const alreadyReviewedCount = stageRows.filter((row) => row.analysis_source === "deepseek" || row.analysis_source === "deepseek_rejected").length;
  return {
    candidateCount: candidates.length,
    newCandidateCount: canonicalIds.filter((id) => !existingIds.has(id)).length,
    queuedForReviewCount,
    reviewingCount,
    recommendedCount,
    alreadyReviewedCount,
    canonicalIds,
  };
}
