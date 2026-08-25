import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  abstractEvidenceUnits,
  evidenceVerificationReport,
  recommendationEvidencePreflight,
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

test("structured verifier warnings remain readable instead of becoming object placeholders", () => {
  const result = sanitizeEvidenceVerificationDraft({
    verdict: "revise",
    coverageScore: 84,
    supportedFields: ["summary"],
    overstatements: [{ field: "limitations", reason: "The limitation is not stated by the abstract." }],
    contradictionRisks: [{ claimExcerpt: "Always converges", description: "The supplied evidence only reports empirical convergence." }],
  }, { allowedFields: fields });
  assert.deepEqual(result.overstatements, ["The limitation is not stated by the abstract."]);
  assert.deepEqual(result.contradictionRisks, ["Always converges"]);
  assert.doesNotMatch(JSON.stringify(result), /\[object Object\]/);
});

test("verification retains only real evidence ids", () => {
  const result = sanitizeEvidenceVerificationDraft({
    verdict: "verified",
    coverageScore: 95,
    supportedFields: fields,
    supportedEvidenceIds: ["claim-a", "invented"],
    claimChecks: fields.map((field) => ({ field, claimExcerpt: `${field} statement`, evidenceId: "claim-a", verdict: "supported" })),
  }, { allowedFields: fields, allowedEvidenceIds: new Set(["claim-a"]), evidenceById: new Map([["claim-a", "The source contains bounded evidence."]]), requireAllFields: true });
  assert.equal(result.clean, true);
  assert.deepEqual(result.supportedEvidenceIds, ["claim-a"]);
  assert.equal(result.claimChecks[0].evidenceQuote, "The source contains bounded evidence.");
});

test("abstract verification requires core paper facts without pretending to prove personalized reading guidance", () => {
  const allowedFields = ["summary", "whyRead", "problem", "method", "contribution", "readingFocus"];
  const requiredFields = ["summary", "problem", "method", "contribution"];
  const evidenceById = new Map([["abstract:1", "The supplied abstract supports the bounded core paper facts."]]);
  const result = sanitizeEvidenceVerificationDraft({
    verdict: "verified",
    coverageScore: 94,
    supportedFields: requiredFields,
    supportedEvidenceIds: ["abstract:1"],
    claimChecks: requiredFields.map((field) => ({
      field,
      claimExcerpt: `${field} factual statement`,
      evidenceId: "abstract:1",
      verdict: "supported",
    })),
  }, {
    allowedFields,
    requiredFields,
    allowedEvidenceIds: new Set(evidenceById.keys()),
    evidenceById,
    requireAllFields: true,
  });
  assert.equal(result.clean, true);
  assert.equal(result.supportedFields.includes("whyRead"), false);

  const missingCore = sanitizeEvidenceVerificationDraft({
    verdict: "verified",
    coverageScore: 96,
    supportedFields: requiredFields.filter((field) => field !== "contribution"),
    claimChecks: requiredFields.filter((field) => field !== "contribution").map((field) => ({
      field,
      claimExcerpt: `${field} factual statement`,
      evidenceId: "abstract:1",
      verdict: "supported",
    })),
  }, {
    allowedFields,
    requiredFields,
    allowedEvidenceIds: new Set(evidenceById.keys()),
    evidenceById,
    requireAllFields: true,
  });
  assert.equal(missingCore.clean, false);
  assert.equal(missingCore.verdict, "revise");
});

test("verification normalizes a fractional coverage score without weakening evidence checks", () => {
  const evidence = "The abstract states the bounded contribution used by this recommendation.";
  const result = sanitizeEvidenceVerificationDraft({
    verdict: "verified",
    coverageScore: 0.96,
    supportedFields: ["summary"],
    supportedEvidenceIds: ["abstract:1"],
    claimChecks: [{
      field: "summary",
      claimExcerpt: "The paper states a bounded contribution.",
      evidenceId: "abstract:1",
      verdict: "supported",
      reason: "Directly stated in the supplied abstract.",
    }],
  }, {
    allowedFields: ["summary"],
    allowedEvidenceIds: new Set(["abstract:1"]),
    evidenceById: new Map([["abstract:1", evidence]]),
    requireAllFields: true,
  });
  assert.equal(result.coverageScore, 96);
  assert.equal(result.clean, true);
});

test("abstract evidence is split into bounded stable units for compact verification prompts", () => {
  const units = abstractEvidenceUnits(
    "First result is supported. Second result adds a bounded method. Third sentence records a limitation.",
    { prefix: "doi:10.1/test", maxUnits: 2, maxChars: 160 },
  );
  assert.deepEqual(units.map((unit) => unit.id), ["doi:10-1-test:1", "doi:10-1-test:2"]);
  assert.ok(units.every((unit) => unit.text.length <= 160));
});

test("deterministic preflight blocks missing evidence before any model audit", () => {
  const blocked = recommendationEvidencePreflight({
    title: "A complete paper title",
    availableFields: fields,
    requiredFields: fields,
    evidenceUnits: [],
  });
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.reasons, ["insufficient_abstract_evidence"]);
  const ready = recommendationEvidencePreflight({
    title: "A complete paper title",
    availableFields: fields,
    requiredFields: fields,
    evidenceUnits: [{ id: "abstract:1", text: "This abstract states a sufficiently detailed bounded result and its method for deterministic preflight checks." }],
  });
  assert.equal(ready.ready, true);
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

test("a corrected draft is decided by grounded core evidence instead of an arbitrary model score", () => {
  const evidenceById = new Map([["abstract:1", "The abstract directly supports the corrected core scientific claims."]]);
  const corrected = {
    verdict: "verified",
    coverageScore: 82,
    supportedFields: fields,
    supportedEvidenceIds: ["abstract:1"],
    claimChecks: fields.map((field) => ({
      field,
      claimExcerpt: `${field} corrected claim`,
      evidenceId: "abstract:1",
      verdict: "supported",
    })),
  };
  const strictInitialPass = sanitizeEvidenceVerificationDraft(corrected, {
    allowedFields: fields,
    requiredFields: fields,
    allowedEvidenceIds: new Set(evidenceById.keys()),
    evidenceById,
    requireAllFields: true,
  });
  const boundedCorrectionPass = sanitizeEvidenceVerificationDraft(corrected, {
    allowedFields: fields,
    requiredFields: fields,
    allowedEvidenceIds: new Set(evidenceById.keys()),
    evidenceById,
    requireAllFields: true,
    minimumCoverageScore: 80,
  });
  assert.equal(strictInitialPass.clean, false);
  assert.equal(boundedCorrectionPass.clean, true);

  const stillUnsupported = sanitizeEvidenceVerificationDraft({
    ...corrected,
    unsupportedFields: ["method"],
  }, {
    allowedFields: fields,
    requiredFields: fields,
    allowedEvidenceIds: new Set(evidenceById.keys()),
    evidenceById,
    requireAllFields: true,
    minimumCoverageScore: 80,
  });
  assert.equal(stillUnsupported.clean, false);
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

test("verification is bounded to two content passes while one transport retry preserves the correction opportunity", async () => {
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
  assert.match(monitor, /VERIFICATION_CONTENT_PASS_LIMIT = 2/);
  assert.match(monitor, /VERIFICATION_ATTEMPT_LIMIT = 3/);
  assert.match(monitor, /VERIFICATION_BATCH_SIZE = 3/);
  assert.match(monitor, /At most two completed content passes/);
  assert.match(monitor, /A third transport attempt is reserved only for a timeout or unusable response/);
  assert.match(monitor, /work\.verificationAttempts\[canonicalId\]/);
  assert.match(monitor, /work\.verificationFailureCount >= VERIFICATION_CIRCUIT_FAILURE_LIMIT/);
  assert.match(monitor, /remaining drafts were deferred without more model calls/);
  assert.match(monitor, /verificationCarryover/);
  assert.match(monitor, /previousWork\.verificationDeferredIds = \[\]/);
  assert.match(monitor, /i\.verification_status = 'degraded'[\s\S]*lower\(i\.screening_reason\) LIKE '%timeout%'/);
  assert.match(monitor, /AbortSignal\.timeout\(correctionMode \? VERIFICATION_CORRECTION_TIMEOUT_MS : VERIFICATION_TIMEOUT_MS\)/);
  assert.match(monitor, /Do not rewrite the draft in this audit pass/);
  assert.match(monitor, /correctionRequested: true/);
  assert.match(monitor, /correctionCompleted: true/);
  assert.match(monitor, /there will be no further rewrite loop/);
  assert.match(monitor, /maximumContentPasses: VERIFICATION_CONTENT_PASS_LIMIT/);
  assert.match(monitor, /maximumTransportAttempts: VERIFICATION_ATTEMPT_LIMIT/);
  assert.doesNotMatch(monitor, /fresh evidence-check pass is queued/);
  assert.match(monitor, /coverageScore must be an integer from 0 to 100/);
  assert.match(monitor, /recommendationVerificationEvidence/);
  assert.match(monitor, /recommendationVerificationRequiredFields/);
  assert.match(monitor, /Personalized fit and reading guidance remain research-context judgments/);
  assert.match(monitor, /requiredFields: populatedFields/);
  assert.match(monitor, /document\.status IN \('ready', 'partial'\)/);
  assert.match(monitor, /abstractEvidenceUnits/);
  assert.doesNotMatch(monitor, /for \(let attempt = 0; attempt < 2 && !data;/);
  assert.match(monitor, /thinking: \{ type: "disabled" \}/);
  assert.match(monitor, /isPublishedRecommendation\(review\) \? 1 : 0/);
  assert.match(monitor, /deepseek_verification_pending/);
  assert.doesNotMatch(monitor, /\.\.\.degradedRecommendationReview\(review, evidenceVerificationReport\(\{ initial \}\)\),\s*verificationRetryable: true/);
  assert.match(client, /正在核对推荐依据/);
  assert.match(client, /篇待处理/);
  assert.match(monitor, /BACKGROUND_VERIFICATION_RETRY_MS = 10 \* 60 \* 1000/);
  assert.match(monitor, /Pi 会在后台自动继续/);
  assert.match(client, /正在完成最后的推荐判断/);
  assert.match(client, /recommendationAuditPhaseLabel/);
  assert.match(client, /正在核对并修正/);
  assert.match(client, /正在核对/);
  assert.match(monitor, /earlyVerificationThreshold/);
  assert.match(monitor, /resumedDeepReviewAfterVerification/);
  assert.doesNotMatch(client, /证据审计|自动审计|后台审计|审计通过/);
  assert.match(monitor, /selectVerificationPhaseBatch/);
  assert.match(monitor, /VERIFICATION_BATCH_SIZE \* 3/);
  assert.match(monitor, /正在逐篇核对书目与摘要证据/);
});

test("an incomplete recommendation draft can regenerate once without trapping the scan", async () => {
  const monitor = await readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8");
  assert.match(monitor, /INCOMPLETE_DRAFT_REGENERATION_LIMIT = 1/);
  assert.match(monitor, /draftRegenerationAttempts: Record<string, number>/);
  assert.match(monitor, /work\.draftRegenerationAttempts\[canonicalId\] = regenerationAttempts \+ 1/);
  assert.match(monitor, /incomplete_draft_regeneration_exhausted/);
  assert.match(monitor, /degradedRecommendationReview\(draft, incompleteReport\)/);
  assert.match(monitor, /previousWork\.draftRegenerationAttempts\[canonicalId\][\s\S]*INCOMPLETE_DRAFT_REGENERATION_LIMIT/);
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
