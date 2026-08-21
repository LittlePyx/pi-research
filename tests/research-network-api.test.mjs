import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  advanceOpenAlexSeedCursor,
  classifyCoverageStatuses,
  classifyNoNovelCoverage,
  discoveryStateForCoverage,
  fairRoundRobinRelations,
  isFreshDiscoveryCacheEntry,
  isPositiveExpansionResult,
  isVerifiedBridge,
  partitionExpansionSeeds,
  relationOffsetsForExpansion,
  shouldUseOpenAlexFallback,
  similarityStatusForEdgeCount,
  verifiedRelationFallbackEdge,
  verifiedSeedCoverage,
} from "../lib/research-network.ts";
import { reserveSemanticScholarUsage } from "../lib/semantic-scholar-quota.ts";

const routePath = new URL("../app/api/research-network/route.ts", import.meta.url);
const dismissalPath = new URL("../lib/research-network-dismissal.ts", import.meta.url);
const schemaPath = new URL("../db/schema.ts", import.meta.url);
const repositoryPath = new URL("../db/repository.ts", import.meta.url);
const semanticScholarPath = new URL("../lib/semantic-scholar.ts", import.meta.url);
const semanticScholarQuotaPath = new URL("../lib/semantic-scholar-quota.ts", import.meta.url);
const monitorPath = new URL("../app/api/monitor/route.ts", import.meta.url);
const migrationPath = new URL("../drizzle/0022_bright_kat_farrell.sql", import.meta.url);
const continuationMigrationPath = new URL("../drizzle/0023_lethal_unicorn.sql", import.meta.url);
const throttleMigrationPath = new URL("../drizzle/0024_dry_nitro.sql", import.meta.url);
const openAlexCursorMigrationPath = new URL("../drizzle/0025_chilly_mariko_yashida.sql", import.meta.url);

test("research-network expansion uses verified external relations, cache, and coupling", async () => {
  const route = await readFile(routePath, "utf8");
  const dismissal = await readFile(dismissalPath, "utf8");
  assert.match(route, /\/references|\["references", "citations"\]/);
  assert.match(route, /recommendations\/v1\/papers/);
  assert.match(route, /references\.paperId,references\.externalIds/);
  assert.match(route, /bibliographic_coupling/);
  assert.match(route, /MAX_SEEDS = 3/);
  assert.match(route, /CACHE_HOURS = 24/);
  assert.match(route, /endpoint\.searchParams\.set\("offset"/);
  assert.match(route, /fetchSemanticScholar/);
  assert.match(route, /maxRetries: 1/);
  assert.match(route, /recommendation_offset/);
  assert.match(route, /researchNetworkDismissalStatements/);
  assert.match(dismissal, /status = 'dismissed'/);
  assert.match(dismissal, /status <> 'accepted'/);
  assert.match(dismissal, /status = 'accepted'/);
  assert.match(route, /confirmedExternalResearchMapEvidenceStatements/);
  assert.match(route, /statements\.push[\s\S]*confirmedExternalResearchMapEvidenceStatements[\s\S]*await database\.batch\(statements\)/);
});

test("candidate acceptance uses stable conflict-safe identities and one atomic write batch", async () => {
  const route = await readFile(routePath, "utf8");
  const patchBlock = route.slice(route.indexOf("export async function PATCH"));
  assert.match(patchBlock, /const monitoredPaperId = queuedPaper\.id/);
  assert.match(patchBlock, /`network-paper:\$\{trackId\}:\$\{candidateId\}`/);
  assert.match(patchBlock, /`network-accept:\$\{trackId\}:\$\{candidateId\}`/);
  assert.match(patchBlock, /const acceptedCanonicalId = acceptanceQueue\.canonicalIds\[0\] \|\| candidate\.canonicalId/);
  assert.match(patchBlock, /SELECT COALESCE\(MAX\(position\), -1\) \+ 1 FROM research_track_papers/);
  assert.match(patchBlock, /ON CONFLICT DO UPDATE SET/);
  assert.doesNotMatch(patchBlock, /existingFormal|existingMonitoredPaper|position = await|crypto\.randomUUID\(\)/);
  assert.match(patchBlock, /paperCanonicalId: acceptedCanonicalId/);
  assert.match(patchBlock, /researchNetworkDismissalReversalStatements/);
  assert.match(patchBlock, /const statements: D1PreparedStatement\[\] = \[[\s\S]*researchNetworkDismissalReversalStatements/);
  assert.match(patchBlock, /researchNetworkDismissalReversalStatements[\s\S]*confirmedExternalResearchMapEvidenceStatements[\s\S]*database\.batch\(statements\)/);
  assert.match(patchBlock, /formalized: true/);
  assert.doesNotMatch(patchBlock, /formalized: false/);
  assert.match(patchBlock, /await database\.batch\(statements\)/);
});

test("S2 empty pages remain retryable and bounded OpenAlex discovery supplies real one-hop relations", async () => {
  const route = await readFile(routePath, "utf8");
  assert.doesNotMatch(route, /isRetracted/);
  assert.match(route, /Array\.isArray\(data\.data\)/);
  assert.match(route, /emptyKinds\.push/);
  assert.match(route, /NEGATIVE_CACHE_MS = 15 \* 60_000/);
  assert.match(route, /hasFreshRecommendationCandidates/);
  assert.match(route, /isFreshDiscoveryState\(expansionState, hasRecommendationEvidence\)/);
  assert.match(route, /OPENALEX_CALL_LIMIT = 9/);
  assert.match(route, /OPENALEX_CANDIDATE_LIMIT = 18/);
  assert.match(route, /https:\/\/api\.openalex\.org\/works/);
  assert.match(route, /`openalex:\$\{normalized\.join\("\|"\)\}`/);
  assert.match(route, /`cites:\$\{identifier\}`/);
  assert.match(route, /work\.referenced_works/);
  assert.match(route, /work\.related_works/);
  assert.match(route, /evidenceSource: "openalex"/);
  assert.match(route, /similarityStatusForEdgeCount/);
});

test("OpenAlex multi-seed candidates are selected fairly within the global cap", () => {
  const entries = [
    ...Array.from({ length: 8 }, (_, index) => ({ seed: "A", candidate: `a-${index}` })),
    ...Array.from({ length: 3 }, (_, index) => ({ seed: "B", candidate: `b-${index}` })),
    ...Array.from({ length: 3 }, (_, index) => ({ seed: "C", candidate: `c-${index}` })),
  ];
  const selected = fairRoundRobinRelations(entries, ["A", "B", "C"], (entry) => entry.candidate, (entry) => entry.seed, 6);
  assert.equal(new Set(selected.map((entry) => entry.candidate)).size, 6);
  assert.deepEqual(new Set(selected.map((entry) => entry.seed)), new Set(["A", "B", "C"]));
});

test("empty and exhausted discovery states are negative-cached while force remains an escape hatch", async () => {
  const [route, contract] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(new URL("../lib/research-network.ts", import.meta.url), "utf8"),
  ]);
  assert.match(contract, /"no_matches"/);
  assert.match(contract, /"empty"/);
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  const future = "2026-08-20T00:15:00.000Z";
  assert.equal(isFreshDiscoveryCacheEntry({ status: "ready", expiresAt: future }, false, now), false);
  assert.equal(isFreshDiscoveryCacheEntry({ status: "ready", expiresAt: future }, true, now), true);
  for (const status of ["no_matches", "partial", "unavailable", "exhausted"]) {
    assert.equal(isFreshDiscoveryCacheEntry({ status, expiresAt: future, lastExpandedAt: "2026-08-20 00:00:00" }, false, now), true);
  }
  assert.equal(isFreshDiscoveryCacheEntry({
    status: "no_matches", expiresAt: "2026-08-19T23:59:59.000Z", lastExpandedAt: "2026-08-19 23:45:00",
  }, false, now), false);
  assert.match(route, /nextOffsets\[offsetKey\] = typeof data\.next === "number" \? data\.next : -1/);
  assert.match(route, /if \(nextOffsets\[offsetKey\] < 0\)/);
  assert.match(route, /visibleSelected/);
  assert.match(route, /classifyNoNovelCoverage/);
  assert.match(route, /endpoint\.searchParams\.set\("page"/);
  assert.match(route, /force \|\| \(previousSeedState\?\.citation_offset \?\? 0\) < 0/);
  assert.match(route, /state\?\.openalex_neighbor_offset \?\? 0/);
  assert.match(route, /state\?\.openalex_citation_page \?\? 1/);
  assert.match(route, /endpoint\.searchParams\.set\("page", String\(citationPage\)\)/);
  assert.match(route, /openAlexResult\.cursorUpdates\.get\(seed\.id\)/);
  assert.doesNotMatch(route, /Math\.max\(recommendationResult\.nextOffset, openAlexResult\.nextOffset\)/);
  assert.doesNotMatch(route, /DISCOVERY_CURSOR_MARKER|encodeDiscoveryCursors|decodeDiscoveryCursors/);
});

test("legacy 24-hour negative cache is capped at fifteen minutes from the last expansion", async () => {
  const route = await readFile(routePath, "utf8");
  const lastExpandedAt = "2026-08-20 09:52:32";
  const legacyExpiry = "2026-08-21T09:52:32.885Z";
  assert.equal(isFreshDiscoveryCacheEntry({
    status: "partial", expiresAt: legacyExpiry, lastExpandedAt,
  }, false, Date.parse("2026-08-20T10:07:31.999Z")), true);
  assert.equal(isFreshDiscoveryCacheEntry({
    status: "partial", expiresAt: legacyExpiry, lastExpandedAt,
  }, false, Date.parse("2026-08-20T10:07:32.000Z")), false);
  assert.equal(isFreshDiscoveryCacheEntry({
    status: "unavailable", expiresAt: legacyExpiry, lastExpandedAt: null,
  }, false, Date.parse("2026-08-20T09:53:00.000Z")), false);
  assert.match(route, /status, last_expanded_at, expires_at/);
  assert.match(route, /lock_expires_at, last_expanded_at/);
});

test("mixed cached and live coverage never masquerades as a clean no-match", () => {
  assert.equal(classifyCoverageStatuses(["no_matches", "exhausted"]), "no_matches");
  assert.equal(classifyCoverageStatuses(["ready", "ready"]), "ok");
  assert.equal(classifyCoverageStatuses(["no_matches", "unavailable"]), "partial");
  assert.equal(classifyCoverageStatuses(["ready", "unavailable"]), "partial");
  assert.equal(classifyCoverageStatuses(["unavailable", "unavailable"]), "unavailable");

  assert.equal(classifyNoNovelCoverage({
    allTargetsCovered: true,
    anyTargetCovered: true,
    errorCount: 0,
    hasPartialSource: false,
    rateLimited: false,
  }), "no_matches");
  assert.equal(classifyNoNovelCoverage({
    allTargetsCovered: false,
    anyTargetCovered: true,
    errorCount: 1,
    hasPartialSource: true,
    rateLimited: false,
  }), "partial");
  assert.equal(classifyNoNovelCoverage({
    allTargetsCovered: false,
    anyTargetCovered: false,
    errorCount: 1,
    hasPartialSource: false,
    rateLimited: true,
  }), "rate_limited");
});

test("citation exhaustion is revisited without reopening the finite reference page", () => {
  assert.deepEqual(relationOffsetsForExpansion({ referenceOffset: -1, citationOffset: -1 }, false), {
    reference: -1,
    citation: -1,
  });
  assert.deepEqual(relationOffsetsForExpansion({ referenceOffset: -1, citationOffset: -1 }, true), {
    reference: -1,
    citation: 0,
  });
});

test("OpenAlex neighbor and citation cursors advance independently per seed and stream", () => {
  const current = { neighborOffset: 40, citationPage: 3 };
  assert.deepEqual(advanceOpenAlexSeedCursor(current, {
    neighborSucceeded: true, citationSucceeded: false, citationResultCount: 0,
  }), { neighborOffset: 60, citationPage: 3 });
  assert.deepEqual(advanceOpenAlexSeedCursor(current, {
    neighborSucceeded: false, citationSucceeded: true, citationResultCount: 40,
  }), { neighborOffset: 40, citationPage: 4 });
  assert.deepEqual(advanceOpenAlexSeedCursor(current, {
    neighborSucceeded: false, citationSucceeded: true, citationResultCount: 8,
  }), { neighborOffset: 40, citationPage: 1 });
  assert.deepEqual(advanceOpenAlexSeedCursor(current, {
    neighborSucceeded: false, citationSucceeded: false, citationResultCount: 0,
  }), current);
});

test("ready state requires visible evidence, complete coverage, and no retained issue", () => {
  assert.equal(discoveryStateForCoverage({ visible: true, coverageComplete: true, issueCount: 0, attempted: true }), "ready");
  assert.equal(discoveryStateForCoverage({ visible: true, coverageComplete: false, issueCount: 0, attempted: true }), "partial");
  assert.equal(discoveryStateForCoverage({ visible: true, coverageComplete: true, issueCount: 1, attempted: true }), "partial");
  assert.equal(discoveryStateForCoverage({ visible: false, coverageComplete: true, issueCount: 0, attempted: true }), "no_matches");
  assert.equal(discoveryStateForCoverage({ visible: false, coverageComplete: false, issueCount: 1, attempted: true }), "partial");
});

test("empty expansion behavior triggers fallback and never becomes a positive fresh result", () => {
  assert.equal(isPositiveExpansionResult(0, 0, 2, false), false);
  assert.equal(isPositiveExpansionResult(8, 0, 0, false), true);
  assert.equal(isPositiveExpansionResult(8, 1, 0, false), false);
  assert.equal(isPositiveExpansionResult(8, 0, 0, true), false);
  assert.equal(shouldUseOpenAlexFallback({
    seedCount: 1,
    semanticScholarResolvedSeedCount: 1,
    semanticScholarDirectCandidateCount: 0,
    semanticScholarRecommendationCount: 0,
    semanticScholarErrorCount: 0,
    semanticScholarEmptyRelationCount: 2,
  }), true);
  assert.equal(shouldUseOpenAlexFallback({
    seedCount: 1,
    semanticScholarResolvedSeedCount: 1,
    semanticScholarDirectCandidateCount: 10,
    semanticScholarRecommendationCount: 10,
    semanticScholarErrorCount: 0,
    semanticScholarEmptyRelationCount: 0,
  }), false);
  assert.equal(similarityStatusForEdgeCount(0), "not_attempted");
  assert.equal(similarityStatusForEdgeCount(3), "ok");
});

test("OpenAlex verified citations preserve their provenance in fallback rendering", () => {
  const edge = verifiedRelationFallbackEdge("openalex:w2", {
    seedCanonicalId: "openalex:w1",
    seedCanonicalIds: ["openalex:w1"],
    joint: false,
    kind: "reference",
    direction: "seed_cites_candidate",
    isInfluential: false,
    evidenceSource: "openalex",
  });
  assert.equal(edge?.evidenceSource, "openalex");
  assert.equal(edge?.sourceCanonicalId, "openalex:w1");
  assert.equal(edge?.targetCanonicalId, "openalex:w2");
});

test("joint recommendations are not counted as verified multi-seed bridges", () => {
  const jointRecommendation = {
    seedCanonicalId: "doi:a",
    seedCanonicalIds: ["doi:a", "doi:b"],
    joint: true,
    kind: "recommendation",
    direction: "undirected",
    isInfluential: false,
    evidenceSource: "semantic-scholar",
  };
  assert.equal(verifiedSeedCoverage([jointRecommendation]), 0);
  assert.equal(isVerifiedBridge([jointRecommendation]), false);
  const directRelations = [
    { ...jointRecommendation, seedCanonicalIds: ["doi:a"], joint: false, kind: "reference", direction: "seed_cites_candidate" },
    { ...jointRecommendation, seedCanonicalId: "doi:b", seedCanonicalIds: ["doi:b"], joint: false, kind: "citation", direction: "candidate_cites_seed" },
  ];
  assert.equal(verifiedSeedCoverage(directRelations), 2);
  assert.equal(isVerifiedBridge(directRelations), true);
});

test("verified citation fallback has an explicit directed render contract", () => {
  const edge = verifiedRelationFallbackEdge("doi:candidate", {
    seedCanonicalId: "doi:seed",
    seedCanonicalIds: ["doi:seed"],
    joint: false,
    kind: "citation",
    direction: "candidate_cites_seed",
    isInfluential: true,
    evidenceSource: "semantic-scholar",
  });
  assert.deepEqual(edge, {
    sourceCanonicalId: "doi:candidate",
    targetCanonicalId: "doi:seed",
    weight: 100,
    sharedReferences: 0,
    kind: "verified_citation",
    renderAs: "directed_citation",
    fallback: true,
    direction: "source_cites_target",
    evidenceSource: "semantic-scholar",
  });
});

test("per-seed cache expands B when only A is fresh", () => {
  const seeds = [{ id: "A", canonicalId: "doi:a" }, { id: "B", canonicalId: "doi:b" }];
  const partial = partitionExpansionSeeds(seeds, new Set(["A"]), false, false);
  assert.deepEqual(partial.hitSeeds.map((seed) => seed.id), ["A"]);
  assert.deepEqual(partial.expandSeeds.map((seed) => seed.id), ["B"]);
  assert.equal(partial.fullyCached, false);
  assert.equal(partitionExpansionSeeds(seeds, new Set(["A", "B"]), true, false).fullyCached, true);
  const forced = partitionExpansionSeeds(seeds, new Set(["A", "B"]), true, true);
  assert.equal(forced.fullyCached, false);
  assert.deepEqual(forced.expandSeeds.map((seed) => seed.id), ["A", "B"]);
});

test("a complete cache hit performs no upstream scholarly request", async () => {
  const route = await readFile(routePath, "utf8");
  const branchStart = route.indexOf("if (partition.fullyCached)");
  const cachedBranch = route.slice(branchStart, route.indexOf("let seedResult", branchStart));
  assert.ok(cachedBranch.length > 0);
  assert.doesNotMatch(cachedBranch, /resolveSemanticScholarSeeds|buildSimilarityEdges|semanticScholarFetch/);
  assert.match(cachedBranch, /cachedSimilarityEdges/);
  assert.match(cachedBranch, /similarity_status === "ready"/);
  assert.match(cachedBranch, /cachedCoverageStatus === "unavailable" \? "partial"/);
  assert.match(cachedBranch, /\{ status: 200 \}/);
});

test("Semantic Scholar calls are serialized, cross-isolate leased, and atomically counted", async () => {
  const [helper, quota] = await Promise.all([readFile(semanticScholarPath, "utf8"), readFile(semanticScholarQuotaPath, "utf8")]);
  assert.match(helper, /queueSemanticScholar\(async \(\) =>/);
  assert.match(helper, /await writeThrottle\(context, scopeKeys, 429, delay, true\)/);
  assert.match(helper, /UPDATE semantic_scholar_throttles SET next_allowed_at = \?/);
  assert.match(helper, /next_allowed_at IS NULL OR next_allowed_at <= \?/);
  assert.match(helper, /reservation\.meta\.changes/);
  assert.match(helper, /next_allowed_at < excluded\.next_allowed_at/);
  assert.match(helper, /reserveSemanticScholarUsage/);
  assert.match(quota, /WITH quota\(scope, quota_limit, new_id\)/);
  assert.match(quota, /WHERE NOT EXISTS/);
  assert.match(quota, /existing\.request_count >= required\.quota_limit/);
  assert.match(quota, /result\.meta\.changes \|\| 0\) === quotas\.length/);
  assert.match(helper, /const totalScope = "semantic-scholar-external:global"/);
  assert.match(helper, /const spaceScope = `semantic-scholar-space:\$\{context\.spaceId\}`/);
  assert.match(helper, /semantic-scholar-feature:\$\{context\.feature\}:\$\{context\.spaceId\}/);
  assert.doesNotMatch(helper, /semantic-scholar-external:\$\{context\.spaceId\}/);
});

function quotaDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE ai_usage_daily (
    id TEXT PRIMARY KEY NOT NULL,
    scope TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope, usage_date)
  )`);
  const database = {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) {
          bindings = values;
          return statement;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
  };
  return { sqlite, database };
}

const quotaDate = "2026-08-20";
const quotaLayers = [
  { scope: "semantic-scholar-external:global", limit: 5 },
  { scope: "semantic-scholar-space:space-a", limit: 4 },
  { scope: "semantic-scholar-feature:research-network:space-a", limit: 3 },
];

function setQuotaCounts(sqlite, counts) {
  const insert = sqlite.prepare("INSERT INTO ai_usage_daily (id, scope, usage_date, request_count) VALUES (?, ?, ?, ?)");
  quotaLayers.forEach((quota, index) => insert.run(`row-${index}`, quota.scope, quotaDate, counts[index]));
}

function quotaCounts(sqlite) {
  const query = sqlite.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ?");
  return quotaLayers.map((quota) => Number(query.get(quota.scope, quotaDate)?.request_count || 0));
}

for (const boundary of [
  { name: "feature", before: [2, 2, 3] },
  { name: "space", before: [2, 4, 1] },
  { name: "global", before: [5, 1, 1] },
]) {
  test(`atomic Semantic Scholar quota leaves every layer unchanged when ${boundary.name} is full`, async () => {
    const { sqlite, database } = quotaDatabase();
    try {
      setQuotaCounts(sqlite, boundary.before);
      assert.equal(await reserveSemanticScholarUsage(database, quotaLayers, quotaDate), false);
      assert.deepEqual(quotaCounts(sqlite), boundary.before);
    } finally {
      sqlite.close();
    }
  });
}

test("concurrent quota reservations cannot both consume the final shared slot", async () => {
  const { sqlite, database } = quotaDatabase();
  const finalSlot = quotaLayers.map((quota) => ({ ...quota, limit: 1 }));
  try {
    const results = await Promise.all([
      reserveSemanticScholarUsage(database, finalSlot, quotaDate),
      reserveSemanticScholarUsage(database, finalSlot, quotaDate),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(quotaCounts(sqlite), [1, 1, 1]);
  } finally {
    sqlite.close();
  }
});

test("monitor discovery shares the Semantic Scholar throttle and never performs fixed-delay retries", async () => {
  const monitor = await readFile(monitorPath, "utf8");
  assert.match(monitor, /import \{ fetchSemanticScholar \} from "\.\.\/\.\.\/\.\.\/lib\/semantic-scholar"/);
  assert.match(monitor, /feature: "monitor"/);
  assert.match(monitor, /featureDailyLimit: MONITOR_SEMANTIC_SCHOLAR_DAILY_LIMIT/);
  assert.match(monitor, /maxRetries: 1/);

  const functionBlock = (startName, endName) => {
    const start = monitor.indexOf(`async function ${startName}`);
    const end = monitor.indexOf(`async function ${endName}`, start + 1);
    assert.ok(start >= 0 && end > start, `${startName} source block is available`);
    return monitor.slice(start, end);
  };
  const semanticBlocks = [
    functionBlock("fetchSemanticScholarHorizon", "fetchOpenAlexHorizon"),
    functionBlock("fetchCitationFrontier", "ownedSpace"),
    functionBlock("fetchSemanticScholarAbstracts", "fetchOpenAlexAbstracts"),
  ];
  for (const block of semanticBlocks) {
    assert.match(block, /monitorSemanticScholarFetch\(/);
    assert.doesNotMatch(block, /await fetch\(endpoint/);
    assert.doesNotMatch(block, /setTimeout\(resolve, 900\)/);
  }
});

test("429 opens a safe route circuit and does not fan out recommendations", async () => {
  const [route, helper, contract] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(semanticScholarPath, "utf8"),
    readFile(new URL("../lib/research-network.ts", import.meta.url), "utf8"),
  ]);
  assert.match(helper, /headers\.get\("retry-after"\)/);
  assert.match(helper, /1_200 \* \(2 \*\* attempt\)/);
  assert.match(helper, /SemanticScholarRateLimitError/);
  assert.match(route, /if \(!isSemanticScholarCircuitError\(error\)\) throw error/);
  assert.match(route, /Never turn one failed joint request into an N-request fan-out/);
  assert.match(route, /return \{ results, errors, emptyKinds, exhaustedKinds, attemptedKinds, nextOffsets, circuitError: error \}/);
  assert.match(route, /if \(relationResult\.circuitError\)/);
  assert.match(route, /directRelationResults\.push\(relationResult\)/);
  assert.doesNotMatch(route, /errors\.push\(error instanceof Error \? error\.message/);
  assert.match(route, /rateLimited: Boolean\(circuitError\)/);
  assert.match(route, /status: responseStatus/);
  assert.match(route, /retryAfterSeconds/);
  assert.match(contract, /status: "ok" \| "no_matches" \| "partial" \| "unavailable" \| "rate_limited"/);
  assert.match(contract, /retryAfterSeconds: number \| null/);
});

test("similarity results and expansion locks are persisted for cache-safe rebuilds", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /tryAcquireExpansionLock/);
  assert.match(route, /saveSimilarityState/);
  assert.match(route, /similarityStatus === "ok" \? CACHE_HOURS/);
  assert.match(route, /releaseExpansionLock/);
  assert.match(route, /directRelationEdges\(candidates\)/);
});

test("expansion lock is token-guarded, renewed, and exception-safe", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /EXPANSION_LOCK_LEASE_MS = 120_000/);
  assert.match(route, /async function renewExpansionLock/);
  assert.match(route, /SET lock_expires_at = \?, status = 'building'/);
  assert.match(route, /WHERE space_id = \? AND expansion_key = \? AND lock_token = \?/);
  assert.match(route, /Research-network expansion lease was lost/);
  assert.ok((route.match(/await renewExpansionLock\(/g) || []).length >= 5);

  const lockedFlow = route.slice(route.indexOf("let expansionLockStatus"), route.indexOf("async function candidateWithRelations"));
  assert.match(lockedFlow, /try \{/);
  assert.match(lockedFlow, /catch \(error\) \{/);
  assert.match(lockedFlow, /finally \{/);
  assert.match(lockedFlow, /await releaseExpansionLock\(database, spaceId, expansionKey, expansionLockToken, expansionLockStatus\)/);
  assert.match(lockedFlow, /status: stale\.length \? "partial" : "unavailable"/);
  assert.match(lockedFlow, /sourceStatus: \{ semanticScholar: "unavailable"/);
});

test("research-network candidate cache is represented in schema, runtime bootstrap, and migration", async () => {
  const [schema, repository, migration, continuationMigration, throttleMigration, openAlexCursorMigration] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(repositoryPath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(continuationMigrationPath, "utf8"),
    readFile(throttleMigrationPath, "utf8"),
    readFile(openAlexCursorMigrationPath, "utf8"),
  ]);
  for (const source of [schema, repository, migration]) {
    assert.match(source, /research_network_candidates/);
    assert.match(source, /research_network_candidate_edges/);
  }
  assert.match(schema, /idx_research_network_candidate_edges_unique/);
  assert.match(migration, /FOREIGN KEY \(`candidate_id`\)/);
  assert.match(continuationMigration, /research_network_seed_expansion_states/);
  assert.match(continuationMigration, /research_network_expansion_states/);
  assert.match(continuationMigration, /ADD `expansion_key`/);
  for (const source of [schema, repository, throttleMigration]) {
    assert.match(source, /semantic_scholar_throttles/);
  }
  assert.match(throttleMigration, /ADD `similarity_json`/);
  assert.match(throttleMigration, /ADD `lock_token`/);
  for (const source of [schema, repository, openAlexCursorMigration]) {
    assert.match(source, /openalex_neighbor_offset/);
    assert.match(source, /openalex_citation_page/);
  }
  assert.doesNotMatch(repository, /ALTER TABLE research_network_seed_expansion_states ADD COLUMN openalex_(?:neighbor_offset|citation_page)/);
  assert.equal((openAlexCursorMigration.match(/ALTER TABLE `research_network_seed_expansion_states` ADD/g) || []).length, 2);
});

test("OpenAlex cursor migration adds durable per-seed defaults to a legacy state table", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE research_network_seed_expansion_states (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      seed_paper_id TEXT NOT NULL,
      reference_offset INTEGER NOT NULL DEFAULT 0,
      citation_offset INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle'
    )`);
    sqlite.exec(await readFile(openAlexCursorMigrationPath, "utf8"));
    sqlite.exec(`CREATE TABLE IF NOT EXISTS research_network_seed_expansion_states (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      seed_paper_id TEXT NOT NULL,
      reference_offset INTEGER NOT NULL DEFAULT 0,
      citation_offset INTEGER NOT NULL DEFAULT 0,
      openalex_neighbor_offset INTEGER NOT NULL DEFAULT 0,
      openalex_citation_page INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'idle'
    )`);
    const columns = sqlite.prepare("PRAGMA table_info(research_network_seed_expansion_states)").all();
    const byName = new Map(columns.map((column) => [column.name, column]));
    assert.equal(byName.get("openalex_neighbor_offset")?.dflt_value, "0");
    assert.equal(byName.get("openalex_citation_page")?.dflt_value, "1");
    sqlite.prepare("INSERT INTO research_network_seed_expansion_states (id, space_id, seed_paper_id) VALUES (?, ?, ?)").run("a", "space", "seed-a");
    sqlite.prepare("INSERT INTO research_network_seed_expansion_states (id, space_id, seed_paper_id) VALUES (?, ?, ?)").run("b", "space", "seed-b");
    sqlite.prepare("UPDATE research_network_seed_expansion_states SET openalex_neighbor_offset = ? WHERE seed_paper_id = ?").run(20, "seed-a");
    sqlite.prepare("UPDATE research_network_seed_expansion_states SET openalex_citation_page = ? WHERE seed_paper_id = ?").run(2, "seed-b");
    const rows = sqlite.prepare("SELECT seed_paper_id, openalex_neighbor_offset, openalex_citation_page FROM research_network_seed_expansion_states ORDER BY seed_paper_id").all()
      .map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { seed_paper_id: "seed-a", openalex_neighbor_offset: 20, openalex_citation_page: 1 },
      { seed_paper_id: "seed-b", openalex_neighbor_offset: 0, openalex_citation_page: 2 },
    ]);
  } finally {
    sqlite.close();
  }
});
