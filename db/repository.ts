import { env } from "cloudflare:workers";

export type ApiUser = {
  userId: string;
  email: string;
  displayName: string;
};

type RuntimeEnv = {
  DB?: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function getDatabase(): D1Database {
  const database = getRuntimeEnv().DB;
  if (!database) throw new Error("D1 binding DB is unavailable");
  return database;
}

export function getApiUser(request: Request): ApiUser | null {
  const cookie = request.headers.get("cookie") ?? "";
  const workspaceEntry = cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("pi_anonymous_workspace="));
  const workspaceId = workspaceEntry?.slice("pi_anonymous_workspace=".length);

  if (!workspaceId || !/^[a-zA-Z0-9-]{20,64}$/.test(workspaceId)) return null;

  return {
    userId: "anonymous:" + workspaceId,
    email: "",
    displayName: "Researcher",
  };
}

async function ensurePaperInsightReviewColumns(database: D1Database) {
  const columns = await database.prepare("PRAGMA table_info(paper_insights)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column) => column.name));
  const additions = [
    { name: "analysis_model", sql: "ALTER TABLE paper_insights ADD COLUMN analysis_model TEXT NOT NULL DEFAULT ''" },
    { name: "llm_recommended", sql: "ALTER TABLE paper_insights ADD COLUMN llm_recommended INTEGER NOT NULL DEFAULT 0" },
    { name: "llm_relevance_score", sql: "ALTER TABLE paper_insights ADD COLUMN llm_relevance_score INTEGER NOT NULL DEFAULT 0" },
    { name: "screening_reason", sql: "ALTER TABLE paper_insights ADD COLUMN screening_reason TEXT NOT NULL DEFAULT ''" },
  ];
  for (const addition of additions) {
    if (!existing.has(addition.name)) await database.prepare(addition.sql).run();
  }
}

async function ensureGrowthMapColumns(database: D1Database) {
  const monitorColumns = await database.prepare("PRAGMA table_info(monitor_runs)").all<{ name: string }>();
  if (!new Set(monitorColumns.results.map((column) => column.name)).has("discovery_round")) {
    await database.prepare("ALTER TABLE monitor_runs ADD COLUMN discovery_round INTEGER NOT NULL DEFAULT 0").run();
  }
  const trackColumns = await database.prepare("PRAGMA table_info(research_tracks)").all<{ name: string }>();
  const existing = new Set(trackColumns.results.map((column) => column.name));
  const additions = [
    { name: "user_role", sql: "ALTER TABLE research_tracks ADD COLUMN user_role TEXT NOT NULL DEFAULT 'explore'" },
    { name: "depth_score", sql: "ALTER TABLE research_tracks ADD COLUMN depth_score INTEGER NOT NULL DEFAULT 0" },
    { name: "support_score", sql: "ALTER TABLE research_tracks ADD COLUMN support_score INTEGER NOT NULL DEFAULT 0" },
    { name: "interaction_score", sql: "ALTER TABLE research_tracks ADD COLUMN interaction_score INTEGER NOT NULL DEFAULT 0" },
    { name: "intelligence_json", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_json TEXT NOT NULL DEFAULT '{}'" },
    { name: "intelligence_model", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_model TEXT NOT NULL DEFAULT ''" },
    { name: "intelligence_updated_at", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_updated_at TEXT" },
  ];
  for (const addition of additions) {
    if (!existing.has(addition.name)) await database.prepare(addition.sql).run();
  }
}

export async function ensureSchema(database = getDatabase()) {
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS research_spaces (id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, member_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', accent TEXT NOT NULL DEFAULT 'blue', preferred_locale TEXT NOT NULL DEFAULT 'zh', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_spaces_owner_name ON research_spaces(owner_user_id, name)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_spaces_owner ON research_spaces(owner_user_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_threads (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, title TEXT NOT NULL, research_question TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'medium', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_threads_space ON research_threads(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_feedback (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL, feedback TEXT, reason_code TEXT, note TEXT NOT NULL DEFAULT '', saved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_feedback_space_paper ON paper_feedback(space_id, paper_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_conversations (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh', model TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_conversations_space ON research_conversations(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS ai_usage_daily (id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, usage_date TEXT NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_daily_scope_date ON ai_usage_daily(scope, usage_date)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_date ON ai_usage_daily(usage_date)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_runs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'idle', last_run_at TEXT, next_run_at TEXT, new_count INTEGER NOT NULL DEFAULT 0, scanned_count INTEGER NOT NULL DEFAULT 0, discovery_round INTEGER NOT NULL DEFAULT 0, lock_token TEXT, lock_expires_at TEXT, last_trigger TEXT NOT NULL DEFAULT 'visit', error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_runs_space ON monitor_runs(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_discovery_pages (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, horizon TEXT NOT NULL, query_key TEXT NOT NULL, next_offset INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_discovery_space_horizon_query ON monitor_discovery_pages(space_id, horizon, query_key)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_scan_jobs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'queued', current_horizon TEXT NOT NULL DEFAULT '', current_source TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0, discovered_count INTEGER NOT NULL DEFAULT 0, new_candidate_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0, reviewed_count INTEGER NOT NULL DEFAULT 0, recommended_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0, attempt INTEGER NOT NULL DEFAULT 1, trigger_source TEXT NOT NULL DEFAULT 'manual', resume_of_job_id TEXT, checkpoint TEXT NOT NULL DEFAULT 'queued', error TEXT, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_scan_jobs_space_updated ON monitor_scan_jobs(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_daily_briefs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, brief_date TEXT NOT NULL, scan_job_id TEXT, status TEXT NOT NULL DEFAULT 'pending', headline_zh TEXT NOT NULL DEFAULT '', headline_en TEXT NOT NULL DEFAULT '', overview_zh TEXT NOT NULL DEFAULT '', overview_en TEXT NOT NULL DEFAULT '', signals_zh TEXT NOT NULL DEFAULT '[]', signals_en TEXT NOT NULL DEFAULT '[]', reading_plan_zh TEXT NOT NULL DEFAULT '[]', reading_plan_en TEXT NOT NULL DEFAULT '[]', watchlist_zh TEXT NOT NULL DEFAULT '[]', watchlist_en TEXT NOT NULL DEFAULT '[]', paper_ids TEXT NOT NULL DEFAULT '[]', metrics_json TEXT NOT NULL DEFAULT '{}', model TEXT NOT NULL DEFAULT '', error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_daily_briefs_space_date ON monitor_daily_briefs(space_id, brief_date)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_daily_briefs_space_updated ON monitor_daily_briefs(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_weekly_reviews (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, week_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', title_zh TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '', overview_zh TEXT NOT NULL DEFAULT '', overview_en TEXT NOT NULL DEFAULT '', gains_zh TEXT NOT NULL DEFAULT '[]', gains_en TEXT NOT NULL DEFAULT '[]', gaps_zh TEXT NOT NULL DEFAULT '[]', gaps_en TEXT NOT NULL DEFAULT '[]', next_steps_zh TEXT NOT NULL DEFAULT '[]', next_steps_en TEXT NOT NULL DEFAULT '[]', source_days INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_weekly_reviews_space_week ON monitor_weekly_reviews(space_id, week_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_weekly_reviews_space_updated ON monitor_weekly_reviews(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_notifications (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, dedupe_key TEXT NOT NULL, kind TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', title_zh TEXT NOT NULL, title_en TEXT NOT NULL, body_zh TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', action_view TEXT NOT NULL DEFAULT 'today', entity_id TEXT, read_at TEXT, expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_notifications_space_dedupe ON research_notifications(space_id, dedupe_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_notifications_space_read_created ON research_notifications(space_id, read_at, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_discovery_coverage (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, horizon TEXT NOT NULL, source_key TEXT NOT NULL, channel TEXT NOT NULL, query_key TEXT NOT NULL, query_text TEXT NOT NULL DEFAULT '', route_id TEXT, exploration_role TEXT NOT NULL DEFAULT 'core', adaptive_score INTEGER NOT NULL DEFAULT 55, next_cursor INTEGER NOT NULL DEFAULT 0, attempt_count INTEGER NOT NULL DEFAULT 0, candidate_count INTEGER NOT NULL DEFAULT 0, total_candidate_count INTEGER NOT NULL DEFAULT 0, new_candidate_count INTEGER NOT NULL DEFAULT 0, zero_yield_streak INTEGER NOT NULL DEFAULT 0, branch_status TEXT NOT NULL DEFAULT 'exploring', cooldown_until TEXT, first_scanned_at TEXT, last_scanned_at TEXT, last_error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_coverage_scope ON monitor_discovery_coverage(space_id, horizon, source_key, query_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_coverage_space_scanned ON monitor_discovery_coverage(space_id, last_scanned_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_coverage_space_route ON monitor_discovery_coverage(space_id, route_id, last_scanned_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitored_papers (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, canonical_id TEXT NOT NULL, doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', published_at TEXT, source TEXT NOT NULL DEFAULT 'crossref', horizon TEXT NOT NULL, citation_count INTEGER NOT NULL DEFAULT 0, relevance_score INTEGER NOT NULL DEFAULT 0, discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_papers_space_canonical ON monitored_papers(space_id, canonical_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitored_papers_space_discovered ON monitored_papers(space_id, discovered_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_delivery_state (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, show_count INTEGER NOT NULL DEFAULT 0, first_shown_at TEXT, last_shown_at TEXT, opened_at TEXT, snoozed_until TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_delivery_space_paper ON paper_delivery_state(space_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_delivery_space_last_shown ON paper_delivery_state(space_id, last_shown_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_reading_progress (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'unread', note TEXT NOT NULL DEFAULT '', started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_reading_space_paper ON paper_reading_progress(space_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_reading_space_status ON paper_reading_progress(space_id, status, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_reading_memories (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, note_hash TEXT NOT NULL, analysis_status TEXT NOT NULL DEFAULT 'pending', takeaway_zh TEXT NOT NULL DEFAULT '', takeaway_en TEXT NOT NULL DEFAULT '', methods_zh TEXT NOT NULL DEFAULT '[]', methods_en TEXT NOT NULL DEFAULT '[]', questions_zh TEXT NOT NULL DEFAULT '[]', questions_en TEXT NOT NULL DEFAULT '[]', connections_zh TEXT NOT NULL DEFAULT '[]', connections_en TEXT NOT NULL DEFAULT '[]', topics_zh TEXT NOT NULL DEFAULT '[]', topics_en TEXT NOT NULL DEFAULT '[]', track_id TEXT, model TEXT NOT NULL DEFAULT '', error TEXT, analyzed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_memories_space_paper ON paper_reading_memories(space_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_reading_memories_space_updated ON paper_reading_memories(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_preferences (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, profile_key TEXT NOT NULL, priority_venues TEXT NOT NULL DEFAULT '[]', tracked_authors TEXT NOT NULL DEFAULT '[]', exploration_mode TEXT NOT NULL DEFAULT 'balanced', user_modified INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_preferences_space ON monitor_preferences(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_preference_signals (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, layer TEXT NOT NULL, kind TEXT NOT NULL, label_zh TEXT NOT NULL, label_en TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 50, weight INTEGER NOT NULL DEFAULT 50, source_type TEXT NOT NULL, source_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_preference_signals_source ON research_preference_signals(space_id, source_type, source_id, kind, label_en)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_preference_signals_space_layer ON research_preference_signals(space_id, layer, active)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_query_plans (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, plan_date TEXT NOT NULL, exploration_mode TEXT NOT NULL, queries_json TEXT NOT NULL DEFAULT '{}', rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_query_plans_space_date ON monitor_query_plans(space_id, plan_date)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_query_plans_space_created ON monitor_query_plans(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_insights (paper_id TEXT PRIMARY KEY NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, abstract_text TEXT NOT NULL DEFAULT '', summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', why_read_zh TEXT NOT NULL DEFAULT '', why_read_en TEXT NOT NULL DEFAULT '', quality_score INTEGER NOT NULL DEFAULT 0, priority_venue INTEGER NOT NULL DEFAULT 0, analysis_source TEXT NOT NULL DEFAULT 'metadata', analysis_model TEXT NOT NULL DEFAULT '', llm_recommended INTEGER NOT NULL DEFAULT 0, llm_relevance_score INTEGER NOT NULL DEFAULT 0, screening_reason TEXT NOT NULL DEFAULT '', recommendation_tier TEXT NOT NULL DEFAULT 'browse', read_minutes INTEGER NOT NULL DEFAULT 12, read_depth TEXT NOT NULL DEFAULT 'focused', problem_zh TEXT NOT NULL DEFAULT '', problem_en TEXT NOT NULL DEFAULT '', method_zh TEXT NOT NULL DEFAULT '', method_en TEXT NOT NULL DEFAULT '', contribution_zh TEXT NOT NULL DEFAULT '', contribution_en TEXT NOT NULL DEFAULT '', limitations_zh TEXT NOT NULL DEFAULT '', limitations_en TEXT NOT NULL DEFAULT '', reading_focus_zh TEXT NOT NULL DEFAULT '', reading_focus_en TEXT NOT NULL DEFAULT '', research_questions_zh TEXT NOT NULL DEFAULT '[]', research_questions_en TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_insights_space_quality ON paper_insights(space_id, quality_score)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_candidate_sources (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, source_key TEXT NOT NULL, channel TEXT NOT NULL, query_key TEXT NOT NULL, appearances INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_candidate_source_identity ON monitor_candidate_sources(paper_id, source_key, query_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_candidate_sources_space ON monitor_candidate_sources(space_id, last_seen_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS recommendation_audit_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, scan_job_id TEXT NOT NULL REFERENCES monitor_scan_jobs(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, decision TEXT NOT NULL, is_paper INTEGER NOT NULL DEFAULT 1, recommended INTEGER NOT NULL DEFAULT 0, horizon TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', relevance_score INTEGER NOT NULL DEFAULT 0, quality_score INTEGER NOT NULL DEFAULT 0, recommendation_tier TEXT NOT NULL DEFAULT 'browse', screening_reason TEXT NOT NULL DEFAULT '', provenance_json TEXT NOT NULL DEFAULT '[]', appearance_count INTEGER NOT NULL DEFAULT 1, allocated_input_tokens INTEGER NOT NULL DEFAULT 0, allocated_output_tokens INTEGER NOT NULL DEFAULT 0, reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_audit_job_paper ON recommendation_audit_events(scan_job_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_recommendation_audit_space_reviewed ON recommendation_audit_events(space_id, reviewed_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_recommendation_audit_space_decision_reviewed ON recommendation_audit_events(space_id, decision, reviewed_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS share_snapshots (id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, kind TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh', title TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_share_snapshots_token ON share_snapshots(token)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_share_snapshots_space_created ON share_snapshots(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_imports (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, source_kind TEXT NOT NULL, file_names TEXT NOT NULL DEFAULT '[]', content_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', safety_attested INTEGER NOT NULL DEFAULT 0, analysis_json TEXT NOT NULL, analysis_model TEXT NOT NULL DEFAULT '', input_chars INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_imports_space_hash ON research_imports(space_id, content_hash)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_imports_space_status_created ON research_imports(space_id, status, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_tracks (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, title_zh TEXT NOT NULL, title_en TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', search_queries TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0, expansion_count INTEGER NOT NULL DEFAULT 0, user_role TEXT NOT NULL DEFAULT 'explore', depth_score INTEGER NOT NULL DEFAULT 0, support_score INTEGER NOT NULL DEFAULT 0, interaction_score INTEGER NOT NULL DEFAULT 0, intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_model TEXT NOT NULL DEFAULT '', intelligence_updated_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_tracks_space_position ON research_tracks(space_id, position)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_map_changes (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'new_evidence', title_zh TEXT NOT NULL, title_en TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_map_changes_paper_track_kind ON research_map_changes(paper_id, track_id, kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_map_changes_space_created ON research_map_changes(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_track_edges (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, source_track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, target_track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'builds_on', relationship_zh TEXT NOT NULL DEFAULT '', relationship_en TEXT NOT NULL DEFAULT '', strength INTEGER NOT NULL DEFAULT 50, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_track_edges_pair_kind ON research_track_edges(source_track_id, target_track_id, kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_track_edges_space ON research_track_edges(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_track_papers (id TEXT PRIMARY KEY NOT NULL, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, canonical_id TEXT NOT NULL, doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', published_at TEXT, citation_count INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_track_papers_track_canonical ON research_track_papers(track_id, canonical_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_track_papers_track_position ON research_track_papers(track_id, position)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_paper_edges (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, source_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, target_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, kind TEXT NOT NULL, relation_kind TEXT NOT NULL DEFAULT 'related', relationship_zh TEXT NOT NULL DEFAULT '', relationship_en TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0, evidence_source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_paper_edges_pair_kind_relation ON research_paper_edges(source_paper_id, target_paper_id, kind, relation_kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_paper_edges_space_kind ON research_paper_edges(space_id, kind)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_paper_network_states (space_id TEXT PRIMARY KEY NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'idle', built_paper_count INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', sources_json TEXT NOT NULL DEFAULT '[]', error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_paper_network_states_status ON research_paper_network_states(status, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS learning_paths (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, target TEXT NOT NULL, title_zh TEXT NOT NULL, title_en TEXT NOT NULL, rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', analysis_model TEXT NOT NULL DEFAULT '', estimated_minutes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_paths_space_updated ON learning_paths(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS learning_path_steps (id TEXT PRIMARY KEY NOT NULL, path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'foundation', title_zh TEXT NOT NULL, title_en TEXT NOT NULL, goal_zh TEXT NOT NULL DEFAULT '', goal_en TEXT NOT NULL DEFAULT '', why_zh TEXT NOT NULL DEFAULT '', why_en TEXT NOT NULL DEFAULT '', read_focus_zh TEXT NOT NULL DEFAULT '', read_focus_en TEXT NOT NULL DEFAULT '', checkpoint_zh TEXT NOT NULL DEFAULT '', checkpoint_en TEXT NOT NULL DEFAULT '', estimated_minutes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', position INTEGER NOT NULL DEFAULT 0, resources_json TEXT NOT NULL DEFAULT '[]', completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path_position ON learning_path_steps(path_id, position)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_path_steps_space_status ON learning_path_steps(space_id, status)"),
  ]);
  await ensurePaperInsightReviewColumns(database);
  await ensureGrowthMapColumns(database);
  const feedbackColumns = await database.prepare("PRAGMA table_info(paper_feedback)").all<{ name: string }>();
  const feedbackColumnNames = new Set(feedbackColumns.results.map((column) => column.name));
  if (!feedbackColumnNames.has("reason_code")) await database.prepare("ALTER TABLE paper_feedback ADD COLUMN reason_code TEXT").run();
  if (!feedbackColumnNames.has("note")) await database.prepare("ALTER TABLE paper_feedback ADD COLUMN note TEXT NOT NULL DEFAULT ''").run();
  const preferenceColumns = await database.prepare("PRAGMA table_info(monitor_preferences)").all<{ name: string }>();
  if (!preferenceColumns.results.some((column) => column.name === "exploration_mode")) {
    await database.prepare("ALTER TABLE monitor_preferences ADD COLUMN exploration_mode TEXT NOT NULL DEFAULT 'balanced'").run();
  }
  if (!preferenceColumns.results.some((column) => column.name === "tracked_authors")) {
    await database.prepare("ALTER TABLE monitor_preferences ADD COLUMN tracked_authors TEXT NOT NULL DEFAULT '[]'").run();
  }
  const insightColumns = await database.prepare("PRAGMA table_info(paper_insights)").all<{ name: string }>();
  const insightColumnNames = new Set(insightColumns.results.map((column) => column.name));
  const insightAdditions = [
    ["recommendation_tier", "ALTER TABLE paper_insights ADD COLUMN recommendation_tier TEXT NOT NULL DEFAULT 'browse'"],
    ["read_minutes", "ALTER TABLE paper_insights ADD COLUMN read_minutes INTEGER NOT NULL DEFAULT 12"],
    ["read_depth", "ALTER TABLE paper_insights ADD COLUMN read_depth TEXT NOT NULL DEFAULT 'focused'"],
    ["problem_zh", "ALTER TABLE paper_insights ADD COLUMN problem_zh TEXT NOT NULL DEFAULT ''"],
    ["problem_en", "ALTER TABLE paper_insights ADD COLUMN problem_en TEXT NOT NULL DEFAULT ''"],
    ["method_zh", "ALTER TABLE paper_insights ADD COLUMN method_zh TEXT NOT NULL DEFAULT ''"],
    ["method_en", "ALTER TABLE paper_insights ADD COLUMN method_en TEXT NOT NULL DEFAULT ''"],
    ["contribution_zh", "ALTER TABLE paper_insights ADD COLUMN contribution_zh TEXT NOT NULL DEFAULT ''"],
    ["contribution_en", "ALTER TABLE paper_insights ADD COLUMN contribution_en TEXT NOT NULL DEFAULT ''"],
    ["limitations_zh", "ALTER TABLE paper_insights ADD COLUMN limitations_zh TEXT NOT NULL DEFAULT ''"],
    ["limitations_en", "ALTER TABLE paper_insights ADD COLUMN limitations_en TEXT NOT NULL DEFAULT ''"],
    ["reading_focus_zh", "ALTER TABLE paper_insights ADD COLUMN reading_focus_zh TEXT NOT NULL DEFAULT ''"],
    ["reading_focus_en", "ALTER TABLE paper_insights ADD COLUMN reading_focus_en TEXT NOT NULL DEFAULT ''"],
    ["research_questions_zh", "ALTER TABLE paper_insights ADD COLUMN research_questions_zh TEXT NOT NULL DEFAULT '[]'"],
    ["research_questions_en", "ALTER TABLE paper_insights ADD COLUMN research_questions_en TEXT NOT NULL DEFAULT '[]'"],
  ] as const;
  for (const [name, sql] of insightAdditions) if (!insightColumnNames.has(name)) await database.prepare(sql).run();
  const scanJobColumns = await database.prepare("PRAGMA table_info(monitor_scan_jobs)").all<{ name: string }>();
  const scanJobColumnNames = new Set(scanJobColumns.results.map((column) => column.name));
  const scanJobAdditions = [
    ["new_candidate_count", "ALTER TABLE monitor_scan_jobs ADD COLUMN new_candidate_count INTEGER NOT NULL DEFAULT 0"],
    ["duplicate_count", "ALTER TABLE monitor_scan_jobs ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0"],
    ["rejected_count", "ALTER TABLE monitor_scan_jobs ADD COLUMN rejected_count INTEGER NOT NULL DEFAULT 0"],
    ["trigger_source", "ALTER TABLE monitor_scan_jobs ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'manual'"],
    ["resume_of_job_id", "ALTER TABLE monitor_scan_jobs ADD COLUMN resume_of_job_id TEXT"],
    ["checkpoint", "ALTER TABLE monitor_scan_jobs ADD COLUMN checkpoint TEXT NOT NULL DEFAULT 'queued'"],
  ] as const;
  for (const [name, sql] of scanJobAdditions) if (!scanJobColumnNames.has(name)) await database.prepare(sql).run();
  const monitorRunColumns = await database.prepare("PRAGMA table_info(monitor_runs)").all<{ name: string }>();
  const monitorRunColumnNames = new Set(monitorRunColumns.results.map((column) => column.name));
  const monitorRunAdditions = [
    ["lock_token", "ALTER TABLE monitor_runs ADD COLUMN lock_token TEXT"],
    ["lock_expires_at", "ALTER TABLE monitor_runs ADD COLUMN lock_expires_at TEXT"],
    ["last_trigger", "ALTER TABLE monitor_runs ADD COLUMN last_trigger TEXT NOT NULL DEFAULT 'visit'"],
  ] as const;
  for (const [name, sql] of monitorRunAdditions) if (!monitorRunColumnNames.has(name)) await database.prepare(sql).run();
  const coverageColumns = await database.prepare("PRAGMA table_info(monitor_discovery_coverage)").all<{ name: string }>();
  const coverageColumnNames = new Set(coverageColumns.results.map((column) => column.name));
  const coverageAdditions = [
    ["query_text", "ALTER TABLE monitor_discovery_coverage ADD COLUMN query_text TEXT NOT NULL DEFAULT ''"],
    ["total_candidate_count", "ALTER TABLE monitor_discovery_coverage ADD COLUMN total_candidate_count INTEGER NOT NULL DEFAULT 0"],
    ["zero_yield_streak", "ALTER TABLE monitor_discovery_coverage ADD COLUMN zero_yield_streak INTEGER NOT NULL DEFAULT 0"],
    ["branch_status", "ALTER TABLE monitor_discovery_coverage ADD COLUMN branch_status TEXT NOT NULL DEFAULT 'exploring'"],
    ["cooldown_until", "ALTER TABLE monitor_discovery_coverage ADD COLUMN cooldown_until TEXT"],
    ["first_scanned_at", "ALTER TABLE monitor_discovery_coverage ADD COLUMN first_scanned_at TEXT"],
    ["route_id", "ALTER TABLE monitor_discovery_coverage ADD COLUMN route_id TEXT"],
    ["exploration_role", "ALTER TABLE monitor_discovery_coverage ADD COLUMN exploration_role TEXT NOT NULL DEFAULT 'core'"],
    ["adaptive_score", "ALTER TABLE monitor_discovery_coverage ADD COLUMN adaptive_score INTEGER NOT NULL DEFAULT 55"],
  ] as const;
  for (const [name, sql] of coverageAdditions) if (!coverageColumnNames.has(name)) await database.prepare(sql).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_coverage_space_route ON monitor_discovery_coverage(space_id, route_id, last_scanned_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_insights_space_recommended_quality ON paper_insights(space_id, llm_recommended, quality_score)").run();
  await database.prepare("PRAGMA optimize").run();
}
