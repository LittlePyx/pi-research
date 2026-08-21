import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  boundedEvidenceConfidence,
  evidenceCoverageScore,
  evidenceQuoteIsGrounded,
  extractArxivId,
  safeEvidenceSourceUrl,
} from "../lib/paper-evidence.ts";

test("claim confidence is capped by the available evidence level", () => {
  assert.equal(boundedEvidenceConfidence("fulltext", 99, true), 94);
  assert.equal(boundedEvidenceConfidence("abstract", 99, true), 68);
  assert.equal(boundedEvidenceConfidence("metadata", 99, true), 35);
  assert.equal(boundedEvidenceConfidence("fulltext", 99, false), 42);
});

test("only verbatim, substantive quotes count as grounded evidence", () => {
  const source = "The proposed estimator converges under the stated compactness assumptions and finite second moments.";
  assert.equal(evidenceQuoteIsGrounded(source, "converges under the stated compactness assumptions"), true);
  assert.equal(evidenceQuoteIsGrounded(source, "converges under weaker assumptions"), false);
  assert.equal(evidenceQuoteIsGrounded(source, "finite moments"), false);
});

test("coverage rewards grounded claims with source locators", () => {
  assert.equal(evidenceCoverageScore([
    { grounded: true, locator: "Methods" },
    { grounded: true, locator: "Results" },
    { grounded: false, locator: "" },
    { grounded: false, locator: "" },
  ]), 50);
});

test("full-text fetching is restricted to known open repositories", () => {
  assert.ok(safeEvidenceSourceUrl("https://arxiv.org/html/2401.00001"));
  assert.ok(safeEvidenceSourceUrl("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML"));
  assert.equal(safeEvidenceSourceUrl("http://localhost/internal"), "");
  assert.equal(safeEvidenceSourceUrl("https://example.com/private-paper"), "");
  assert.equal(extractArxivId("arxiv:2401.00001v2", ""), "2401.00001");
});

test("recommended papers enter a non-blocking evidence queue with claim-level provenance", async () => {
  const [route, monitor, repository, schema, client] = await Promise.all([
    readFile(new URL("../app/api/paper-evidence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/research-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /INSERT INTO paper_evidence_documents/);
  assert.match(monitor, /LEFT JOIN paper_evidence_documents ed/);
  assert.match(route, /europepmc\/webservices\/rest/);
  assert.match(route, /https:\/\/arxiv\.org\/html/);
  assert.match(route, /best_oa_location,open_access/);
  assert.match(route, /Every evidence quote must be copied verbatim/);
  assert.match(route, /evidenceQuoteIsGrounded/);
  assert.match(route, /paper_evidence_audits/);
  assert.match(route, /kind, title_zh, title_en, summary_zh, summary_en, confidence/);
  assert.match(route, /intelligence_updated_at = NULL/);
  assert.match(monitor, /groundedEvidenceRows/);
  assert.match(monitor, /document\.evidence_level = 'fulltext'/);
  assert.match(monitor, /url: item\.externalIds\?\.ArXiv \? "https:\/\/arxiv\.org\/abs\/"/);
  assert.match(repository, /CREATE TABLE IF NOT EXISTS paper_evidence_documents/);
  assert.match(schema, /paperEvidenceClaims/);
  assert.match(client, /Pi 只把能够回到开放原文或摘要中核对的判断列为证据/);
  assert.match(client, /completed >= 3/);
});
