import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  confirmedExternalResearchMapEvidenceStatements,
  dismissResearchMapEvidence,
  promoteAlreadyAcceptedResearchMapEvidence,
  promoteResearchMapEvidence,
  reconcileConfirmedResearchMapEvidence,
  reconcileResearchMapEvidenceDecision,
  reconcileResearchMapEvidenceStatements,
  researchEvidenceHorizon,
  upsertPendingResearchMapEvidence,
  upsertRouteGapResearchMapEvidence,
} from "../lib/research-map-evidence.ts";

function d1Database(sqlite) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) {
          bindings = values;
          return statement;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...bindings);
          return { meta: { changes: Number(result.changes) } };
        },
        async first() {
          return sqlite.prepare(sql).get(...bindings) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...bindings) };
        },
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function createFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE research_spaces (
      id TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE monitor_scan_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE
    );
    CREATE TABLE monitored_papers (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      canonical_id TEXT NOT NULL,
      doi TEXT,
      title TEXT NOT NULL,
      authors TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      source TEXT NOT NULL DEFAULT 'crossref',
      horizon TEXT NOT NULL DEFAULT 'years',
      citation_count INTEGER NOT NULL DEFAULT 0,
      relevance_score INTEGER NOT NULL DEFAULT 0,
      discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(space_id, canonical_id)
    );
    CREATE TABLE paper_insights (
      paper_id TEXT PRIMARY KEY NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      abstract_text TEXT NOT NULL DEFAULT '',
      summary_zh TEXT NOT NULL DEFAULT '',
      summary_en TEXT NOT NULL DEFAULT '',
      why_read_zh TEXT NOT NULL DEFAULT '',
      why_read_en TEXT NOT NULL DEFAULT '',
      quality_score INTEGER NOT NULL DEFAULT 0,
      priority_venue INTEGER NOT NULL DEFAULT 0,
      analysis_source TEXT NOT NULL DEFAULT 'metadata',
      analysis_model TEXT NOT NULL DEFAULT '',
      llm_recommended INTEGER NOT NULL DEFAULT 0,
      llm_relevance_score INTEGER NOT NULL DEFAULT 0,
      screening_reason TEXT NOT NULL DEFAULT '',
      recommendation_tier TEXT NOT NULL DEFAULT 'browse',
      read_minutes INTEGER NOT NULL DEFAULT 12,
      read_depth TEXT NOT NULL DEFAULT 'focused',
      problem_zh TEXT NOT NULL DEFAULT '',
      problem_en TEXT NOT NULL DEFAULT '',
      method_zh TEXT NOT NULL DEFAULT '',
      method_en TEXT NOT NULL DEFAULT '',
      contribution_zh TEXT NOT NULL DEFAULT '',
      contribution_en TEXT NOT NULL DEFAULT '',
      limitations_zh TEXT NOT NULL DEFAULT '',
      limitations_en TEXT NOT NULL DEFAULT '',
      reading_focus_zh TEXT NOT NULL DEFAULT '',
      reading_focus_en TEXT NOT NULL DEFAULT '',
      research_questions_zh TEXT NOT NULL DEFAULT '[]',
      research_questions_en TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE paper_feedback (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0,
      feedback TEXT
    );
    CREATE TABLE paper_reading_progress (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'unread'
    );
    CREATE TABLE research_tracks (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      title_zh TEXT NOT NULL,
      title_en TEXT NOT NULL,
      intelligence_json TEXT NOT NULL DEFAULT '{}',
      intelligence_model TEXT NOT NULL DEFAULT '',
      intelligence_updated_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monitor_query_plans (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      plan_date TEXT NOT NULL
    );
    CREATE TABLE research_paper_network_states (
      space_id TEXT PRIMARY KEY NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'idle',
      built_paper_count INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      sources_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE research_track_papers (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      canonical_id TEXT NOT NULL,
      doi TEXT,
      title TEXT NOT NULL,
      authors TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      citation_count INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL,
      summary_zh TEXT NOT NULL DEFAULT '',
      summary_en TEXT NOT NULL DEFAULT '',
      rationale_zh TEXT NOT NULL DEFAULT '',
      rationale_en TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(track_id, canonical_id)
    );
    CREATE TABLE research_map_changes (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'new_evidence',
      title_zh TEXT NOT NULL,
      title_en TEXT NOT NULL,
      summary_zh TEXT NOT NULL DEFAULT '',
      summary_en TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_id, track_id, kind)
    );
    CREATE TABLE research_map_evidence_proposals (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE,
      scan_job_id TEXT REFERENCES monitor_scan_jobs(id) ON DELETE SET NULL,
      map_role TEXT NOT NULL DEFAULT 'frontier',
      rationale_zh TEXT NOT NULL DEFAULT '',
      rationale_en TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(space_id, track_id, paper_id)
    );
  `);

  sqlite.exec(`
    INSERT INTO research_spaces (id) VALUES ('space-a'), ('space-b');
    INSERT INTO monitor_scan_jobs (id, space_id) VALUES ('job-a-1', 'space-a'), ('job-a-2', 'space-a');
    INSERT INTO research_tracks
      (id, space_id, title_zh, title_en, intelligence_json, intelligence_model, intelligence_updated_at)
    VALUES
      ('track-a', 'space-a', '率失真理论', 'Rate-distortion theory', '{"gap":"proof"}', 'deepseek-v4-pro', CURRENT_TIMESTAMP),
      ('track-b', 'space-b', '数值分析', 'Numerical analysis', '{"gap":"solver"}', 'deepseek-v4-pro', CURRENT_TIMESTAMP);
    INSERT INTO monitored_papers
      (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count)
    VALUES
      ('paper-a', 'space-a', 'doi:10.1000/a', '10.1000/a', 'A useful theorem', 'Ada Researcher', 'Journal A', 'https://example.test/a', '2026-08-01', 17),
      ('paper-b', 'space-b', 'doi:10.1000/b', '10.1000/b', 'A stable solver', 'Blaise Researcher', 'Journal B', 'https://example.test/b', '2026-08-02', 9);
    INSERT INTO paper_insights (paper_id, space_id, summary_zh, summary_en)
    VALUES ('paper-a', 'space-a', '中文摘要', 'English summary');
  `);

  return { sqlite, database: d1Database(sqlite) };
}

function proposal(overrides = {}) {
  return {
    id: "proposal-a",
    spaceId: "space-a",
    trackId: "track-a",
    paperId: "paper-a",
    scanJobId: "job-a-1",
    mapRole: "frontier",
    rationaleZh: "补足当前证明缺口",
    rationaleEn: "Closes the current proof gap",
    confidence: 82,
    ...overrides,
  };
}

function count(sqlite, table) {
  return Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

test("legacy reconcile never promotes a pending model proposal", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    assert.deepEqual(await reconcileConfirmedResearchMapEvidence(database, "space-a"), {
      changed: 0,
      trackIds: [],
    });
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "pending");
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);
  } finally {
    sqlite.close();
  }
});

test("legacy reconcile repairs formal rows only from confirmed proposal evidence", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    sqlite.prepare(
      "UPDATE research_map_evidence_proposals SET status = 'confirmed', decided_at = CURRENT_TIMESTAMP WHERE id = 'proposal-a'",
    ).run();

    assert.deepEqual(await reconcileConfirmedResearchMapEvidence(database, "space-a"), {
      changed: 1,
      trackIds: ["track-a"],
    });
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
    assert.equal(sqlite.prepare("SELECT canonical_id FROM research_track_papers").get().canonical_id, "doi:10.1000/a");

    assert.deepEqual(await reconcileConfirmedResearchMapEvidence(database, "space-a"), {
      changed: 0,
      trackIds: [],
    });
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
  } finally {
    sqlite.close();
  }
});

test("route-gap discovery persists only a pending proposal and remains idempotent", async () => {
  const { sqlite, database } = createFixture();
  try {
    const input = {
      canonicalId: "doi:10.2000/gap",
      doi: "10.2000/gap",
      title: "A theorem for the unresolved route gap",
      authors: "Grace Researcher",
      venue: "Journal of Evidence",
      url: "https://doi.org/10.2000/gap",
      publishedAt: "2020-01-01",
      citationCount: 12,
      abstractText: "We establish a theorem addressing the missing condition.",
      mapRole: "frontier",
      summaryZh: "该论文处理当前路线缺失的条件。",
      summaryEn: "The paper addresses the condition missing from the route.",
      rationaleZh: "它直接对应 Pi 识别出的证据缺口。",
      rationaleEn: "It directly targets the evidence gap identified by Pi.",
      confidence: 84,
      model: "deepseek-v4-pro",
    };
    assert.deepEqual(await upsertRouteGapResearchMapEvidence(database, "space-a", "track-a", [input]), {
      pendingCount: 1,
      paperIds: [sqlite.prepare("SELECT id FROM monitored_papers WHERE canonical_id = 'doi:10.2000/gap'").get().id],
    });
    assert.deepEqual(
      { ...sqlite.prepare("SELECT source, horizon FROM monitored_papers WHERE canonical_id = 'doi:10.2000/gap'").get() },
      { source: "route-gap", horizon: "years" },
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT analysis_source, summary_en, why_read_en FROM paper_insights WHERE paper_id = (SELECT id FROM monitored_papers WHERE canonical_id = 'doi:10.2000/gap')").get() },
      { analysis_source: "route-gap", summary_en: input.summaryEn, why_read_en: input.rationaleEn },
    );
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals WHERE track_id = 'track-a' AND paper_id <> 'paper-a'").get().status, "pending");
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);

    const updated = { ...input, rationaleEn: "Updated route-specific rationale." };
    assert.equal((await upsertRouteGapResearchMapEvidence(database, "space-a", "track-a", [updated])).pendingCount, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals").get().count, 1);
    assert.equal(sqlite.prepare("SELECT rationale_en FROM research_map_evidence_proposals").get().rationale_en, updated.rationaleEn);
    assert.equal(count(sqlite, "research_track_papers"), 0);
  } finally {
    sqlite.close();
  }
});

test("route-gap horizon follows the three discovery windows", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  assert.equal(researchEvidenceHorizon("2026-08-12", now), "days");
  assert.equal(researchEvidenceHorizon("2026-04-01", now), "months");
  assert.equal(researchEvidenceHorizon("2024-01-01", now), "years");
  assert.equal(researchEvidenceHorizon(null, now), "years");
});

test("pending evidence remains provisional and repeated scans update it idempotently", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    assert.equal(count(sqlite, "research_map_evidence_proposals"), 1);
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);

    await upsertPendingResearchMapEvidence(database, [proposal({
      id: "ignored-retry-id",
      scanJobId: "job-a-2",
      mapRole: "milestone",
      rationaleZh: "更新后的中文理由",
      rationaleEn: "Updated rationale",
      confidence: 88.6,
    })]);

    assert.equal(count(sqlite, "research_map_evidence_proposals"), 1);
    assert.deepEqual(
      { ...sqlite.prepare(`SELECT id, scan_job_id, map_role, rationale_zh, rationale_en, confidence, status, decided_at
        FROM research_map_evidence_proposals`).get() },
      {
        id: "proposal-a",
        scan_job_id: "job-a-2",
        map_role: "milestone",
        rationale_zh: "更新后的中文理由",
        rationale_en: "Updated rationale",
        confidence: 89,
        status: "pending",
        decided_at: null,
      },
    );
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);
  } finally {
    sqlite.close();
  }
});

test("promotion confirms evidence, writes the formal map once, and invalidates derived guidance", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal({ mapRole: "milestone" })]);
    sqlite.exec(`
      INSERT INTO monitor_query_plans (id, space_id, plan_date) VALUES ('plan-a', 'space-a', '9999-12-31');
      INSERT INTO research_paper_network_states
        (space_id, status, built_paper_count, model, sources_json, error)
      VALUES ('space-a', 'ready', 12, 'deepseek-v4-pro', '["cached"]', 'stale error');
    `);

    const first = await promoteResearchMapEvidence(database, "space-a", "paper-a");
    assert.deepEqual(first, { changed: 1, trackIds: ["track-a"] });

    const promoted = sqlite.prepare(
      "SELECT status, decided_at FROM research_map_evidence_proposals WHERE id = 'proposal-a'",
    ).get();
    assert.equal(promoted.status, "confirmed");
    assert.ok(promoted.decided_at);
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT role, title, summary_zh, summary_en FROM research_track_papers").get() },
      { role: "milestone", title: "A useful theorem", summary_zh: "中文摘要", summary_en: "English summary" },
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT kind, confidence FROM research_map_changes").get() },
      { kind: "new_evidence", confidence: 82 },
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT intelligence_json, intelligence_model, intelligence_updated_at FROM research_tracks WHERE id = 'track-a'").get() },
      { intelligence_json: "{}", intelligence_model: "", intelligence_updated_at: null },
    );
    assert.equal(count(sqlite, "monitor_query_plans"), 0);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status, error FROM research_paper_network_states WHERE space_id = 'space-a'").get() },
      { status: "idle", error: null },
    );

    const repeated = await promoteResearchMapEvidence(database, "space-a", "paper-a");
    assert.deepEqual(repeated, { changed: 0, trackIds: ["track-a"] });
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
    assert.equal(count(sqlite, "research_map_evidence_proposals"), 1);
  } finally {
    sqlite.close();
  }
});

test("dismissal revokes confirmed formal evidence and remains idempotent", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    await promoteResearchMapEvidence(database, "space-a", "paper-a");

    const dismissed = await dismissResearchMapEvidence(database, "space-a", "paper-a");
    assert.deepEqual(dismissed, { changed: 1, trackIds: ["track-a"] });
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "dismissed");
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);

    const repeated = await dismissResearchMapEvidence(database, "space-a", "paper-a");
    assert.deepEqual(repeated, { changed: 0, trackIds: [] });
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);

    const restored = await promoteResearchMapEvidence(database, "space-a", "paper-a");
    assert.deepEqual(restored, { changed: 1, trackIds: ["track-a"] });
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "confirmed");
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
  } finally {
    sqlite.close();
  }
});

test("evidence decisions are isolated by research space", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);

    assert.deepEqual(
      await promoteResearchMapEvidence(database, "space-b", "paper-a"),
      { changed: 0, trackIds: [] },
    );
    assert.deepEqual(
      await dismissResearchMapEvidence(database, "space-b", "paper-a"),
      { changed: 0, trackIds: [] },
    );

    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "pending");
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);
    assert.equal(
      sqlite.prepare("SELECT intelligence_json FROM research_tracks WHERE id = 'track-a'").get().intelligence_json,
      '{"gap":"proof"}',
    );
  } finally {
    sqlite.close();
  }
});

test("an accepted paper is promoted when its proposal arrives later", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved) VALUES (?, ?, ?, 1)")
      .run("feedback-a", "space-a", "paper-a");
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    const result = await promoteAlreadyAcceptedResearchMapEvidence(database, "space-a", ["paper-a"]);
    assert.deepEqual(result, { changed: 1, trackIds: ["track-a"] });
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "confirmed");
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
  } finally {
    sqlite.close();
  }
});

test("removing the last acceptance returns confirmed or dismissed evidence to pending", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback) VALUES (?, ?, ?, 0, 'relevant')")
      .run("feedback-a", "space-a", "paper-a");
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 1);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "confirmed");

    sqlite.prepare("UPDATE paper_feedback SET feedback = NULL WHERE paper_id = 'paper-a'").run();
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 1);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "pending");
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);

    sqlite.prepare("UPDATE paper_feedback SET feedback = 'not_relevant' WHERE paper_id = 'paper-a'").run();
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 1);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "dismissed");
    sqlite.prepare("UPDATE paper_feedback SET feedback = NULL WHERE paper_id = 'paper-a'").run();
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 1);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "pending");
  } finally {
    sqlite.close();
  }
});

test("route reassignment changes only the current proposal and never revives the dismissed route", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      "INSERT INTO research_tracks (id, space_id, title_zh, title_en) VALUES (?, ?, ?, ?)",
    ).run("track-c", "space-a", "语义压缩", "Semantic compression");
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    await upsertPendingResearchMapEvidence(database, [proposal({
      id: "proposal-c",
      trackId: "track-c",
      rationaleZh: "当前改派后的路线",
      rationaleEn: "The currently assigned route",
    })]);

    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "pending" },
      ],
    );
    assert.deepEqual(await promoteResearchMapEvidence(database, "space-a", "paper-a"), {
      changed: 1,
      trackIds: ["track-c"],
    });
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "confirmed" },
      ],
    );

    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 1);
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "pending" },
      ],
    );
    assert.equal(count(sqlite, "research_track_papers"), 0);

    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved) VALUES (?, ?, ?, 1)")
      .run("feedback-c", "space-a", "paper-a");
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 1);
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "confirmed" },
      ],
    );
    assert.equal(sqlite.prepare("SELECT track_id FROM research_track_papers").get().track_id, "track-c");
  } finally {
    sqlite.close();
  }
});

test("system route supersession can return to an old route without reviving a user dismissal", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      "INSERT INTO research_tracks (id, space_id, title_zh, title_en) VALUES (?, ?, ?, ?)",
    ).run("track-c", "space-a", "语义压缩", "Semantic compression");

    await upsertPendingResearchMapEvidence(database, [proposal()]);
    await upsertPendingResearchMapEvidence(database, [proposal({ id: "proposal-c", trackId: "track-c" })]);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status, decided_at FROM research_map_evidence_proposals WHERE track_id = 'track-a'").get() },
      { status: "dismissed", decided_at: null },
    );

    await upsertPendingResearchMapEvidence(database, [proposal({
      id: "ignored-return-id",
      trackId: "track-a",
      rationaleZh: "重新回到当前最适合的路线",
      rationaleEn: "Returned to the currently best route",
    })]);
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status, decided_at FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "pending", decided_at: null },
        { track_id: "track-c", status: "dismissed", decided_at: null },
      ],
    );

    await dismissResearchMapEvidence(database, "space-a", "paper-a");
    assert.ok(sqlite.prepare("SELECT decided_at FROM research_map_evidence_proposals WHERE track_id = 'track-a'").get().decided_at);
    await upsertPendingResearchMapEvidence(database, [proposal({ id: "proposal-c", trackId: "track-c" })]);
    await upsertPendingResearchMapEvidence(database, [proposal({ id: "ignored-user-rejected-return", trackId: "track-a" })]);
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "pending" },
      ],
    );
  } finally {
    sqlite.close();
  }
});

test("feedback writes and evidence reconciliation can share one atomic D1 batch", async () => {
  const { sqlite, database } = createFixture();
  try {
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    await database.batch([
      database.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved) VALUES (?, ?, ?, 1)")
        .bind("feedback-a", "space-a", "paper-a"),
      ...reconcileResearchMapEvidenceStatements(database, "space-a", "paper-a"),
    ]);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "confirmed");
    assert.equal(count(sqlite, "research_track_papers"), 1);

    await database.batch([
      database.prepare("UPDATE paper_feedback SET saved = 0 WHERE paper_id = ? AND space_id = ?")
        .bind("paper-a", "space-a"),
      ...reconcileResearchMapEvidenceStatements(database, "space-a", "paper-a"),
    ]);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "pending");
    assert.equal(count(sqlite, "research_track_papers"), 0);
  } finally {
    sqlite.close();
  }
});

test("network acceptance is idempotent and remains a durable acceptance source", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, title, role) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("network-paper", "track-a", "space-a", "doi:10.1000/a", "A useful theorem", "frontier");
    const externalEvidence = confirmedExternalResearchMapEvidenceStatements(database, {
      id: "network-accept:track-a:candidate-a",
      spaceId: "space-a",
      trackId: "track-a",
      paperId: "network-monitored:candidate-a",
      paperCanonicalId: "doi:10.1000/a",
      mapRole: "frontier",
      rationaleZh: "用户从论文网络明确接受",
      rationaleEn: "Explicitly accepted from the paper network",
      confidence: 100,
      paperTitle: "A useful theorem",
      trackTitleZh: "率失真理论",
      trackTitleEn: "Rate-distortion theory",
    });
    await database.batch(externalEvidence);
    await database.batch(confirmedExternalResearchMapEvidenceStatements(database, {
      id: "network-accept:track-a:candidate-a",
      spaceId: "space-a",
      trackId: "track-a",
      paperId: "network-monitored:candidate-a",
      paperCanonicalId: "doi:10.1000/a",
      mapRole: "frontier",
      rationaleZh: "用户从论文网络明确接受",
      rationaleEn: "Explicitly accepted from the paper network",
      confidence: 100,
      paperTitle: "A useful theorem",
      trackTitleZh: "率失真理论",
      trackTitleEn: "Rate-distortion theory",
    }));
    assert.equal(count(sqlite, "research_map_evidence_proposals"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);

    sqlite.prepare("INSERT INTO paper_reading_progress (id, space_id, paper_id, status) VALUES (?, ?, ?, ?)")
      .run("reading-a", "space-a", "paper-a", "queued");
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 0);
    sqlite.prepare("UPDATE paper_reading_progress SET status = 'reading' WHERE paper_id = 'paper-a'").run();
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 0);
    sqlite.prepare("UPDATE paper_reading_progress SET status = 'unread' WHERE paper_id = 'paper-a'").run();
    assert.equal((await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a")).changed, 0);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "confirmed");
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 1);
  } finally {
    sqlite.close();
  }
});

test("network acceptance supersedes every other active proposal and remains the sole decision target", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      "INSERT INTO research_tracks (id, space_id, title_zh, title_en) VALUES (?, ?, ?, ?)",
    ).run("track-c", "space-a", "语义压缩", "Semantic compression");
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, title, role) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("network-paper-c", "track-c", "space-a", "doi:10.1000/a", "A useful theorem", "frontier");

    await database.batch(confirmedExternalResearchMapEvidenceStatements(database, {
      id: "network-accept:track-c:candidate-a",
      spaceId: "space-a",
      trackId: "track-c",
      paperId: "network-monitored:candidate-a",
      paperCanonicalId: "doi:10.1000/a",
      mapRole: "frontier",
      rationaleZh: "用户从论文网络明确接受到新路线",
      rationaleEn: "Explicitly accepted into the new route",
      confidence: 100,
      paperTitle: "A useful theorem",
      trackTitleZh: "语义压缩",
      trackTitleEn: "Semantic compression",
    }));
    const acceptedRows = sqlite.prepare(
      "SELECT track_id, status, decided_at FROM research_map_evidence_proposals ORDER BY track_id",
    ).all().map((row) => ({ ...row }));
    assert.deepEqual(acceptedRows.map(({ track_id, status }) => ({ track_id, status })), [
      { track_id: "track-a", status: "dismissed" },
      { track_id: "track-c", status: "confirmed" },
    ]);
    assert.equal(acceptedRows[0].decided_at, null);
    assert.ok(acceptedRows[1].decided_at);

    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback) VALUES (?, ?, ?, 0, 'relevant')")
      .run("feedback-network", "space-a", "paper-a");
    assert.deepEqual(await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a"), {
      changed: 0,
      trackIds: ["track-c"],
    });
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals WHERE track_id = 'track-a'").get().status, "dismissed");

    sqlite.prepare("UPDATE paper_feedback SET feedback = 'not_relevant' WHERE paper_id = 'paper-a'").run();
    assert.deepEqual(await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a"), {
      changed: 1,
      trackIds: ["track-c"],
    });
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "dismissed" },
      ],
    );
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);
  } finally {
    sqlite.close();
  }
});

test("a confirmed network decision blocks later monitor proposals from shadowing its route", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      "INSERT INTO research_tracks (id, space_id, title_zh, title_en) VALUES (?, ?, ?, ?)",
    ).run("track-c", "space-a", "语义压缩", "Semantic compression");
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, title, role) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("network-paper-c", "track-c", "space-a", "doi:10.1000/a", "A useful theorem", "frontier");
    await database.batch(confirmedExternalResearchMapEvidenceStatements(database, {
      id: "network-accept:track-c:candidate-a",
      spaceId: "space-a",
      trackId: "track-c",
      paperId: "network-monitored:candidate-a",
      paperCanonicalId: "doi:10.1000/a",
      mapRole: "frontier",
      rationaleZh: "用户已明确选择网络路线",
      rationaleEn: "The user explicitly selected the network route",
      confidence: 100,
      paperTitle: "A useful theorem",
      trackTitleZh: "语义压缩",
      trackTitleEn: "Semantic compression",
    }));

    await upsertPendingResearchMapEvidence(database, [proposal()]);
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals").all().map((row) => ({ ...row })),
      [{ track_id: "track-c", status: "confirmed" }],
    );

    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback) VALUES (?, ?, ?, 0, 'relevant')")
      .run("feedback-network", "space-a", "paper-a");
    assert.deepEqual(await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a"), {
      changed: 0,
      trackIds: ["track-c"],
    });
    assert.equal(count(sqlite, "research_track_papers"), 1);

    sqlite.prepare("UPDATE paper_feedback SET feedback = 'not_relevant' WHERE paper_id = 'paper-a'").run();
    assert.deepEqual(await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a"), {
      changed: 1,
      trackIds: ["track-c"],
    });
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals").all().map((row) => ({ ...row })),
      [{ track_id: "track-c", status: "dismissed" }],
    );
    assert.equal(count(sqlite, "research_track_papers"), 0);
  } finally {
    sqlite.close();
  }
});

test("a superseded network acceptance keeps its user-decision marker and cannot be monitor-revived", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      "INSERT INTO research_tracks (id, space_id, title_zh, title_en) VALUES (?, ?, ?, ?)",
    ).run("track-c", "space-a", "语义压缩", "Semantic compression");
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, title, role) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("network-paper-a", "track-a", "space-a", "doi:10.1000/a", "A useful theorem", "frontier");
    await database.batch(confirmedExternalResearchMapEvidenceStatements(database, {
      id: "network-accept:track-a:candidate-a",
      spaceId: "space-a",
      trackId: "track-a",
      paperId: "network-monitored:candidate-a",
      paperCanonicalId: "doi:10.1000/a",
      mapRole: "frontier",
      rationaleZh: "第一次网络接受",
      rationaleEn: "First network acceptance",
      confidence: 100,
      paperTitle: "A useful theorem",
      trackTitleZh: "率失真理论",
      trackTitleEn: "Rate-distortion theory",
    }));
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, title, role) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("network-paper-c", "track-c", "space-a", "doi:10.1000/a", "A useful theorem", "frontier");
    await database.batch(confirmedExternalResearchMapEvidenceStatements(database, {
      id: "network-accept:track-c:candidate-a",
      spaceId: "space-a",
      trackId: "track-c",
      paperId: "network-monitored:candidate-a",
      paperCanonicalId: "doi:10.1000/a",
      mapRole: "frontier",
      rationaleZh: "第二次网络接受并改派",
      rationaleEn: "Second network acceptance and reassignment",
      confidence: 100,
      paperTitle: "A useful theorem",
      trackTitleZh: "语义压缩",
      trackTitleEn: "Semantic compression",
    }));

    const superseded = sqlite.prepare(
      "SELECT id, status, decided_at FROM research_map_evidence_proposals WHERE track_id = 'track-a'",
    ).get();
    assert.equal(superseded.id, "network-accept:track-a:candidate-a");
    assert.equal(superseded.status, "dismissed");
    assert.ok(superseded.decided_at);

    await upsertPendingResearchMapEvidence(database, [proposal({ id: "monitor-return-a" })]);
    assert.deepEqual(
      sqlite.prepare("SELECT track_id, status FROM research_map_evidence_proposals ORDER BY track_id").all().map((row) => ({ ...row })),
      [
        { track_id: "track-a", status: "dismissed" },
        { track_id: "track-c", status: "confirmed" },
      ],
    );

    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback) VALUES (?, ?, ?, 0, 'not_relevant')")
      .run("feedback-network", "space-a", "paper-a");
    await reconcileResearchMapEvidenceDecision(database, "space-a", "paper-a");
    sqlite.prepare("UPDATE paper_feedback SET feedback = NULL WHERE paper_id = 'paper-a'").run();
    await upsertPendingResearchMapEvidence(database, [proposal({ id: "monitor-return-a-after-dismiss" })]);
    assert.equal(
      sqlite.prepare("SELECT status FROM research_map_evidence_proposals WHERE track_id = 'track-a'").get().status,
      "dismissed",
    );
    assert.equal(
      Number(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals WHERE status = 'pending'").get().count),
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("a pre-existing formal paper is not converted into a dismissible LLM proposal", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, title, role) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("manual-paper", "track-a", "space-a", "doi:10.1000/a", "A useful theorem", "foundation");
    await upsertPendingResearchMapEvidence(database, [proposal()]);
    assert.equal(count(sqlite, "research_map_evidence_proposals"), 0);
    assert.equal(count(sqlite, "research_track_papers"), 1);
  } finally {
    sqlite.close();
  }
});
