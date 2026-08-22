import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  evidenceVerificationReport,
  resolvedEvidenceVerificationStatus,
  sanitizeEvidenceVerificationDraft,
} from "../lib/evidence-verification.ts";

const fields = ["summary", "method", "contribution"];

test("a verifier cannot mark incomplete or risky evidence as verified", () => {
  const result = sanitizeEvidenceVerificationDraft({
    verdict: "verified",
    coverageScore: 96,
    supportedFields: ["summary", "invented-field"],
    unsupportedFields: ["method"],
    overstatements: ["Claims a proof not stated by the abstract"],
  }, { allowedFields: fields });
  assert.equal(result.verdict, "revise");
  assert.equal(result.clean, false);
  assert.deepEqual(result.supportedFields, ["summary"]);
  assert.deepEqual(result.unsupportedFields, ["method"]);
});

test("verification retains only real evidence ids", () => {
  const result = sanitizeEvidenceVerificationDraft({
    verdict: "verified",
    coverageScore: 95,
    supportedFields: fields,
    supportedEvidenceIds: ["claim-a", "invented"],
    claimChecks: fields.map((field) => ({ field, claimExcerpt: `${field} statement`, evidenceId: "claim-a", evidenceQuote: "bounded evidence", verdict: "supported" })),
  }, { allowedFields: fields, allowedEvidenceIds: new Set(["claim-a"]), evidenceById: new Map([["claim-a", "The source contains bounded evidence."]]), requireAllFields: true });
  assert.equal(result.clean, true);
  assert.deepEqual(result.supportedEvidenceIds, ["claim-a"]);
});

test("one clean post-revision pass is recorded as revised; a second failure degrades", () => {
  const initial = sanitizeEvidenceVerificationDraft({ verdict: "revise", coverageScore: 72, unsupportedFields: ["method"] }, { allowedFields: fields });
  const cleanRevision = sanitizeEvidenceVerificationDraft({
    verdict: "verified", coverageScore: 94, supportedFields: fields,
    claimChecks: fields.map((field) => ({ field, claimExcerpt: `${field} statement`, evidenceQuote: "source evidence", verdict: "supported" })),
  }, { allowedFields: fields, evidenceTexts: ["Source evidence supports this bounded statement."], requireAllFields: true });
  const failedRevision = sanitizeEvidenceVerificationDraft({ verdict: "insufficient", coverageScore: 60, unsupportedFields: ["contribution"] }, { allowedFields: fields });
  assert.equal(resolvedEvidenceVerificationStatus({ initial, revised: cleanRevision }), "revised");
  assert.equal(resolvedEvidenceVerificationStatus({ initial, revised: failedRevision }), "degraded");
  assert.equal(evidenceVerificationReport({ initial, revised: cleanRevision }).coverageScore, 94);
});

test("recommendations and research actions use independent verification and fail closed", async () => {
  const [monitor, actions, map, problem, client, schema, repository, migration] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-actions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-problem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0035_cool_lady_bullseye.sql", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /independent recommendation evidence verifier/i);
  assert.match(monitor, /verifyRecommendationBatch/);
  assert.match(monitor, /degradedRecommendationReview/);
  assert.match(monitor, /deepseek_verification_pending/);
  assert.match(monitor, /verificationRetryable: true/);
  assert.match(monitor, /verification_pending/);
  assert.match(actions, /independent evidence verifier/i);
  assert.match(actions, /verifyResearchAction/);
  assert.match(actions, /degradedResearchAction/);
  assert.match(map, /verification_status IN \('verified', 'revised'\)/);
  assert.match(problem, /verification_status IN \('verified', 'revised'\)/);
  assert.match(client, /推荐内容已核验/);
  assert.match(client, /证据不足，原结论未发布/);
  assert.match(schema, /verificationCoverageScore/);
  assert.match(schema, /verificationJson/);
  assert.match(repository, /ensureEvidenceVerificationColumns/);
  assert.match(migration, /ALTER TABLE `research_action_runs` ADD `verification_status`/);
  assert.match(migration, /ALTER TABLE `recommendation_audit_events` ADD `verification_json`/);
  assert.match(migration, /PRAGMA optimize/);
});

test("a transient verifier timeout preserves the draft and resumes verification only", async () => {
  const [monitor, verification, client] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/evidence-verification.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(verification, /"pending"/);
  assert.match(monitor, /function pendingRecommendationReview/);
  assert.match(monitor, /verificationStatus: "pending"/);
  assert.match(monitor, /checkpoint === "verifying_recommendations"/);
  assert.match(monitor, /draftPreserved: true, retryScope: "verification_only"/);
  assert.match(monitor, /work\.verificationFailureCount >= 2/);
  assert.match(monitor, /remaining drafts were deferred without more model calls/);
  assert.match(monitor, /verificationCarryover/);
  assert.match(monitor, /previousWork\.verificationDeferredIds = \[\]/);
  assert.match(monitor, /i\.verification_status = 'degraded'[\s\S]*lower\(i\.screening_reason\) LIKE '%timeout%'/);
  assert.match(monitor, /AbortSignal\.timeout\(attempt === 0 \? 18_000 : 12_000\)/);
  assert.match(monitor, /thinking: \{ type: "disabled" \}/);
  assert.match(monitor, /isPublishedRecommendation\(review\) \? 1 : 0/);
  assert.match(monitor, /deepseek_verification_pending/);
  assert.doesNotMatch(monitor, /\.\.\.degradedRecommendationReview\(review, evidenceVerificationReport\(\{ initial \}\)\),\s*verificationRetryable: true/);
  assert.match(client, /篇高潜力解读待核验/);
});

test("the verification migration applies to existing recommendation and action tables", async () => {
  const migration = await readFile(new URL("../drizzle/0035_cool_lady_bullseye.sql", import.meta.url), "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE paper_insights (paper_id TEXT PRIMARY KEY)");
  database.exec("CREATE TABLE recommendation_audit_events (id TEXT PRIMARY KEY)");
  database.exec("CREATE TABLE research_action_runs (id TEXT PRIMARY KEY)");
  for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) database.exec(statement);
  const insightColumns = database.prepare("PRAGMA table_info(paper_insights)").all().map((row) => row.name);
  const auditColumns = database.prepare("PRAGMA table_info(recommendation_audit_events)").all().map((row) => row.name);
  const actionColumns = database.prepare("PRAGMA table_info(research_action_runs)").all().map((row) => row.name);
  assert.ok(insightColumns.includes("verification_status"));
  assert.ok(auditColumns.includes("verification_json"));
  assert.ok(actionColumns.includes("verification_output_tokens"));
  database.close();
});
