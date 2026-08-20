import test from "node:test";
import assert from "node:assert/strict";
import { researchPaperCoverageHash, researchPaperSetRevision, selectResearchPaperCoverage } from "../lib/research-map.ts";

function paper(index, overrides = {}) {
  return {
    id: `paper-${index}`,
    canonicalId: `doi:10.1000/${String(index).padStart(4, "0")}`,
    trackId: `track-${index % 5}`,
    publishedAt: new Date(Date.UTC(1990 + index % 35, 0, 1)).toISOString(),
    createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(),
    citationCount: (index * 37) % 500,
    role: index % 7 === 0 ? "foundation" : index % 3 === 0 ? "milestone" : "frontier",
    ...overrides,
  };
}

test("a newly accepted 41st paper enters the next bounded coverage window", () => {
  const existing = Array.from({ length: 40 }, (_, index) => paper(index + 1));
  const accepted = paper(41, { publishedAt: "1985-01-01T00:00:00.000Z", createdAt: "2026-08-20T12:00:00.000Z" });
  const coverage = selectResearchPaperCoverage([...existing, accepted], 0, 40);
  assert.equal(coverage.paperIds.length, 40);
  assert.ok(coverage.latestPaperIds.includes(accepted.id));
  assert.ok(coverage.paperIds.includes(accepted.id));
});

test("rotation covers a 120-paper library without growing a single build beyond 40", () => {
  const papers = Array.from({ length: 120 }, (_, index) => paper(index + 1));
  const seen = new Set();
  let cursor = 0;
  for (let build = 0; build < 12; build += 1) {
    const coverage = selectResearchPaperCoverage(papers, cursor, 40);
    assert.equal(coverage.paperIds.length, 40);
    coverage.paperIds.forEach((id) => seen.add(id));
    cursor = coverage.nextCursor;
  }
  assert.equal(seen.size, papers.length);
});

test("coverage and paper-set revisions are deterministic and change with membership", () => {
  const papers = Array.from({ length: 80 }, (_, index) => paper(index + 1));
  const first = selectResearchPaperCoverage(papers, 19, 40);
  const repeated = selectResearchPaperCoverage([...papers].reverse(), 19, 40);
  assert.deepEqual(repeated.paperIds, first.paperIds);
  assert.equal(researchPaperCoverageHash(repeated.paperIds), researchPaperCoverageHash(first.paperIds));
  const revision = researchPaperSetRevision(papers);
  assert.equal(researchPaperSetRevision([...papers].reverse()), revision);
  assert.notEqual(researchPaperSetRevision([...papers, paper(81)]), revision);
});
