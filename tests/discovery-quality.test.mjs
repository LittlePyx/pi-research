import assert from "node:assert/strict";
import test from "node:test";

import { arxivIdFromUrl, buildArxivSearchQuery, normalizeWorkTitle, parseArxivAtom } from "../lib/discovery/arxiv.ts";
import { hasStrongFitScoreContradiction, inferModelScoreScale, normalizeModelScore } from "../lib/discovery/model-score.ts";
import { passesRecommendationGate } from "../lib/discovery/review-gate.ts";

const atomFixture = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>https://arxiv.org/abs/2608.12345v2</id>
    <updated>2026-08-17T08:00:00Z</updated>
    <published>2026-08-16T08:00:00Z</published>
    <title>Information-Theoretic Learning &amp; Generalization</title>
    <summary>We study a concrete learning problem &amp; prove a sharp bound.</summary>
    <author><name>Ada Researcher</name></author>
    <author><name>Lin Scholar</name></author>
    <arxiv:doi>10.1000/example.2026.1</arxiv:doi>
    <arxiv:primary_category term="cs.LG" />
  </entry>
</feed>`;

test("parses real arXiv Atom fields without treating feed metadata as a paper", () => {
  const records = parseArxivAtom(atomFixture);
  assert.equal(records.length, 1);
  assert.equal(records[0].arxivId, "2608.12345");
  assert.equal(records[0].doi, "10.1000/example.2026.1");
  assert.equal(records[0].title, "Information-Theoretic Learning & Generalization");
  assert.deepEqual(records[0].authors, ["Ada Researcher", "Lin Scholar"]);
  assert.equal(records[0].primaryCategory, "cs.LG");
});

test("builds rotating arXiv date-window queries and stable work identities", () => {
  const query = buildArxivSearchQuery("Information Theory and Learning", new Date("2026-08-01T00:00:00Z"), new Date("2026-08-18T00:00:00Z"));
  assert.match(query, /all:"information theory and learning"/);
  assert.match(query, /submittedDate:\[202608010000 TO 202608182359\]/);
  assert.equal(arxivIdFromUrl("https://arxiv.org/abs/2608.12345v3"), "2608.12345");
  assert.equal(normalizeWorkTitle("A New Result — Preprint"), normalizeWorkTitle("A new result"));
});

test("keeps the deterministic post-LLM recommendation gate strict", () => {
  const complete = {
    isPaper: true,
    requestedRecommendation: true,
    relevanceScore: 88,
    qualityScore: 82,
    summaryZh: "具体论文介绍",
    summaryEn: "Concrete paper briefing",
    whyReadZh: "结合用户研究方向的适读理由",
    whyReadEn: "A user-specific reading rationale",
  };
  assert.equal(passesRecommendationGate(complete), true);
  assert.equal(passesRecommendationGate({ ...complete, isPaper: false }), false);
  assert.equal(passesRecommendationGate({ ...complete, relevanceScore: 74 }), false);
  assert.equal(passesRecommendationGate({ ...complete, whyReadZh: "" }), false);
});

test("normalizes accidental 0-1 model scores without corrupting genuine 0-100 scores", () => {
  const unitRecords = [
    { relevanceScore: 0.95, qualityScore: 0.78 },
    { relevanceScore: 0.4, qualityScore: 0.65 },
  ];
  const unitScale = inferModelScoreScale(unitRecords);
  assert.equal(unitScale, "unit");
  assert.equal(normalizeModelScore(unitRecords[0].relevanceScore, unitScale), 95);
  assert.equal(normalizeModelScore(unitRecords[0].qualityScore, unitScale), 78);
  assert.equal(inferModelScoreScale([{ relevanceScore: 1, qualityScore: 1, screeningReason: "Directly relevant to the core problem" }]), "unit");

  const percentRecords = [
    { relevanceScore: 88, qualityScore: 82 },
    { relevanceScore: 1, qualityScore: 0 },
  ];
  const percentScale = inferModelScoreScale(percentRecords);
  assert.equal(percentScale, "percent");
  assert.equal(normalizeModelScore(1, percentScale), 1);
  assert.equal(hasStrongFitScoreContradiction(1, "Directly relevant to the core problem"), true);
  assert.equal(hasStrongFitScoreContradiction(20, "Only an adjacent topic"), false);
});
