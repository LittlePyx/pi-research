import type { ResearchTrackBuildStatus, ResearchTrackRole, ResearchTrackSourceStatus } from "./research-map";

export const MAX_RESEARCH_TRACK_BUILD_ATTEMPTS = 3;

export type ResearchTrackDiscoveryProvider = "crossref" | "openalex" | "arxiv";

export type ResearchTrackDiscoveryTask = {
  provider: ResearchTrackDiscoveryProvider;
  role: ResearchTrackRole;
};

export type ResearchTrackTopic = {
  titleEn: string;
  summaryEn?: string;
  searchQueries: string[];
};

export type ResearchTrackTopicCandidate = {
  title: string;
  abstractText?: string;
  venue?: string;
};

export type ResearchTrackSourceBatch<T> = {
  source: string;
  role: ResearchTrackRole;
  result: PromiseSettledResult<T[]>;
};

export type ResearchTrackSourceReport = {
  source: string;
  role: ResearchTrackRole | "baseline";
  status: ResearchTrackSourceStatus;
  candidateCount: number;
  error?: string;
};

export type ResearchTrackBuildResolutionInput = {
  existingPaperCount: number;
  selectedPaperCount: number;
  candidateCount: number;
  sourceSuccessCount: number;
  sourceFailureCount: number;
  modelAttempted: boolean;
  modelSucceeded: boolean;
  attemptCount: number;
  pendingReviewCount?: number;
  maxAttempts?: number;
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Source unavailable");
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240);
}

/**
 * Cold-start retries deliberately change providers instead of replaying the
 * same degraded request. Each pass is capped at three external calls; the
 * protected local baseline is appended separately when a pass is thin.
 */
export function researchTrackSourcePlan(attemptCount: number): ResearchTrackDiscoveryTask[] {
  const attempt = Math.max(0, Math.floor(attemptCount));
  if (attempt === 0) return [
    { provider: "crossref", role: "foundation" },
    { provider: "crossref", role: "milestone" },
    { provider: "crossref", role: "frontier" },
  ];
  if (attempt === 1) return [
    { provider: "openalex", role: "foundation" },
    { provider: "openalex", role: "milestone" },
    { provider: "arxiv", role: "frontier" },
  ];
  return [
    { provider: "crossref", role: "foundation" },
    { provider: "openalex", role: "milestone" },
    { provider: "arxiv", role: "frontier" },
  ];
}

const GENERIC_ROUTE_TERMS = new Set([
  "about", "across", "advanced", "analysis", "approach", "based", "between", "development", "effects",
  "evidence", "framework", "from", "general", "information", "into", "method", "model", "network", "novel",
  "paper", "problem", "research", "results", "study", "system", "theory", "through", "toward", "using", "with",
]);

function normalizedTopicWords(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

function topicTerms(topic: ResearchTrackTopic) {
  const original = [topic.titleEn, ...topic.searchQueries].join(" ");
  const acronyms = original.match(/\b[A-Z][A-Z0-9-]{1,7}\b/g) || [];
  return Array.from(new Set([
    ...normalizedTopicWords(original).filter((term) => term.length >= 4 && !GENERIC_ROUTE_TERMS.has(term)),
    ...acronyms.map((term) => term.toLocaleLowerCase()),
  ])).slice(0, 32);
}

function topicTermRoot(value: string) {
  if (value.length >= 7 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length >= 6 && value.endsWith("s") && !value.endsWith("ss") && !value.endsWith("sis")) return value.slice(0, -1);
  return value;
}

function topicTermAppears(term: string, words: string[]) {
  const rootedTerm = topicTermRoot(term);
  return words.some((word) => {
    const rootedWord = topicTermRoot(word);
    return rootedWord === rootedTerm
      || (rootedTerm.length >= 6 && rootedWord.length >= 6
        && (rootedWord.startsWith(rootedTerm) || rootedTerm.startsWith(rootedWord)));
  });
}

/**
 * A deliberately conservative pre-model precision gate. It only rejects
 * candidates with no substantive route signal; the model remains responsible
 * for the nuanced quality decision. At least one signal must occur in the
 * title so an incidental abstract mention cannot feed an adjacent field into
 * the shared queue.
 */
export function researchTrackTopicalFit(topic: ResearchTrackTopic, candidate: ResearchTrackTopicCandidate) {
  const terms = topicTerms(topic);
  const titleWords = normalizedTopicWords(candidate.title);
  const bodyWords = normalizedTopicWords(`${candidate.title} ${candidate.abstractText || ""} ${candidate.venue || ""}`);
  const titleMatches = terms.filter((term) => topicTermAppears(term, titleWords));
  const bodyMatches = terms.filter((term) => topicTermAppears(term, bodyWords));
  const accepted = titleMatches.length >= 2
    || (titleMatches.length >= 1 && bodyMatches.length >= 2)
    || (terms.length === 1 && titleMatches.length === 1);
  return {
    accepted,
    titleMatchCount: titleMatches.length,
    totalMatchCount: bodyMatches.length,
    matchedTerms: bodyMatches,
  };
}

/**
 * Monitor route searches are model-generated and can occasionally contain a
 * broad polysemous token (for example, "power").  Shared-queue admission uses
 * the stable route title as its minimum lexical contract so an exploratory
 * query cannot redefine the route before the independent model review runs.
 */
export function researchTrackTitleTopicalFit(
  titleEn: string,
  candidate: ResearchTrackTopicCandidate,
) {
  const titleAnchorGenericTerms = new Set([
    ...GENERIC_ROUTE_TERMS,
    "bounds", "identity", "mechanisms", "problems", "relationship",
  ]);
  const concepts = titleEn.split(/\b(?:and|or)\b|[&/]/i).map((clause) =>
    normalizedTopicWords(clause).filter((term) => term.length >= 4 && !titleAnchorGenericTerms.has(term)),
  ).filter((concept) => concept.length > 0);
  const titleWords = normalizedTopicWords(candidate.title);
  const matchedTerms = Array.from(new Set(concepts.flat().filter((term) => topicTermAppears(term, titleWords))));
  const accepted = concepts.some((concept) => {
    const positions = concept.map((term) => titleWords.findIndex((word) => topicTermAppears(term, [word])));
    if (positions.some((position) => position < 0)) return false;
    if (positions.length === 1) return true;
    return Math.max(...positions) - Math.min(...positions) <= concept.length + 1;
  });
  return {
    accepted,
    titleMatchCount: matchedTerms.length,
    totalMatchCount: matchedTerms.length,
    matchedTerms,
  };
}

export const SCHEDULED_RESEARCH_ROUTE_RETRY_SQL = `SELECT
 track.id AS track_id, track.space_id, track.build_attempt_count, space.owner_user_id,
 CASE WHEN track.build_status IN ('empty', 'failed') OR track.build_attempt_count >= 3 THEN 1 ELSE 0 END AS recovery_from_shared_queue
 FROM research_tracks track
 JOIN research_spaces space ON space.id = track.space_id
 JOIN monitor_runs run ON run.space_id = track.space_id
 WHERE (
   (track.build_status = 'retryable'
    AND track.build_attempt_count < 3
    AND (track.build_retry_at IS NULL OR datetime(track.build_retry_at) <= CURRENT_TIMESTAMP))
    OR (
     track.build_status IN ('retryable', 'empty', 'failed')
     AND (
      EXISTS (
       SELECT 1 FROM monitor_discovery_coverage coverage
       JOIN monitor_candidate_sources candidate ON candidate.space_id = coverage.space_id
        AND candidate.source_key = coverage.source_key AND candidate.query_key = coverage.query_key
       JOIN monitored_papers paper ON paper.id = candidate.paper_id AND paper.space_id = candidate.space_id
        AND paper.horizon = coverage.horizon
       WHERE coverage.space_id = track.space_id AND coverage.route_id = track.id
        AND datetime(candidate.first_seen_at) > datetime(track.updated_at)
      ) OR EXISTS (
       SELECT 1 FROM monitor_discovery_coverage coverage
       JOIN monitor_candidate_sources candidate ON candidate.space_id = coverage.space_id
        AND candidate.source_key = coverage.source_key AND candidate.query_key = coverage.query_key
       JOIN monitored_papers paper ON paper.id = candidate.paper_id AND paper.space_id = candidate.space_id
        AND paper.horizon = coverage.horizon
       JOIN paper_insights insight ON insight.paper_id = paper.id AND insight.space_id = paper.space_id
       WHERE coverage.space_id = track.space_id AND coverage.route_id = track.id
        AND insight.analysis_source NOT IN ('metadata', 'deepseek_verification_pending')
        AND insight.analysis_model != '' AND datetime(insight.updated_at) > datetime(track.updated_at)
      )
     )
    )
  )
  AND space.owner_user_id LIKE 'anonymous:%'
  AND run.automation_paused_at IS NULL
  AND run.last_user_activity_at IS NOT NULL
  AND datetime(run.last_user_activity_at) > datetime('now', '-7 days')
 ORDER BY recovery_from_shared_queue ASC, datetime(run.last_user_activity_at) DESC,
  datetime(track.build_retry_at) ASC, datetime(track.updated_at) ASC
 LIMIT ?`;

export function nextResearchTrackBuildAttemptCount(input: {
  currentAttemptCount: number;
  deferredForCredential: boolean;
  force: boolean;
  storedStatus: string;
}) {
  const current = Math.max(0, Math.floor(input.currentAttemptCount));
  if (input.deferredForCredential) return current;
  if (input.force && ["retryable", "empty", "failed"].includes(input.storedStatus)) return 1;
  return current + 1;
}

/**
 * Keeps every successful provider batch even when sibling requests fail. A
 * provider's empty response is different from an unavailable provider and is
 * therefore retained as an honest source status rather than a thrown error.
 */
export function mergeResearchTrackSourceBatches<T>(batches: ResearchTrackSourceBatch<T>[]) {
  const candidates: T[] = [];
  const sources: ResearchTrackSourceReport[] = [];
  for (const batch of batches) {
    if (batch.result.status === "fulfilled") {
      candidates.push(...batch.result.value);
      sources.push({
        source: batch.source,
        role: batch.role,
        status: batch.result.value.length ? "ok" : "empty",
        candidateCount: batch.result.value.length,
      });
    } else {
      sources.push({ source: batch.source, role: batch.role, status: "failed", candidateCount: 0, error: safeError(batch.result.reason) });
    }
  }
  return { candidates, sources, errors: sources.flatMap((source) => source.error ? [source.error] : []) };
}

/**
 * A route is ready only when at least one paper is visible and the latest
 * source/model pass completed cleanly. Existing evidence makes a degraded pass
 * partial, never empty; a route without visible evidence remains retryable up
 * to a fixed cap and then reports an honest empty or failed terminal state.
 */
export function resolveResearchTrackBuildStatus(input: ResearchTrackBuildResolutionInput): ResearchTrackBuildStatus {
  const maxAttempts = Math.max(1, input.maxAttempts || MAX_RESEARCH_TRACK_BUILD_ATTEMPTS);
  const visiblePaperCount = Math.max(0, input.existingPaperCount) + Math.max(0, input.selectedPaperCount);
  const degraded = input.sourceFailureCount > 0 || (input.modelAttempted && !input.modelSucceeded);
  if (visiblePaperCount > 0) return degraded ? "partial" : "ready";
  if (Math.max(0, input.pendingReviewCount || 0) > 0) return "retryable";
  if (input.attemptCount < maxAttempts) return "retryable";
  if (degraded || input.sourceSuccessCount === 0) return "failed";
  return "empty";
}

export function defensiveResearchTrackBuildStatus(
  storedStatus: string,
  expansionCount: number,
  visiblePaperCount: number,
): ResearchTrackBuildStatus {
  const allowed = new Set<ResearchTrackBuildStatus>(["queued", "retryable", "partial", "empty", "failed", "ready"]);
  const normalized = allowed.has(storedStatus as ResearchTrackBuildStatus)
    ? storedStatus as ResearchTrackBuildStatus
    : expansionCount < 0 ? "queued" : "ready";
  if (visiblePaperCount > 0) return normalized === "queued" || normalized === "retryable" || normalized === "empty" || normalized === "failed" ? "partial" : normalized;
  if (normalized === "ready" || normalized === "partial") return "retryable";
  return normalized;
}

export function researchTrackRetryAt(attemptCount: number, now = Date.now()) {
  const delaySeconds = Math.min(120, 12 * (2 ** Math.max(0, attemptCount - 1)));
  return new Date(now + delaySeconds * 1000).toISOString();
}
