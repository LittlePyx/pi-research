import test from "node:test";
import assert from "node:assert/strict";
import { paperNetworkEdgeKey, selectBalancedMultiSeedEdges } from "../lib/paper-network.ts";

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
