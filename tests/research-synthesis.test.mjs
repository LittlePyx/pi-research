import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  primaryResearchSynthesisGap,
  researchSynthesisDiscoveryQuery,
  researchSynthesisInputRevision,
  sanitizeResearchSynthesisStatements,
} from "../lib/research-synthesis.ts";

test("a synthesis revision changes only when grounded source identity changes", async () => {
  const base = [
    { claimId: "claim-a", paperId: "paper-a", evidenceLevel: "fulltext", textHash: "hash-a" },
    { claimId: "claim-b", paperId: "paper-b", evidenceLevel: "abstract", textHash: "hash-b" },
  ];
  assert.equal(await researchSynthesisInputRevision(base), await researchSynthesisInputRevision([...base].reverse()));
  assert.notEqual(await researchSynthesisInputRevision(base), await researchSynthesisInputRevision([
    ...base.slice(0, 1), { ...base[1], textHash: "hash-b2" },
  ]));
});

test("cross-paper claims require traceable claim ids and genuinely distinct papers", () => {
  const sources = new Map([
    ["claim-a", { paperId: "paper-a", evidenceLevel: "fulltext" }],
    ["claim-b", { paperId: "paper-b", evidenceLevel: "fulltext" }],
  ]);
  const result = sanitizeResearchSynthesisStatements([
    { kind: "consensus", titleZh: "共同结论", titleEn: "Shared conclusion", textZh: "两篇论文在给定条件下支持同一判断。", textEn: "Both papers support the same conclusion under the stated regime.", confidence: 99, sourceClaimIds: ["claim-a", "claim-b"] },
    { kind: "disagreement", titleZh: "伪分歧", titleEn: "False disagreement", textZh: "只有单篇论文不能构成分歧。", textEn: "One paper cannot establish a disagreement.", confidence: 90, sourceClaimIds: ["claim-a"] },
    { kind: "qualification", titleZh: "条件边界", titleEn: "Boundary condition", textZh: "这一结论只在额外假设下成立。", textEn: "The conclusion holds only under an additional assumption.", confidence: 99, sourceClaimIds: ["claim-a", "invented"] },
  ], sources);
  assert.equal(result.length, 2);
  assert.equal(result[0].confidence, 92);
  assert.deepEqual(result[0].sourcePaperIds, ["paper-a", "paper-b"]);
  assert.equal(result[1].confidence, 78);
});

test("the highest-confidence evidence gap becomes the next discovery signal", () => {
  const gap = primaryResearchSynthesisGap([
    { kind: "evidence_gap", confidence: 61, id: "a" },
    { kind: "consensus", confidence: 95, id: "b" },
    { kind: "evidence_gap", confidence: 76, id: "c" },
  ]);
  assert.equal(gap?.id, "c");
});

test("synthesis discovery requires a traceable evidence-gap statement and safe query", () => {
  const gap = [{ kind: "evidence_gap", confidence: 76 }];
  assert.equal(researchSynthesisDiscoveryQuery("inverse stability compactness", gap), "inverse stability compactness");
  assert.equal(researchSynthesisDiscoveryQuery("inverse stability AND compactness", gap), "");
  assert.equal(researchSynthesisDiscoveryQuery("inverse stability compactness", [{ kind: "consensus", confidence: 90 }]), "");
});

test("route synthesis is source-linked, incremental, and feeds daily discovery", async () => {
  const [api, client, monitor, map, repository, schema] = await Promise.all([
    readFile(new URL("../app/api/research-synthesis/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(api, /claim\.grounded = 1/);
  assert.match(api, /sourceClaimIds/);
  assert.match(api, /Distinguish a real contradiction/);
  assert.match(api, /research_synthesis_revisions/);
  assert.match(api, /nextSearchSourceStatementId/);
  assert.match(api, /researchSynthesisDiscoveryQuery/);
  assert.match(client, /"共识、分歧与缺口"/);
  assert.match(client, /回到来源核对/);
  assert.match(client, /claim \{source\.claimId\}/);
  assert.match(client, /来自证据缺口/);
  assert.match(monitor, /synthesis_next_search_query/);
  assert.match(monitor, /Grounded cross-paper synthesis/);
  assert.match(map, /SELECT next_search_query FROM research_syntheses/);
  assert.match(repository, /researchSynthesisBootstrapSql/);
  assert.match(schema, /researchSynthesisStatements/);
});
