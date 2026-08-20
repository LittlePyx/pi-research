import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isVerifiedBridge, partitionExpansionSeeds, verifiedRelationFallbackEdge, verifiedSeedCoverage } from "../lib/research-network.ts";

const routePath = new URL("../app/api/research-network/route.ts", import.meta.url);
const schemaPath = new URL("../db/schema.ts", import.meta.url);
const repositoryPath = new URL("../db/repository.ts", import.meta.url);
const migrationPath = new URL("../drizzle/0022_bright_kat_farrell.sql", import.meta.url);
const continuationMigrationPath = new URL("../drizzle/0023_lethal_unicorn.sql", import.meta.url);

test("research-network expansion uses verified external relations, cache, and coupling", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /\/references|\["references", "citations"\]/);
  assert.match(route, /recommendations\/v1\/papers/);
  assert.match(route, /references\.paperId,references\.externalIds/);
  assert.match(route, /bibliographic_coupling/);
  assert.match(route, /MAX_SEEDS = 3/);
  assert.match(route, /CACHE_HOURS = 24/);
  assert.match(route, /endpoint\.searchParams\.set\("offset"/);
  assert.match(route, /consumeExternalCall\(budget\)/);
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
  assert.match(cachedBranch, /similarity: cached\.length \? "partial" : "not_attempted"/);
});

test("research-network candidate cache is represented in schema, runtime bootstrap, and migration", async () => {
  const [schema, repository, migration, continuationMigration] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(repositoryPath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(continuationMigrationPath, "utf8"),
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
});
