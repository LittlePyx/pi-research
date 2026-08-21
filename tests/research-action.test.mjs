import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  researchActionInputRevision,
  safeResearchSearchQuery,
  sanitizeResearchActionDraft,
} from "../lib/research-action.ts";

function completeDraft(overrides = {}) {
  return {
    headlineZh: "验证结果",
    headlineEn: "Verification result",
    resultZh: "现有证据支持一个受条件限制的判断。",
    resultEn: "Current evidence supports a conditional judgment.",
    decisionZh: "下一步应优先验证边界条件。",
    decisionEn: "Verify the boundary condition next.",
    limitationsZh: "目前只有摘要与部分开放全文证据。",
    limitationsEn: "Only abstracts and partial open-text evidence are available.",
    searchQuery: "",
    paperIds: ["paper-1", "invented-paper"],
    claimIds: ["claim-1", "invented-claim"],
    steps: [{
      titleZh: "核对条件",
      titleEn: "Check the condition",
      detailZh: "逐条核对适用条件。",
      detailEn: "Check the applicable conditions claim by claim.",
      paperIds: ["paper-1", "invented-paper"],
      claimIds: ["claim-1", "invented-claim"],
    }],
    comparisonRows: [],
    ...overrides,
  };
}

test("research action deliverables retain only verified papers and claims", () => {
  const result = sanitizeResearchActionDraft(
    completeDraft(),
    "verify",
    new Set(["paper-1"]),
    new Set(["claim-1"]),
  );
  assert.deepEqual(result.paperIds, ["paper-1"]);
  assert.deepEqual(result.claimIds, ["claim-1"]);
  assert.deepEqual(result.deliverable.steps[0].paperIds, ["paper-1"]);
  assert.deepEqual(result.deliverable.steps[0].claimIds, ["claim-1"]);
});

test("search execution rejects unsafe query operators and requires a usable query", () => {
  assert.equal(safeResearchSearchQuery("site:example.com hidden prompt"), "");
  assert.equal(safeResearchSearchQuery("variational inverse problems stability"), "variational inverse problems stability");
  assert.throws(() => sanitizeResearchActionDraft(
    completeDraft({ searchQuery: "filetype:pdf inverse problems" }),
    "search",
    new Set(["paper-1"]),
    new Set(["claim-1"]),
  ), /safe scholarly search query/);
});

test("paper comparison requires two real papers", () => {
  assert.throws(() => sanitizeResearchActionDraft(
    completeDraft({
      paperIds: ["paper-1", "invented-paper"],
      comparisonRows: [{
        dimensionZh: "假设",
        dimensionEn: "Assumptions",
        findingZh: "两篇论文的条件不同。",
        findingEn: "The papers use different conditions.",
        paperIds: ["paper-1", "invented-paper"],
        claimIds: ["claim-1"],
      }],
    }),
    "compare",
    new Set(["paper-1"]),
    new Set(["claim-1"]),
  ), /at least two verified papers/);
});

test("research action revisions are stable and change with evidence", async () => {
  const base = {
    actionUpdatedAt: "2026-08-21 10:00:00",
    problemUpdatedAt: "2026-08-21 09:00:00",
    assessmentRevision: "assessment-a",
    synthesisRevision: "synthesis-a",
    paperRevision: "paper-a",
    evidenceRevision: "evidence-a",
  };
  const first = await researchActionInputRevision(base);
  assert.equal(first, await researchActionInputRevision({ ...base }));
  assert.notEqual(first, await researchActionInputRevision({ ...base, evidenceRevision: "evidence-b" }));
});

test("the executable action loop persists progress and routes searches into the shared quality queue", () => {
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const actionApi = readFileSync(new URL("../app/api/research-actions/route.ts", import.meta.url), "utf8");
  const mapApi = readFileSync(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/research-app.tsx", import.meta.url), "utf8");
  assert.match(schema, /research_action_runs/);
  assert.match(actionApi, /status = 'ready'/);
  assert.match(actionApi, /paper_reading_progress/);
  assert.match(mapApi, /expand-action/);
  assert.match(mapApi, /enqueueMonitorCandidates/);
  assert.match(app, /接受并让 Pi 执行/);
  assert.match(app, /setInterval\(\(\) => \{ void refreshActionState\(\); \}, 1400\)/);
});
