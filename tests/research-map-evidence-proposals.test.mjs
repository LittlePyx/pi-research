import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  enqueueMonitorCandidates,
  RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL,
  RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL,
} from "../lib/monitor-candidate-queue.ts";
import { researchRouteAttention, selectResearchRouteAttention } from "../lib/research-map.ts";
import {
  confirmedExternalResearchMapEvidenceStatements,
  dismissResearchMapEvidence,
  formalResearchMapEvidencePredicate,
  promoteAlreadyAcceptedResearchMapEvidence,
  promoteResearchMapEvidence,
  reconcileConfirmedResearchMapEvidence,
  reconcileResearchMapEvidenceDecision,
  reconcileResearchMapEvidenceStatements,
  researchEvidenceHorizon,
  SYSTEM_CURATED_RESEARCH_MAP_REVIEW_ID_PREFIX,
  upsertPendingResearchMapEvidence,
  upsertRouteGapResearchMapEvidence,
} from "../lib/research-map-evidence.ts";

test("formal route changes require independently verified recommendation evidence", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE research_map_changes (id TEXT PRIMARY KEY, space_id TEXT, paper_id TEXT);
    CREATE TABLE paper_insights (
      paper_id TEXT PRIMARY KEY, space_id TEXT, ever_recommended INTEGER,
      verification_status TEXT, verification_coverage_score INTEGER
    );
    INSERT INTO research_map_changes VALUES ('qualified', 'space-a', 'paper-a'), ('legacy', 'space-a', 'paper-b');
    INSERT INTO paper_insights VALUES
      ('paper-a', 'space-a', 1, 'verified', 100),
      ('paper-b', 'space-a', 1, 'pending', 100);
  `);
  const rows = sqlite.prepare(`SELECT c.id FROM research_map_changes c
    WHERE ${formalResearchMapEvidencePredicate("c")} ORDER BY c.id`).all();
  assert.deepEqual(rows.map((row) => row.id), ["qualified"]);
  sqlite.close();
});

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
    CREATE TABLE monitor_runs (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL UNIQUE REFERENCES research_spaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'idle',
      next_run_at TEXT,
      last_trigger TEXT NOT NULL DEFAULT 'visit',
      last_user_activity_at TEXT,
      automation_paused_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      ever_recommended INTEGER NOT NULL DEFAULT 1,
      verification_status TEXT NOT NULL DEFAULT 'verified',
      verification_coverage_score INTEGER NOT NULL DEFAULT 100,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monitor_candidate_sources (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE,
      source_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      query_key TEXT NOT NULL,
      appearances INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_id, source_key, query_key)
    );
    CREATE TABLE monitor_discovery_coverage (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      horizon TEXT NOT NULL,
      source_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      query_key TEXT NOT NULL,
      query_text TEXT NOT NULL DEFAULT '',
      route_id TEXT,
      exploration_role TEXT NOT NULL DEFAULT 'core',
      adaptive_score INTEGER NOT NULL DEFAULT 55,
      next_cursor INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      total_candidate_count INTEGER NOT NULL DEFAULT 0,
      new_candidate_count INTEGER NOT NULL DEFAULT 0,
      zero_yield_streak INTEGER NOT NULL DEFAULT 0,
      branch_status TEXT NOT NULL DEFAULT 'exploring',
      cooldown_until TEXT,
      first_scanned_at TEXT,
      last_scanned_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(space_id, horizon, source_key, query_key)
    );
    CREATE TABLE paper_feedback (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0,
      feedback TEXT,
      reason_code TEXT
    );
    CREATE TABLE recommendation_audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL,
      is_paper INTEGER NOT NULL DEFAULT 1,
      recommended INTEGER NOT NULL DEFAULT 0,
      provenance_json TEXT NOT NULL DEFAULT '[]',
      reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      intelligence_status TEXT NOT NULL DEFAULT 'ready',
      intelligence_attempt_count INTEGER NOT NULL DEFAULT 0,
      intelligence_error TEXT,
      intelligence_retry_at TEXT,
      intelligence_lock_token TEXT,
      intelligence_lock_expires_at TEXT,
      intelligence_refresh_requested_at TEXT,
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
      curation_status TEXT NOT NULL DEFAULT 'active',
      curation_reason_code TEXT,
      curation_reason_zh TEXT NOT NULL DEFAULT '',
      curation_reason_en TEXT NOT NULL DEFAULT '',
      curation_source TEXT NOT NULL DEFAULT '',
      curation_evidence_json TEXT NOT NULL DEFAULT '[]',
      curation_updated_at TEXT,
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
    INSERT INTO monitor_runs (id, space_id, status, next_run_at) VALUES
      ('run-a', 'space-a', 'ready', datetime('now', '+1 day')),
      ('run-b', 'space-b', 'ready', datetime('now', '+1 day'));
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

function queueCandidate(overrides = {}) {
  return {
    canonicalId: "doi:10.1000/a",
    doi: "10.1000/a",
    title: "A useful theorem",
    authors: "Ada Researcher",
    venue: "Journal A",
    url: "https://example.test/a",
    publishedAt: "2026-08-01",
    abstractText: "A useful theorem for the active research route.",
    horizon: "years",
    citationCount: 17,
    relevanceScore: 70,
    qualityScore: 72,
    priorityVenue: false,
    source: "research-route",
    provenance: [{
      sourceKey: "research-route:gap",
      channel: "topic",
      queryKey: "track-a:gap:1",
      routeId: "track-a",
    }],
    ...overrides,
  };
}

test("explicit negative feedback removes a paper from shared-queue stage counts without erasing its review decision", async () => {
  const { sqlite, database } = createFixture();
  try {
    const queued = await enqueueMonitorCandidates(database, "space-a", [queueCandidate()]);
    assert.equal(queued.queuedForReviewCount, 1);
    assert.equal(sqlite.prepare("SELECT datetime(next_run_at) <= CURRENT_TIMESTAMP AS due FROM monitor_runs WHERE space_id = 'space-a'").get().due, 1);

    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, feedback, reason_code) VALUES (?, ?, ?, 'not_relevant', 'network_dismissed')")
      .run("feedback-a", "space-a", "paper-a");
    const dismissedQueued = await enqueueMonitorCandidates(database, "space-a", [queueCandidate()]);
    assert.deepEqual(
      {
        queued: dismissedQueued.queuedForReviewCount,
        reviewing: dismissedQueued.reviewingCount,
        recommended: dismissedQueued.recommendedCount,
        reviewed: dismissedQueued.alreadyReviewedCount,
      },
      { queued: 0, reviewing: 0, recommended: 0, reviewed: 0 },
    );

    sqlite.prepare("DELETE FROM paper_feedback WHERE paper_id = 'paper-a'").run();
    sqlite.prepare("UPDATE paper_insights SET analysis_source = 'deepseek_screened', analysis_model = 'deepseek-v4-pro' WHERE paper_id = 'paper-a'").run();
    assert.equal((await enqueueMonitorCandidates(database, "space-a", [queueCandidate()])).reviewingCount, 1);
    sqlite.prepare("UPDATE paper_insights SET analysis_source = 'deepseek_verification_pending' WHERE paper_id = 'paper-a'").run();
    assert.equal((await enqueueMonitorCandidates(database, "space-a", [queueCandidate()])).reviewingCount, 1);
    sqlite.prepare("UPDATE paper_insights SET analysis_source = 'deepseek_screened' WHERE paper_id = 'paper-a'").run();
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, feedback, reason_code) VALUES (?, ?, ?, 'not_relevant', 'network_dismissed')")
      .run("feedback-a", "space-a", "paper-a");
    assert.equal((await enqueueMonitorCandidates(database, "space-a", [queueCandidate()])).reviewingCount, 0);

    sqlite.prepare("DELETE FROM paper_feedback WHERE paper_id = 'paper-a'").run();
    sqlite.prepare("UPDATE paper_insights SET analysis_source = 'deepseek', analysis_model = 'deepseek-v4-pro', llm_recommended = 1 WHERE paper_id = 'paper-a'").run();
    const recommended = await enqueueMonitorCandidates(database, "space-a", [queueCandidate()]);
    assert.equal(recommended.recommendedCount, 1);
    assert.equal(recommended.alreadyReviewedCount, 1);
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, feedback, reason_code) VALUES (?, ?, ?, 'not_relevant', 'network_dismissed')")
      .run("feedback-a", "space-a", "paper-a");
    const dismissedRecommended = await enqueueMonitorCandidates(database, "space-a", [queueCandidate()]);
    assert.equal(dismissedRecommended.recommendedCount, 0);
    assert.equal(dismissedRecommended.alreadyReviewedCount, 0);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT analysis_source, analysis_model, llm_recommended FROM paper_insights WHERE paper_id = 'paper-a'").get() },
      { analysis_source: "deepseek", analysis_model: "deepseek-v4-pro", llm_recommended: 1 },
    );
  } finally {
    sqlite.close();
  }
});

test("shared queue admission wakes a terminal run but respects an inactive-workspace pause", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare("DELETE FROM monitor_runs WHERE space_id = 'space-b'").run();
    await enqueueMonitorCandidates(database, "space-b", [queueCandidate({
      canonicalId: "doi:10.1000/wake-a",
      doi: "10.1000/wake-a",
      title: "Wake a new shared quality queue",
    })]);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status, datetime(next_run_at) <= CURRENT_TIMESTAMP AS due, last_user_activity_at IS NOT NULL AS active FROM monitor_runs WHERE space_id = 'space-b'").get() },
      { status: "idle", due: 1, active: 1 },
    );

    sqlite.prepare("UPDATE monitor_runs SET automation_paused_at = CURRENT_TIMESTAMP, next_run_at = datetime('now', '+1 day') WHERE space_id = 'space-b'").run();
    await enqueueMonitorCandidates(database, "space-b", [queueCandidate({
      canonicalId: "doi:10.1000/wake-b",
      doi: "10.1000/wake-b",
      title: "Preserve a paused shared quality queue",
    })]);
    assert.equal(
      sqlite.prepare("SELECT datetime(next_run_at) > CURRENT_TIMESTAMP AS stayed_paused FROM monitor_runs WHERE space_id = 'space-b'").get().stayed_paused,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("route pipeline excludes dismissed live work while retaining cumulative recommendation history", async () => {
  const { sqlite, database } = createFixture();
  try {
    await enqueueMonitorCandidates(database, "space-a", [queueCandidate()], { recordDiscoveryCoverage: true });
    const counts = () => sqlite.prepare(RESEARCH_ROUTE_REVIEW_QUEUE_COUNTS_SQL).all("space-a", "space-a").map((row) => ({ ...row }));
    assert.deepEqual(counts().map(({ track_id, queued_count, reviewing_count, recommended_count }) => ({ track_id, queued_count, reviewing_count, recommended_count })), [
      { track_id: "track-a", queued_count: 1, reviewing_count: 0, recommended_count: 0 },
    ]);

    sqlite.prepare("UPDATE paper_insights SET analysis_source = 'deepseek_screened', analysis_model = 'deepseek-v4-pro' WHERE paper_id = 'paper-a'").run();
    assert.equal(counts()[0].reviewing_count, 1);
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, feedback, reason_code) VALUES (?, ?, ?, 'not_relevant', 'network_dismissed')")
      .run("feedback-a", "space-a", "paper-a");
    assert.deepEqual(counts(), []);

    sqlite.prepare(
      "INSERT INTO recommendation_audit_events (id, space_id, paper_id, recommended, provenance_json) VALUES (?, ?, ?, 1, ?)",
    ).run("audit-a", "space-a", "paper-a", JSON.stringify([{ routeId: "track-a", originKind: "route_gap" }]));
    assert.deepEqual(counts().map(({ track_id, queued_count, reviewing_count, recommended_count }) => ({ track_id, queued_count, reviewing_count, recommended_count })), [
      { track_id: "track-a", queued_count: 0, reviewing_count: 0, recommended_count: 1 },
    ]);
  } finally {
    sqlite.close();
  }
});

test("route portfolio deduplicates papers across routes and separates each quality stage", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(`INSERT INTO research_tracks
      (id, space_id, title_zh, title_en, intelligence_json, intelligence_model, intelligence_updated_at)
      VALUES ('track-c', 'space-a', '统计学习', 'Statistical learning', '{}', 'deepseek-v4-pro', CURRENT_TIMESTAMP)`).run();

    await enqueueMonitorCandidates(database, "space-a", [queueCandidate({
      provenance: [
        { sourceKey: "research-route:gap", channel: "topic", queryKey: "track-a:gap:1", routeId: "track-a" },
        { sourceKey: "research-route:frontier", channel: "topic", queryKey: "track-c:frontier:1", routeId: "track-c" },
      ],
    })], { recordDiscoveryCoverage: true });
    await enqueueMonitorCandidates(database, "space-a", [queueCandidate({
      canonicalId: "doi:10.1000/queued",
      doi: "10.1000/queued",
      title: "A queued route candidate",
      provenance: [{ sourceKey: "research-route:frontier", channel: "topic", queryKey: "track-a:frontier:1", routeId: "track-a" }],
    })], { recordDiscoveryCoverage: true });
    await enqueueMonitorCandidates(database, "space-a", [queueCandidate({
      canonicalId: "doi:10.1000/dismissed",
      doi: "10.1000/dismissed",
      title: "A dismissed route candidate",
      provenance: [{ sourceKey: "research-route:network", channel: "citation", queryKey: "track-a:network:1", routeId: "track-a" }],
    })], { recordDiscoveryCoverage: true });
    await enqueueMonitorCandidates(database, "space-a", [queueCandidate({
      canonicalId: "doi:10.1000/deactivated",
      doi: "10.1000/deactivated",
      title: "A deactivated route candidate",
      provenance: [{ sourceKey: "research-route:foundation", channel: "topic", queryKey: "track-a:foundation:1", routeId: "track-a" }],
    })], { recordDiscoveryCoverage: true });

    sqlite.prepare("UPDATE paper_insights SET analysis_source = 'deepseek_screened', analysis_model = 'deepseek-v4-pro' WHERE paper_id = 'paper-a'").run();
    sqlite.prepare("INSERT INTO recommendation_audit_events (id, space_id, paper_id, is_paper, recommended, provenance_json) VALUES (?, ?, ?, 1, 1, ?)")
      .run("audit-a", "space-a", "paper-a", JSON.stringify([
        { routeId: "track-a", originKind: "route_gap" },
        { routeId: "track-c", originKind: "route_frontier" },
      ]));
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback) VALUES ('feedback-a', 'space-a', 'paper-a', 0, 'relevant')").run();
    sqlite.prepare("INSERT INTO paper_feedback (id, space_id, paper_id, saved, feedback) SELECT 'feedback-dismissed', 'space-a', id, 0, 'not_relevant' FROM monitored_papers WHERE canonical_id = 'doi:10.1000/dismissed'").run();
    sqlite.prepare(`INSERT INTO research_track_papers
      (id, track_id, space_id, canonical_id, title, role, curation_status)
      SELECT 'route-paper-deactivated', 'track-a', 'space-a', canonical_id, title, 'foundation', 'deactivated'
      FROM monitored_papers WHERE canonical_id = 'doi:10.1000/deactivated'`).run();
    sqlite.prepare(`INSERT INTO research_map_evidence_proposals
      (id, space_id, track_id, paper_id, status)
      VALUES ('proposal-route-a', 'space-a', 'track-a', 'paper-a', 'confirmed'),
       ('proposal-route-c', 'space-a', 'track-c', 'paper-a', 'pending')`).run();

    const counts = await database.prepare(RESEARCH_ROUTE_PORTFOLIO_COUNTS_SQL)
      .bind("space-a", "space-a", "space-a", "space-a").first();
    assert.deepEqual({ ...counts }, {
      discovered_count: 2,
      queued_count: 1,
      reviewing_count: 1,
      deep_reviewed_count: 1,
      recommended_count: 1,
      accepted_count: 1,
      confirmed_evidence_count: 1,
      pending_evidence_count: 1,
    });
  } finally {
    sqlite.close();
  }
});

function routeAttentionFixture(overrides = {}) {
  return {
    id: "track-stable",
    papers: [{ id: "paper-visible" }],
    buildStatus: "ready",
    queuedForReviewCount: 0,
    reviewingForReviewCount: 0,
    recommendedCandidateCount: 0,
    pendingEvidenceCount: 0,
    discoveryEffect: { acceptedCount: 0, staleDays: 0 },
    intelligence: null,
    ...overrides,
  };
}

test("route attention stays honest and prioritizes recovery before downstream actions", () => {
  assert.deepEqual(researchRouteAttention(routeAttentionFixture({ id: "empty", papers: [] })), {
    trackId: "empty", kind: "recover", count: 0, priority: 650,
  });
  assert.equal(researchRouteAttention(routeAttentionFixture({ id: "partial", buildStatus: "partial" })).kind, "recover");
  assert.equal(researchRouteAttention(routeAttentionFixture({ recommendedCandidateCount: 2 })).kind, "today");
  assert.equal(researchRouteAttention(routeAttentionFixture({ queuedForReviewCount: 2, reviewingForReviewCount: 1 })).kind, "quality_review");
  assert.equal(researchRouteAttention(routeAttentionFixture({ pendingEvidenceCount: 1 })).kind, "confirm_evidence");
  assert.equal(researchRouteAttention(routeAttentionFixture({ intelligence: { evidenceGapZh: "缺少反例" } })).kind, "evidence_gap");
  assert.equal(researchRouteAttention(routeAttentionFixture({ discoveryEffect: { acceptedCount: 0, staleDays: 9 } })).priority, 180);

  const selected = selectResearchRouteAttention([
    routeAttentionFixture({ id: "today", recommendedCandidateCount: 4 }),
    routeAttentionFixture({ id: "degraded", buildStatus: "retryable" }),
    routeAttentionFixture({ id: "review", reviewingForReviewCount: 3 }),
  ]);
  assert.equal(selected.trackId, "degraded");
  assert.equal(selected.kind, "recover");
});

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

test("route-gap discovery enters the shared quality queue without pre-approving map evidence", async () => {
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
      pendingCount: 0,
      queuedCount: 1,
      paperIds: [sqlite.prepare("SELECT id FROM monitored_papers WHERE canonical_id = 'doi:10.2000/gap'").get().id],
    });
    assert.deepEqual(
      { ...sqlite.prepare("SELECT source, horizon FROM monitored_papers WHERE canonical_id = 'doi:10.2000/gap'").get() },
      { source: "research-route", horizon: "years" },
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT analysis_source, llm_recommended, analysis_model FROM paper_insights WHERE paper_id = (SELECT id FROM monitored_papers WHERE canonical_id = 'doi:10.2000/gap')").get() },
      { analysis_source: "metadata", llm_recommended: 0, analysis_model: "" },
    );
    assert.equal(count(sqlite, "research_map_evidence_proposals"), 0);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT cs.source_key, cs.channel, cs.query_key, c.route_id FROM monitor_candidate_sources cs JOIN monitor_discovery_coverage c USING (space_id, source_key, query_key)").get() },
      { source_key: "research-route:gap", channel: "topic", query_key: "track-a:legacy-gap", route_id: "track-a" },
    );
    assert.equal(count(sqlite, "research_track_papers"), 0);
    assert.equal(count(sqlite, "research_map_changes"), 0);

    const updated = { ...input, rationaleEn: "Updated route-specific rationale." };
    assert.equal((await upsertRouteGapResearchMapEvidence(database, "space-a", "track-a", [updated])).queuedCount, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_map_evidence_proposals").get().count, 0);
    assert.equal(sqlite.prepare("SELECT appearances FROM monitor_candidate_sources").get().appearances, 2);
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

test("the shared queue deduplicates DOI-less provider identities within and across batches", async () => {
  const { sqlite, database } = createFixture();
  const candidate = (canonicalId, sourceKey) => ({
    canonicalId,
    doi: null,
    title: "The Same Provider-Neutral Research Work",
    authors: "Ada Researcher",
    venue: "Research Archive",
    url: `https://example.test/${canonicalId}`,
    publishedAt: "2026-08-01",
    abstractText: "A shared abstract.",
    horizon: "days",
    citationCount: 3,
    relevanceScore: 61,
    qualityScore: 64,
    priorityVenue: false,
    source: sourceKey,
    provenance: [{ sourceKey, channel: "semantic", queryKey: `${sourceKey}:query` }],
  });
  try {
    const first = await enqueueMonitorCandidates(database, "space-a", [
      candidate("arxiv:2608.01234", "arxiv"),
      candidate("openalex:W123", "openalex"),
    ]);
    assert.equal(first.candidateCount, 1);
    assert.equal(first.newCandidateCount, 1);
    assert.match(first.canonicalIds[0], /^title:[a-f0-9]{64}$/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE title = ?").get("The Same Provider-Neutral Research Work").count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_candidate_sources WHERE paper_id = (SELECT id FROM monitored_papers WHERE title = ?)").get("The Same Provider-Neutral Research Work").count, 2);

    const second = await enqueueMonitorCandidates(database, "space-a", [candidate("s2:provider-record", "semantic-scholar")]);
    assert.equal(second.newCandidateCount, 0);
    assert.deepEqual(second.canonicalIds, first.canonicalIds);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE title = ?").get("The Same Provider-Neutral Research Work").count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_candidate_sources WHERE paper_id = (SELECT id FROM monitored_papers WHERE title = ?)").get("The Same Provider-Neutral Research Work").count, 3);
  } finally {
    sqlite.close();
  }
});

test("legacy DOI-less rows are reused across punctuation and whitespace variants", async () => {
  const { sqlite, database } = createFixture();
  const candidate = (canonicalId, title, sourceKey) => ({
    canonicalId,
    doi: null,
    title,
    authors: "Ada Researcher",
    venue: "Research Archive",
    url: `https://example.test/${canonicalId}`,
    publishedAt: "2026-08-01",
    abstractText: "A shared abstract.",
    horizon: "days",
    citationCount: 3,
    relevanceScore: 61,
    qualityScore: 64,
    priorityVenue: false,
    source: sourceKey,
    provenance: [{ sourceKey, channel: "semantic", queryKey: `${sourceKey}:query` }],
  });
  try {
    await enqueueMonitorCandidates(database, "space-a", [
      candidate("arxiv:legacy-record", "Rate–Distortion: A Theory", "arxiv"),
    ]);
    sqlite.prepare("UPDATE monitored_papers SET canonical_id = 'arxiv:legacy-record' WHERE title = 'Rate–Distortion: A Theory'").run();

    const second = await enqueueMonitorCandidates(database, "space-a", [
      candidate("openalex:W999", "Rate Distortion — A Theory", "openalex"),
    ]);
    assert.deepEqual(second.canonicalIds, ["arxiv:legacy-record"]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = 'space-a' AND doi IS NULL").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitor_candidate_sources WHERE paper_id = (SELECT id FROM monitored_papers WHERE canonical_id = 'arxiv:legacy-record')").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("oversized provider titles cannot break D1 identity lookup or reset retained review history", async () => {
  const { sqlite, database } = createFixture();
  const oversizedTitle = `Information${"x".repeat(60_000)}`;
  try {
    sqlite.prepare(
      `INSERT INTO monitored_papers
       (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon)
       VALUES (?, 'space-a', 'legacy:oversized-title', NULL, ?, 'Ada Researcher', 'Research Archive',
        'https://example.test/oversized', '2026-08-01', 'legacy-provider', 'months')`,
    ).run("paper-oversized", oversizedTitle);
    sqlite.prepare(
      `INSERT INTO paper_insights
       (paper_id, space_id, abstract_text, analysis_source, analysis_model, llm_recommended)
       VALUES ('paper-oversized', 'space-a', 'Previously reviewed evidence.', 'deepseek', 'deepseek-v4-pro', 1)`,
    ).run();

    const candidates = Array.from({ length: 70 }, (_, index) => index === 0
      ? queueCandidate({
        canonicalId: "openalex:oversized-title",
        doi: null,
        title: oversizedTitle,
        authors: "Ada Researcher",
        publishedAt: "2026-08-01",
        source: "openalex",
        provenance: [{ sourceKey: "openalex:topic", channel: "semantic", queryKey: "oversized-title" }],
      })
      : queueCandidate({
        canonicalId: `crossref:10.2000/${index}`,
        doi: `10.2000/${index}`,
        title: `Bounded lookup candidate ${index}`,
        authors: `Researcher ${index}`,
        url: `https://example.test/bounded-${index}`,
        provenance: [{ sourceKey: "crossref:topic", channel: "topic", queryKey: `bounded-${index}` }],
      }));

    const result = await enqueueMonitorCandidates(database, "space-a", candidates);
    assert.equal(result.candidateCount, 70);
    assert.equal(result.newCandidateCount, 69);
    assert.equal(result.recommendedCount, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = 'space-a'").get().count, 71);
    assert.equal(sqlite.prepare("SELECT id FROM monitored_papers WHERE canonical_id = 'legacy:oversized-title'").get().id, "paper-oversized");
    assert.deepEqual(
      { ...sqlite.prepare("SELECT analysis_source, analysis_model, llm_recommended FROM paper_insights WHERE paper_id = 'paper-oversized'").get() },
      { analysis_source: "deepseek", analysis_model: "deepseek-v4-pro", llm_recommended: 1 },
    );
  } finally {
    sqlite.close();
  }
});

test("same-title DOI-less works with conflicting authors or years remain separate", async () => {
  const { sqlite, database } = createFixture();
  const candidate = (canonicalId, authors, publishedAt) => ({
    canonicalId,
    doi: null,
    title: "An Introduction to Information Theory",
    authors,
    venue: "Research Archive",
    url: `https://example.test/${canonicalId}`,
    publishedAt,
    abstractText: "Distinct work metadata.",
    horizon: "years",
    citationCount: 3,
    relevanceScore: 61,
    qualityScore: 64,
    priorityVenue: false,
    source: canonicalId.startsWith("arxiv") ? "arxiv" : "openalex",
    provenance: [{ sourceKey: canonicalId, channel: "semantic", queryKey: `${canonicalId}:query` }],
  });
  try {
    const result = await enqueueMonitorCandidates(database, "space-a", [
      candidate("arxiv:2001.00001", "Ada Researcher", "2020-01-01"),
      candidate("openalex:W222", "Bertrand Scholar", "2021-01-01"),
    ]);
    assert.equal(result.candidateCount, 2);
    assert.equal(new Set(result.canonicalIds).size, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE title = 'An Introduction to Information Theory'").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("a unique DOI coalesces its provider-only twin without merging distinct DOI works", async () => {
  const { sqlite, database } = createFixture();
  const candidate = (canonicalId, doi, sourceKey) => ({
    canonicalId,
    doi,
    title: "A DOI-Preserved Research Work",
    authors: "Grace Researcher",
    venue: "Journal of Identity",
    url: `https://example.test/${canonicalId}`,
    publishedAt: "2026-07-01",
    abstractText: "Identity evidence.",
    horizon: "months",
    citationCount: 5,
    relevanceScore: 63,
    qualityScore: 67,
    priorityVenue: false,
    source: sourceKey,
    provenance: [{ sourceKey, channel: "topic", queryKey: `${sourceKey}:query` }],
  });
  try {
    const first = await enqueueMonitorCandidates(database, "space-a", [
      candidate("arxiv:2607.10000", null, "arxiv"),
      candidate("crossref:10.5555/one", "10.5555/one", "crossref"),
    ]);
    assert.deepEqual(first.canonicalIds, ["doi:10.5555/one"]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE title = ?").get("A DOI-Preserved Research Work").count, 1);
    assert.equal(sqlite.prepare("SELECT doi FROM monitored_papers WHERE title = ?").get("A DOI-Preserved Research Work").doi, "10.5555/one");

    const distinct = await enqueueMonitorCandidates(database, "space-a", [
      candidate("crossref:10.5555/two", "10.5555/two", "crossref-second"),
    ]);
    assert.deepEqual(distinct.canonicalIds, ["doi:10.5555/two"]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE title = ?").get("A DOI-Preserved Research Work").count, 2);
  } finally {
    sqlite.close();
  }
});

test("route discovery never resets an existing DeepSeek quality decision for duplicate review", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      "UPDATE paper_insights SET analysis_source = 'deepseek_rejected', analysis_model = 'deepseek-v4-pro', llm_recommended = 0, llm_relevance_score = 41 WHERE paper_id = 'paper-a'",
    ).run();
    await upsertRouteGapResearchMapEvidence(database, "space-a", "track-a", [{
      canonicalId: "doi:10.1000/a", doi: "10.1000/a", title: "A useful theorem", authors: "Ada Researcher",
      venue: "Journal A", url: "https://example.test/a", publishedAt: "2026-08-01", citationCount: 18,
      abstractText: "A longer replacement abstract that must not clear a completed model decision.", mapRole: "frontier",
      summaryZh: "", summaryEn: "", rationaleZh: "", rationaleEn: "", confidence: 90, model: "deepseek-v4-pro",
    }]);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT analysis_source, analysis_model, llm_recommended, llm_relevance_score FROM paper_insights WHERE paper_id = 'paper-a'").get() },
      { analysis_source: "deepseek_rejected", analysis_model: "deepseek-v4-pro", llm_recommended: 0, llm_relevance_score: 41 },
    );
    assert.equal(count(sqlite, "research_map_evidence_proposals"), 0);
  } finally {
    sqlite.close();
  }
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

test("a quality-approved system-curated paper can be confirmed without dismissal deleting its context node", async () => {
  const { sqlite, database } = createFixture();
  try {
    sqlite.prepare(
      `INSERT INTO research_track_papers
       (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role)
       SELECT 'system-paper-a', 'track-a', 'space-a', canonical_id, doi, title, authors, venue, url, published_at, citation_count, 'foundation'
       FROM monitored_papers WHERE id = 'paper-a'`,
    ).run();
    await upsertPendingResearchMapEvidence(database, [proposal({
      id: `${SYSTEM_CURATED_RESEARCH_MAP_REVIEW_ID_PREFIX}space-a:track-a:paper-a`,
      mapRole: "foundation",
    })]);
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "pending");

    await promoteResearchMapEvidence(database, "space-a", "paper-a");
    assert.equal(sqlite.prepare("SELECT role FROM research_track_papers").get().role, "foundation");
    assert.equal(count(sqlite, "research_map_changes"), 1);

    await dismissResearchMapEvidence(database, "space-a", "paper-a");
    assert.equal(sqlite.prepare("SELECT status FROM research_map_evidence_proposals").get().status, "dismissed");
    assert.equal(count(sqlite, "research_track_papers"), 1);
    assert.equal(count(sqlite, "research_map_changes"), 0);
  } finally {
    sqlite.close();
  }
});

test("promotion confirms evidence, writes the formal map once, and marks saved guidance stale", async () => {
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
    const savedGuidance = sqlite.prepare(
      "SELECT intelligence_json, intelligence_model, intelligence_updated_at, intelligence_status, intelligence_refresh_requested_at FROM research_tracks WHERE id = 'track-a'",
    ).get();
    assert.equal(savedGuidance.intelligence_json, '{"gap":"proof"}');
    assert.equal(savedGuidance.intelligence_model, "deepseek-v4-pro");
    assert.ok(savedGuidance.intelligence_updated_at);
    assert.equal(savedGuidance.intelligence_status, "pending");
    assert.ok(savedGuidance.intelligence_refresh_requested_at);
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
