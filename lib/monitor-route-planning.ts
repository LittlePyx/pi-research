export type MonitorExplorationMode = "focused" | "balanced" | "open";

export type PrioritizableDiscoveryPlan = {
  key: string;
  sourceKey: string;
  routeId?: string;
  explorationRole?: "core" | "adjacent";
  adaptiveScore?: number;
};

export type ResearchGuidanceTrackSnapshot = {
  id: string;
  user_role: string;
  depth_score: number;
  support_score: number;
  interaction_score: number;
  intelligence_json: string;
  intelligence_updated_at: string | null;
};

export type ConfirmedRouteEvidenceSnapshot = {
  track_id: string;
  canonical_id: string;
  title: string;
  map_role: string;
  confidence: number;
  updated_at: string;
};

export type MonitorRouteOriginKind =
  | "route_foundation"
  | "route_milestone"
  | "route_frontier"
  | "route_gap"
  | "route_network"
  | "route_search";

export type MonitorRouteTaskKind = "foundation" | "frontier" | "gap" | "network";

export type MonitorRouteProvenance = {
  sourceKey: string;
  routeId?: string | null;
};

export type ReviewableScanWork<TScreen extends { canonicalId: string }> = {
  candidateIds: string[];
  screens: TScreen[];
  deepIds: string[];
  deepCompletedIds: string[];
  rescueScreenIds: string[];
};

export type MonitorWriteResult = { meta?: { changes?: number } };

export const RESEARCH_GUIDANCE_TRACKS_SQL =
  "SELECT id, user_role, depth_score, support_score, interaction_score, intelligence_json, intelligence_updated_at FROM research_tracks WHERE space_id = ? ORDER BY id";

export const RESEARCH_GUIDANCE_REVISIONS_SQL = `SELECT
 COALESCE((SELECT MAX(updated_at) FROM research_preference_signals WHERE space_id = ? AND active = 1), '') AS preference_revision,
 COALESCE((SELECT MAX(updated_at) FROM paper_feedback WHERE space_id = ?), '') AS feedback_revision,
 COALESCE((SELECT MAX(updated_at) FROM paper_reading_progress WHERE space_id = ?), '') AS reading_revision,
 COALESCE((SELECT MAX(updated_at) FROM research_map_evidence_proposals WHERE space_id = ? AND status = 'confirmed'), '') AS confirmed_evidence_revision,
 COALESCE((SELECT MAX(updated_at) FROM research_syntheses WHERE space_id = ? AND status IN ('ready', 'partial')), '') AS synthesis_revision,
 COALESCE((SELECT MAX(updated_at) FROM research_problems WHERE space_id = ? AND status IN ('active', 'paused')), '') AS problem_revision,
 COALESCE((SELECT MAX(created_at) FROM research_problem_assessments WHERE space_id = ?), '') AS problem_assessment_revision,
 COALESCE((SELECT MAX(updated_at) FROM research_action_runs WHERE space_id = ? AND status = 'ready'), '') AS action_run_revision`;

export const RECENT_CONFIRMED_ROUTE_EVIDENCE_SQL = `SELECT ep.track_id, p.canonical_id, p.title, ep.map_role, ep.confidence, ep.updated_at
 FROM research_map_evidence_proposals ep
 JOIN monitored_papers p ON p.id = ep.paper_id AND p.space_id = ep.space_id
 WHERE ep.space_id = ? AND ep.status = 'confirmed'
 ORDER BY ep.updated_at DESC, ep.rowid DESC LIMIT 24`;

export const LATEST_AUDIT_ROUTE_ORIGIN_SUBQUERY = `(SELECT space_id, paper_id, source_key, route_id FROM (
 SELECT latest.space_id, latest.paper_id,
  json_extract(origin.value, '$.sourceKey') AS source_key,
  json_extract(origin.value, '$.routeId') AS route_id,
  ROW_NUMBER() OVER (
   PARTITION BY latest.space_id, latest.paper_id ORDER BY CAST(origin.key AS INTEGER)
  ) AS origin_rank
 FROM (
  SELECT ranked.* FROM (
   SELECT ae.*,
    ROW_NUMBER() OVER (PARTITION BY ae.space_id, ae.paper_id ORDER BY ae.reviewed_at DESC, ae.rowid DESC) AS audit_rank
   FROM recommendation_audit_events ae
  ) ranked WHERE ranked.audit_rank = 1 AND ranked.recommended = 1
 ) latest
 JOIN json_each(latest.provenance_json) origin
 WHERE COALESCE(json_extract(origin.value, '$.routeId'), '') <> ''
) WHERE origin_rank = 1)`;

/**
 * Recovery-only provenance for the rare case where recommendation persistence
 * succeeds but its private audit write fails. first_seen_at is bounded by the
 * recommendation timestamp so a later graph exploration can never rewrite
 * why an older recommendation originally appeared.
 */
export const PRE_REVIEW_ROUTE_ORIGIN_SUBQUERY = `(SELECT space_id, paper_id, source_key, route_id FROM (
 SELECT cs.space_id, cs.paper_id, cs.source_key, coverage.route_id,
  ROW_NUMBER() OVER (
   PARTITION BY cs.space_id, cs.paper_id ORDER BY datetime(cs.first_seen_at) DESC, cs.rowid DESC
  ) AS origin_rank
 FROM monitor_candidate_sources cs
 JOIN monitored_papers paper ON paper.id = cs.paper_id AND paper.space_id = cs.space_id
 JOIN paper_insights insight ON insight.paper_id = cs.paper_id AND insight.space_id = cs.space_id
 JOIN monitor_discovery_coverage coverage ON coverage.space_id = cs.space_id
  AND coverage.horizon = paper.horizon AND coverage.source_key = cs.source_key AND coverage.query_key = cs.query_key
 WHERE COALESCE(coverage.route_id, '') <> ''
  AND datetime(cs.first_seen_at) <= datetime(insight.updated_at)
) WHERE origin_rank = 1)`;

/**
 * A route id is authoritative provenance regardless of which discovery
 * provider executed the route query. Prefix recognition also keeps route
 * semantics on the in-memory candidate before coverage has been reloaded.
 */
export function monitorRouteOriginKind(sourceKey: string, routeId?: string | null): MonitorRouteOriginKind | null {
  if (sourceKey === "research-route:foundation") return "route_foundation";
  if (sourceKey === "research-route:milestone") return "route_milestone";
  if (sourceKey === "research-route:frontier") return "route_frontier";
  if (sourceKey === "research-route:gap" || sourceKey.startsWith("crossref:route-gap:")) return "route_gap";
  if (sourceKey === "research-route:network") return "route_network";
  if (sourceKey.startsWith("research-route:") || sourceKey.startsWith("crossref:route:")) return "route_search";
  if (routeId?.trim()) return "route_search";
  return null;
}

/**
 * The wide five-year window repairs durable foundations. The two recent
 * windows watch the live frontier. Gaps and citation-network tasks are
 * independent branches and therefore do not share this horizon mapping.
 */
export function monitorRouteTaskForHorizon(horizon: string): Extract<MonitorRouteTaskKind, "foundation" | "frontier"> {
  return horizon === "years" ? "foundation" : "frontier";
}

/**
 * Citation exploration gets one deliberately bounded seed per horizon. It
 * rotates routes first, then papers inside a route, so one paper-rich route
 * cannot monopolize the three citation calls in a scan.
 */
export function selectCitationRouteSeed<T extends { track_id: string }>(
  seeds: T[],
  horizon: string,
  round: number,
): T | null {
  if (!seeds.length) return null;
  const horizonOffset = horizon === "days" ? 0 : horizon === "months" ? 1 : 2;
  const routeIds = Array.from(new Set(seeds.map((seed) => seed.track_id)));
  const cursor = Math.max(0, Math.floor(round)) * 3 + horizonOffset;
  const routeId = routeIds[cursor % routeIds.length];
  const routeSeeds = seeds.filter((seed) => seed.track_id === routeId);
  return routeSeeds[Math.floor(cursor / routeIds.length) % routeSeeds.length] || null;
}

export function isMonitorRouteProvenance(entry: MonitorRouteProvenance) {
  return monitorRouteOriginKind(entry.sourceKey, entry.routeId) !== null;
}

/**
 * Explicit restrictions use this query in chunks. Keeping it here lets the
 * SQLite behavior be exercised independently of the HTTP route.
 */
export function reviewableScanCandidateIdsSql(candidateCount: number) {
  if (!Number.isInteger(candidateCount) || candidateCount < 1) throw new Error("candidateCount must be positive");
  return `SELECT paper.canonical_id
   FROM monitored_papers paper
   WHERE paper.space_id = ? AND paper.canonical_id IN (${Array.from({ length: candidateCount }, () => "?").join(", ")})
    AND NOT EXISTS (
     SELECT 1 FROM paper_feedback suppressed
     WHERE suppressed.space_id = paper.space_id AND suppressed.paper_id = paper.id
      AND suppressed.feedback = 'not_relevant'
    )`;
}

/** SQL predicate used on the write statement itself, closing the race between
 * a preflight read and a user's not-relevant feedback in another request. */
export function monitorPaperNotDismissedSql(spaceIdExpression: string, paperIdExpression: string) {
  return `NOT EXISTS (
   SELECT 1 FROM paper_feedback suppressed
   WHERE suppressed.space_id = ${spaceIdExpression} AND suppressed.paper_id = ${paperIdExpression}
    AND suppressed.feedback = 'not_relevant'
  )`;
}

export function retainChangedMonitorWrites<T>(items: T[], results: MonitorWriteResult[]) {
  return items.filter((_, index) => Number(results[index]?.meta?.changes || 0) > 0);
}

/**
 * Preserve the frozen work order while allowing a user's explicit withdrawal
 * to remove a paper from every unfinished phase of an active scan.
 */
export function retainReviewableScanWork<TScreen extends { canonicalId: string }>(
  work: ReviewableScanWork<TScreen>,
  reviewableCanonicalIds: Iterable<string>,
): ReviewableScanWork<TScreen> {
  const reviewable = new Set(reviewableCanonicalIds);
  const candidateIds = work.candidateIds.filter((canonicalId) => reviewable.has(canonicalId));
  const candidates = new Set(candidateIds);
  const deepIds = work.deepIds.filter((canonicalId) => candidates.has(canonicalId));
  const deep = new Set(deepIds);
  return {
    candidateIds,
    screens: work.screens.filter((screen) => candidates.has(screen.canonicalId)),
    deepIds,
    deepCompletedIds: work.deepCompletedIds.filter((canonicalId) => deep.has(canonicalId)),
    rescueScreenIds: work.rescueScreenIds.filter((canonicalId) => candidates.has(canonicalId)),
  };
}

function planScore(plan: PrioritizableDiscoveryPlan) {
  return Math.max(0, Number(plan.adaptiveScore) || 0);
}

function isRoutePlan(plan: PrioritizableDiscoveryPlan) {
  return Boolean(plan.routeId)
    || plan.key.startsWith("research-route-")
    || plan.sourceKey.startsWith("crossref:route:")
    || plan.sourceKey.startsWith("crossref:route-gap:");
}

function isRouteGapPlan(plan: PrioritizableDiscoveryPlan) {
  return plan.key.startsWith("research-route-gap-")
    || plan.sourceKey === "research-route:gap"
    || plan.sourceKey.startsWith("crossref:route-gap:");
}

function stableRank<T extends PrioritizableDiscoveryPlan>(plans: T[]) {
  return plans.map((plan, index) => ({ plan, index }))
    .sort((left, right) => planScore(right.plan) - planScore(left.plan) || left.index - right.index)
    .map((entry) => entry.plan);
}

function takeDistinctRoutes<T extends PrioritizableDiscoveryPlan>(plans: T[], limit: number) {
  const selected: T[] = [];
  const routeIds = new Set<string>();
  for (const plan of plans) {
    const routeId = plan.routeId || `${plan.sourceKey}:${plan.key}`;
    if (routeIds.has(routeId)) continue;
    routeIds.add(routeId);
    selected.push(plan);
    if (selected.length >= limit) break;
  }
  return selected;
}

/**
 * Selects the bounded Crossref plan set while reserving real capacity for the
 * research routes that generated the workspace. Route base queries and the
 * current evidence-gap query cannot be crowded out by generic topic, journal,
 * author, or AI-plan branches with the same score.
 */
export function selectPrioritizedDiscoveryPlans<T extends PrioritizableDiscoveryPlan>(
  plans: T[],
  mode: MonitorExplorationMode,
) {
  const maxPlans = mode === "focused" ? 8 : mode === "open" ? 12 : 10;
  const adjacentSlots = mode === "focused" ? 0 : Math.max(1, Math.round(maxPlans * 0.18));
  const corePlans = stableRank(plans.filter((plan) => plan.explorationRole !== "adjacent"));
  const adjacentPlans = stableRank(plans.filter((plan) => plan.explorationRole === "adjacent"));
  const selected: T[] = [];
  const selectedKeys = new Set<string>();
  const add = (plan: T | undefined) => {
    if (!plan) return;
    const key = `${plan.sourceKey}\u001f${plan.key}\u001f${plan.routeId || ""}`;
    if (selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push(plan);
  };

  // Two distinct core routes plus the strongest evidence-gap probe form the
  // minimum durable route budget in every exploration mode.
  for (const plan of takeDistinctRoutes(corePlans.filter((item) => isRoutePlan(item) && !isRouteGapPlan(item)), 2)) add(plan);
  add(corePlans.find((item) => isRoutePlan(item) && isRouteGapPlan(item)));

  // Balanced/open modes keep their adjacent budget, and one adjacent route is
  // protected inside that budget when such a route exists.
  const selectedAdjacent: T[] = [];
  const addAdjacent = (plan: T | undefined) => {
    if (!plan || selectedAdjacent.includes(plan)) return;
    selectedAdjacent.push(plan);
  };
  if (adjacentSlots) addAdjacent(adjacentPlans.find(isRoutePlan));
  for (const plan of adjacentPlans) {
    if (selectedAdjacent.length >= adjacentSlots) break;
    addAdjacent(plan);
  }
  for (const plan of selectedAdjacent) add(plan);

  const coreCapacity = maxPlans - selectedAdjacent.length;
  for (const plan of corePlans) {
    if (selected.filter((item) => item.explorationRole !== "adjacent").length >= coreCapacity) break;
    add(plan);
  }

  // If one side has fewer available plans, use the spare capacity without
  // weakening the route reservations already made above.
  if (selected.length < maxPlans) {
    const fillPool = mode === "focused" ? corePlans : stableRank(plans);
    for (const plan of fillPool) {
      if (selected.length >= maxPlans) break;
      add(plan);
    }
  }
  return selected.slice(0, maxPlans);
}

export function researchGuidanceIdentity(input: {
  tracks: ResearchGuidanceTrackSnapshot[];
  preferenceRevision: string;
  feedbackRevision: string;
  readingRevision: string;
  confirmedEvidenceRevision: string;
  synthesisRevision: string;
  problemRevision: string;
  problemAssessmentRevision: string;
  actionRunRevision: string;
  confirmedEvidence: ConfirmedRouteEvidenceSnapshot[];
}) {
  return JSON.stringify({
    tracks: input.tracks,
    preferenceRevision: input.preferenceRevision,
    feedbackRevision: input.feedbackRevision,
    readingRevision: input.readingRevision,
    confirmedEvidenceRevision: input.confirmedEvidenceRevision,
    synthesisRevision: input.synthesisRevision,
    problemRevision: input.problemRevision,
    problemAssessmentRevision: input.problemAssessmentRevision,
    actionRunRevision: input.actionRunRevision,
    confirmedEvidence: input.confirmedEvidence,
  });
}
