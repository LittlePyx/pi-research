import test from "node:test";
import assert from "node:assert/strict";
import {
  isDatabaseVerifiedCitationEdge,
  isVerifiableSimilarityNeighborEdge,
  paperNetworkEdgeKey,
  selectBalancedMultiSeedEdges,
  selectMultiOriginCandidates,
  selectPaperNetworkActiveNodeIds,
  selectVerifiableOneHopEdges,
} from "../lib/paper-network.ts";

function edge(sourcePaperId, targetPaperId, kind = "similarity", confidence = 80) {
  return { sourcePaperId, targetPaperId, kind, confidence, relationKind: kind === "semantic" ? "bridges" : kind };
}

function incidentCount(edges, seedId) {
  return edges.filter((item) => item.sourcePaperId === seedId || item.targetPaperId === seedId).length;
}

test("multi-origin selection replaces duplicate seed links with another neighbor", () => {
  const candidates = [edge("A", "B", "citation", 100)];
  for (let index = 1; index <= 6; index += 1) {
    candidates.push(edge("A", `A${index}`, "similarity", 90 - index));
    candidates.push(edge("B", `B${index}`, "similarity", 90 - index));
  }
  const selected = selectBalancedMultiSeedEdges(candidates, ["A", "B"]);
  assert.equal(incidentCount(selected, "A"), 6);
  assert.equal(incidentCount(selected, "B"), 6);
  assert.equal(new Set(selected.map(paperNetworkEdgeKey)).size, selected.length);
});

test("focused one-hop keeps only independently verifiable similarity relations", () => {
  const candidates = [
    { ...edge("A", "coupled", "similarity", 80), relationKind: "bibliographic_coupling" },
    { ...edge("A", "verified", "similarity", 70), relationKind: "verified_discovery" },
    { ...edge("A", "recommended", "similarity", 99), relationKind: "recommendation_discovery" },
    { ...edge("A", "inferred", "semantic", 98), relationKind: "bridges" },
    { ...edge("X", "unrelated", "similarity", 97), relationKind: "bibliographic_coupling" },
  ];

  assert.equal(isVerifiableSimilarityNeighborEdge(candidates[0]), true);
  assert.equal(isVerifiableSimilarityNeighborEdge(candidates[1]), true);
  assert.equal(isVerifiableSimilarityNeighborEdge(candidates[2]), false);
  assert.equal(isVerifiableSimilarityNeighborEdge(candidates[3]), false);
  assert.deepEqual(
    selectVerifiableOneHopEdges(candidates, "A").map((item) => item.targetPaperId),
    ["coupled", "verified"],
  );
  assert.deepEqual(selectVerifiableOneHopEdges(candidates, "A", 1).map((item) => item.targetPaperId), ["coupled"]);
});

test("citation flow fails closed on inferred, weak, or unrecognized citation rows", () => {
  const verified = {
    ...edge("later", "prior", "citation", 100),
    relationKind: "cites",
    evidenceSource: "semantic-scholar",
  };

  assert.equal(isDatabaseVerifiedCitationEdge(verified), true);
  assert.equal(isDatabaseVerifiedCitationEdge({ ...verified, evidenceSource: "openalex" }), true);
  assert.equal(isDatabaseVerifiedCitationEdge({ ...verified, evidenceSource: "deepseek-v4-pro" }), false);
  assert.equal(isDatabaseVerifiedCitationEdge({ ...verified, relationKind: "extends" }), false);
  assert.equal(isDatabaseVerifiedCitationEdge({ ...verified, confidence: 82 }), false);
  assert.equal(isDatabaseVerifiedCitationEdge({ ...verified, kind: "semantic" }), false);
});

test("a low-confidence neighbor shared by multiple origins is retained first", () => {
  const candidates = [edge("A", "shared", "semantic", 12), edge("B", "shared", "semantic", 11)];
  for (let index = 1; index <= 7; index += 1) {
    candidates.push(edge("A", `A${index}`, "similarity", 99 - index));
    candidates.push(edge("B", `B${index}`, "similarity", 99 - index));
  }
  const selected = selectBalancedMultiSeedEdges(candidates, ["A", "B"]);
  assert.ok(selected.some((item) => item.sourcePaperId === "A" && item.targetPaperId === "shared"));
  assert.ok(selected.some((item) => item.sourcePaperId === "B" && item.targetPaperId === "shared"));
  assert.equal(incidentCount(selected, "A"), 6);
  assert.equal(incidentCount(selected, "B"), 6);
});

test("multiple relation kinds to one neighbor consume one primary slot", () => {
  const candidates = [
    edge("A", "same", "semantic", 99),
    edge("A", "same", "similarity", 95),
    edge("A", "same", "citation", 70),
    ...Array.from({ length: 7 }, (_, index) => edge("A", `N${index}`, "similarity", 90 - index)),
  ];
  const selected = selectBalancedMultiSeedEdges(candidates, ["A"]);
  const sameNeighbor = selected.filter((item) => item.sourcePaperId === "A" && item.targetPaperId === "same");
  assert.equal(sameNeighbor.length, 1);
  assert.equal(sameNeighbor[0].kind, "citation");
  assert.equal(selected.length, 6);
});

test("three origins receive equal neighborhood budgets within the global cap", () => {
  const candidates = [];
  for (const seedId of ["A", "B", "C"]) {
    for (let index = 1; index <= 7; index += 1) candidates.push(edge(seedId, `${seedId}${index}`, "similarity", 90 - index));
  }
  const selected = selectBalancedMultiSeedEdges(candidates, ["A", "B", "C"]);
  assert.equal(selected.length, 18);
  assert.equal(incidentCount(selected, "A"), 6);
  assert.equal(incidentCount(selected, "B"), 6);
  assert.equal(incidentCount(selected, "C"), 6);
});

function candidate(canonicalId, score, seedIds, bridge = false) {
  return { canonicalId, score, seedCoverage: seedIds.length, bridge, relations: seedIds.map((seedCanonicalId) => ({ seedCanonicalId })) };
}

test("shared and bridge multi-origin intents answer a joint seed question", () => {
  const candidates = [
    candidate("shared", 70, ["A", "B"]),
    candidate("a-only", 99, ["A"]),
    candidate("b-only", 98, ["B"]),
    candidate("bridge", 65, ["A", "B"], true),
  ];
  assert.deepEqual(selectMultiOriginCandidates(candidates, ["A", "B"], "shared").map((item) => item.canonicalId), ["bridge", "shared"]);
  assert.equal(selectMultiOriginCandidates(candidates, ["A", "B"], "bridge")[0].canonicalId, "bridge");
});

test("joint-origin intents never fall back to a union or stale server coverage", () => {
  const stale = { ...candidate("stale", 99, ["OLD-1", "OLD-2"], true), seedCoverage: 2 };
  const oneSided = candidate("one-sided", 98, ["A"], true);
  assert.deepEqual(selectMultiOriginCandidates([stale, oneSided], ["A", "B"], "shared"), []);
  assert.deepEqual(selectMultiOriginCandidates([stale, oneSided], ["A", "B"], "bridge"), []);
});

test("multi-origin recommendations do not masquerade as independent shared evidence", () => {
  const recommended = {
    canonicalId: "joint-recommendation",
    score: 99,
    seedCoverage: 2,
    bridge: true,
    relations: [
      { seedCanonicalId: "A", kind: "recommendation" },
      { seedCanonicalId: "B", kind: "recommendation" },
    ],
  };
  assert.deepEqual(selectMultiOriginCandidates([recommended], ["A", "B"], "shared"), []);
  assert.deepEqual(selectMultiOriginCandidates([recommended], ["A", "B"], "bridge"), []);
  assert.deepEqual(selectMultiOriginCandidates([recommended], ["A", "B"], "union").map((item) => item.canonicalId), ["joint-recommendation"]);
});

test("union comparison preserves candidates from every origin", () => {
  const candidates = [
    candidate("a1", 99, ["A"]), candidate("a2", 98, ["A"]),
    candidate("b1", 80, ["B"]), candidate("b2", 79, ["B"]),
  ];
  const selected = selectMultiOriginCandidates(candidates, ["A", "B"], "union", 4);
  assert.deepEqual(selected.map((item) => item.canonicalId), ["a1", "b1", "a2", "b2"]);
});

test("active paper window keeps the 41st formal paper reachable", () => {
  const nodes = Array.from({ length: 41 }, (_, index) => ({ id: `paper-${index + 1}`, citationCount: index }));
  const selected = selectPaperNetworkActiveNodeIds(nodes, [], [], "paper-41");
  assert.equal(selected.length, 41);
  assert.ok(selected.includes("paper-41"));
});

test("active paper window is bounded and prioritizes explicit, external, and connected nodes", () => {
  const nodes = Array.from({ length: 90 }, (_, index) => ({
    id: `paper-${index + 1}`,
    citationCount: index,
    external: index >= 86,
  }));
  const edges = [
    ...Array.from({ length: 20 }, (_, index) => edge("paper-73", `paper-${index + 1}`)),
    edge("paper-75", "paper-2"),
  ];
  const selected = selectPaperNetworkActiveNodeIds(nodes, edges, ["paper-75"], "paper-74", 72);
  assert.equal(selected.length, 72);
  assert.ok(selected.includes("paper-74"));
  assert.ok(selected.includes("paper-75"));
  assert.ok(selected.includes("paper-73"));
  for (const externalId of ["paper-87", "paper-88", "paper-89", "paper-90"]) assert.ok(selected.includes(externalId));
});
