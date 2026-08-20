import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { isVerifiedBridge, partitionExpansionSeeds, verifiedRelationFallbackEdge, verifiedSeedCoverage } from "../lib/research-network.ts";
import { reserveSemanticScholarUsage } from "../lib/semantic-scholar-quota.ts";

const routePath = new URL("../app/api/research-network/route.ts", import.meta.url);
const schemaPath = new URL("../db/schema.ts", import.meta.url);
const repositoryPath = new URL("../db/repository.ts", import.meta.url);
const semanticScholarPath = new URL("../lib/semantic-scholar.ts", import.meta.url);
const semanticScholarQuotaPath = new URL("../lib/semantic-scholar-quota.ts", import.meta.url);
const monitorPath = new URL("../app/api/monitor/route.ts", import.meta.url);
const migrationPath = new URL("../drizzle/0022_bright_kat_farrell.sql", import.meta.url);
const continuationMigrationPath = new URL("../drizzle/0023_lethal_unicorn.sql", import.meta.url);
const throttleMigrationPath = new URL("../drizzle/0024_dry_nitro.sql", import.meta.url);

test("research-network expansion uses verified external relations, cache, and coupling", async () => {
  const route = await readFile(routePath, "utf8");
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
  assert.match(route, /status = 'dismissed'/);
  assert.match(route, /status = 'accepted'/);
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
});

test("a complete cache hit performs no upstream scholarly request", async () => {
  const route = await readFile(routePath, "utf8");
  const branchStart = route.indexOf("if (partition.fullyCached)");
  const cachedBranch = route.slice(branchStart, route.indexOf("let seedResult", branchStart));
  assert.ok(cachedBranch.length > 0);
  assert.doesNotMatch(cachedBranch, /resolveSemanticScholarSeeds|buildSimilarityEdges|semanticScholarFetch/);
  assert.match(cachedBranch, /cachedSimilarityEdges/);
  assert.match(cachedBranch, /similarity_status === "ready"/);
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
  assert.match(route, /return \{ results, errors, nextOffsets, circuitError: error \}/);
  assert.match(route, /if \(relationResult\.circuitError\)/);
  assert.match(route, /directRelationResults\.push\(relationResult\)/);
  assert.doesNotMatch(route, /errors\.push\(error instanceof Error \? error\.message/);
  assert.match(route, /status: circuitError \? "rate_limited"/);
  assert.match(route, /retryAfterSeconds/);
  assert.match(contract, /status: "ok" \| "partial" \| "unavailable" \| "rate_limited"/);
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
  const [schema, repository, migration, continuationMigration, throttleMigration] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(repositoryPath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(continuationMigrationPath, "utf8"),
    readFile(throttleMigrationPath, "utf8"),
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
});
