import { env } from "cloudflare:workers";
import { researchGapDiscoveryBootstrapSql, researchMapEvidenceProposalBootstrapSql, researchProblemBootstrapSql, researchRouteRevisionBootstrapSql, researchSynthesisBootstrapSql } from "./schema";

export type ApiUser = {
  userId: string;
  email: string;
  displayName: string;
};

type RuntimeEnv = {
  DB?: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  PI_DEVELOPMENT_UNBOUNDED?: string;
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
    { name: "recommendation_tier", sql: "ALTER TABLE paper_insights ADD COLUMN recommendation_tier TEXT NOT NULL DEFAULT 'browse'" },
    { name: "proposed_recommendation_tier", sql: "ALTER TABLE paper_insights ADD COLUMN proposed_recommendation_tier TEXT NOT NULL DEFAULT 'browse'" },
    { name: "research_problem_id", sql: "ALTER TABLE paper_insights ADD COLUMN research_problem_id TEXT" },
    { name: "problem_fit_score", sql: "ALTER TABLE paper_insights ADD COLUMN problem_fit_score INTEGER NOT NULL DEFAULT 0" },
    { name: "uncertainty_reduction_score", sql: "ALTER TABLE paper_insights ADD COLUMN uncertainty_reduction_score INTEGER NOT NULL DEFAULT 0" },
    { name: "actionability_score", sql: "ALTER TABLE paper_insights ADD COLUMN actionability_score INTEGER NOT NULL DEFAULT 0" },
    { name: "research_problem_impact_zh", sql: "ALTER TABLE paper_insights ADD COLUMN research_problem_impact_zh TEXT NOT NULL DEFAULT ''" },
    { name: "research_problem_impact_en", sql: "ALTER TABLE paper_insights ADD COLUMN research_problem_impact_en TEXT NOT NULL DEFAULT ''" },
    { name: "research_decision_zh", sql: "ALTER TABLE paper_insights ADD COLUMN research_decision_zh TEXT NOT NULL DEFAULT ''" },
    { name: "research_decision_en", sql: "ALTER TABLE paper_insights ADD COLUMN research_decision_en TEXT NOT NULL DEFAULT ''" },
    { name: "verification_status", sql: "ALTER TABLE paper_insights ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'not_required'" },
    { name: "verification_coverage_score", sql: "ALTER TABLE paper_insights ADD COLUMN verification_coverage_score INTEGER NOT NULL DEFAULT 0" },
    { name: "verification_json", sql: "ALTER TABLE paper_insights ADD COLUMN verification_json TEXT NOT NULL DEFAULT '{}'" },
    { name: "verification_model", sql: "ALTER TABLE paper_insights ADD COLUMN verification_model TEXT NOT NULL DEFAULT ''" },
    { name: "ever_recommended", sql: "ALTER TABLE paper_insights ADD COLUMN ever_recommended INTEGER NOT NULL DEFAULT 0" },
    { name: "first_recommended_at", sql: "ALTER TABLE paper_insights ADD COLUMN first_recommended_at TEXT" },
    { name: "last_recommended_at", sql: "ALTER TABLE paper_insights ADD COLUMN last_recommended_at TEXT" },
  ];
  const needsRecommendationHistoryBackfill = !existing.has("ever_recommended");
  for (const addition of additions) {
    if (!existing.has(addition.name)) await database.prepare(addition.sql).run();
  }
  await database.prepare(
    "UPDATE paper_insights SET proposed_recommendation_tier = recommendation_tier WHERE recommendation_tier = 'must_read' AND proposed_recommendation_tier = 'browse'",
  ).run();
  if (needsRecommendationHistoryBackfill) {
    await database.prepare(
      `UPDATE paper_insights SET
       ever_recommended = 1,
       llm_recommended = 1,
       analysis_source = 'deepseek',
       analysis_model = COALESCE((
         SELECT audit.model FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
       ), analysis_model),
       llm_relevance_score = MAX(llm_relevance_score, COALESCE((
         SELECT MAX(audit.relevance_score) FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1
       ), 0)),
       quality_score = MAX(quality_score, COALESCE((
         SELECT MAX(audit.quality_score) FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1
       ), 0)),
       proposed_recommendation_tier = COALESCE((
         SELECT audit.recommendation_tier FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
       ), proposed_recommendation_tier),
       recommendation_tier = COALESCE((
         SELECT audit.recommendation_tier FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
       ), recommendation_tier),
       verification_status = COALESCE((
         SELECT audit.verification_status FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1 ORDER BY audit.reviewed_at DESC, audit.id DESC LIMIT 1
       ), verification_status),
       first_recommended_at = (
         SELECT MIN(audit.reviewed_at) FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1
       ),
       last_recommended_at = (
         SELECT MAX(audit.reviewed_at) FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1
       )
       WHERE EXISTS (
         SELECT 1 FROM recommendation_audit_events audit
         WHERE audit.space_id = paper_insights.space_id AND audit.paper_id = paper_insights.paper_id
          AND audit.recommended = 1
       )`,
    ).run();
  }
}

async function ensureEvidenceVerificationColumns(database: D1Database) {
  const plans = [
    {
      table: "recommendation_audit_events",
      additions: [
        ["verification_status", "ALTER TABLE recommendation_audit_events ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'not_required'"],
        ["verification_coverage_score", "ALTER TABLE recommendation_audit_events ADD COLUMN verification_coverage_score INTEGER NOT NULL DEFAULT 0"],
        ["verification_json", "ALTER TABLE recommendation_audit_events ADD COLUMN verification_json TEXT NOT NULL DEFAULT '{}'"],
        ["verification_input_tokens", "ALTER TABLE recommendation_audit_events ADD COLUMN verification_input_tokens INTEGER NOT NULL DEFAULT 0"],
        ["verification_output_tokens", "ALTER TABLE recommendation_audit_events ADD COLUMN verification_output_tokens INTEGER NOT NULL DEFAULT 0"],
      ],
    },
    {
      table: "research_action_runs",
      additions: [
        ["verification_status", "ALTER TABLE research_action_runs ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'"],
        ["verification_coverage_score", "ALTER TABLE research_action_runs ADD COLUMN verification_coverage_score INTEGER NOT NULL DEFAULT 0"],
        ["verification_json", "ALTER TABLE research_action_runs ADD COLUMN verification_json TEXT NOT NULL DEFAULT '{}'"],
        ["verification_model", "ALTER TABLE research_action_runs ADD COLUMN verification_model TEXT NOT NULL DEFAULT ''"],
        ["verification_input_tokens", "ALTER TABLE research_action_runs ADD COLUMN verification_input_tokens INTEGER NOT NULL DEFAULT 0"],
        ["verification_output_tokens", "ALTER TABLE research_action_runs ADD COLUMN verification_output_tokens INTEGER NOT NULL DEFAULT 0"],
      ],
    },
  ] as const;
  for (const plan of plans) {
    const columns = await database.prepare(`PRAGMA table_info(${plan.table})`).all<{ name: string }>();
    const existing = new Set(columns.results.map((column) => column.name));
    for (const [name, sql] of plan.additions) if (!existing.has(name)) await database.prepare(sql).run();
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
    { name: "monitoring_status", sql: "ALTER TABLE research_tracks ADD COLUMN monitoring_status TEXT NOT NULL DEFAULT 'active'" },
    { name: "depth_score", sql: "ALTER TABLE research_tracks ADD COLUMN depth_score INTEGER NOT NULL DEFAULT 0" },
    { name: "support_score", sql: "ALTER TABLE research_tracks ADD COLUMN support_score INTEGER NOT NULL DEFAULT 0" },
    { name: "interaction_score", sql: "ALTER TABLE research_tracks ADD COLUMN interaction_score INTEGER NOT NULL DEFAULT 0" },
    { name: "intelligence_json", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_json TEXT NOT NULL DEFAULT '{}'" },
    { name: "intelligence_model", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_model TEXT NOT NULL DEFAULT ''" },
    { name: "intelligence_updated_at", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_updated_at TEXT" },
    { name: "intelligence_status", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_status TEXT NOT NULL DEFAULT 'pending'" },
    { name: "intelligence_attempt_count", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_attempt_count INTEGER NOT NULL DEFAULT 0" },
    { name: "intelligence_error", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_error TEXT" },
    { name: "intelligence_retry_at", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_retry_at TEXT" },
    { name: "intelligence_lock_token", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_lock_token TEXT" },
    { name: "intelligence_lock_expires_at", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_lock_expires_at TEXT" },
    { name: "intelligence_refresh_requested_at", sql: "ALTER TABLE research_tracks ADD COLUMN intelligence_refresh_requested_at TEXT" },
  ];
  for (const addition of additions) {
    if (!existing.has(addition.name)) await database.prepare(addition.sql).run();
  }
}

async function ensureResearchNetworkColumns(database: D1Database) {
  const edgeColumns = await database.prepare("PRAGMA table_info(research_network_candidate_edges)").all<{ name: string }>();
  const existing = new Set(edgeColumns.results.map((column) => column.name));
  if (!existing.has("expansion_key")) await database.prepare("ALTER TABLE research_network_candidate_edges ADD COLUMN expansion_key TEXT NOT NULL DEFAULT ''").run();
  if (!existing.has("seed_set_json")) await database.prepare("ALTER TABLE research_network_candidate_edges ADD COLUMN seed_set_json TEXT NOT NULL DEFAULT '[]'").run();
  const expansionColumns = await database.prepare("PRAGMA table_info(research_network_expansion_states)").all<{ name: string }>();
  const expansionExisting = new Set(expansionColumns.results.map((column) => column.name));
  const additions = [
    ["similarity_json", "ALTER TABLE research_network_expansion_states ADD COLUMN similarity_json TEXT NOT NULL DEFAULT '[]'"],
    ["similarity_status", "ALTER TABLE research_network_expansion_states ADD COLUMN similarity_status TEXT NOT NULL DEFAULT 'idle'"],
    ["similarity_expires_at", "ALTER TABLE research_network_expansion_states ADD COLUMN similarity_expires_at TEXT"],
    ["lock_token", "ALTER TABLE research_network_expansion_states ADD COLUMN lock_token TEXT"],
    ["lock_expires_at", "ALTER TABLE research_network_expansion_states ADD COLUMN lock_expires_at TEXT"],
  ] as const;
  for (const [name, sql] of additions) if (!expansionExisting.has(name)) await database.prepare(sql).run();
}

async function ensureLearningPathColumns(database: D1Database) {
  const columns = await database.prepare("PRAGMA table_info(learning_paths)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column) => column.name));
  if (!existing.has("target_track_id")) {
    await database.prepare("ALTER TABLE learning_paths ADD COLUMN target_track_id TEXT REFERENCES research_tracks(id) ON DELETE SET NULL").run();
  }
  if (!existing.has("parent_path_id")) await database.prepare("ALTER TABLE learning_paths ADD COLUMN parent_path_id TEXT").run();
  if (!existing.has("revision")) await database.prepare("ALTER TABLE learning_paths ADD COLUMN revision INTEGER NOT NULL DEFAULT 1").run();
  if (!existing.has("source_revision")) await database.prepare("ALTER TABLE learning_paths ADD COLUMN source_revision TEXT NOT NULL DEFAULT ''").run();
  const stepColumns = await database.prepare("PRAGMA table_info(learning_path_steps)").all<{ name: string }>();
  const existingStepColumns = new Set(stepColumns.results.map((column) => column.name));
  if (!existingStepColumns.has("evidence_query")) await database.prepare("ALTER TABLE learning_path_steps ADD COLUMN evidence_query TEXT NOT NULL DEFAULT ''").run();
  if (!existingStepColumns.has("discovery_job_id")) await database.prepare("ALTER TABLE learning_path_steps ADD COLUMN discovery_job_id TEXT").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_paths_space_target_updated ON learning_paths(space_id, target_track_id, updated_at)").run();
}

async function ensureResearchGapDiscoveryColumns(database: D1Database) {
  const columns = await database.prepare("PRAGMA table_info(research_gap_discovery_jobs)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column) => column.name));
  if (!existing.has("purpose")) await database.prepare("ALTER TABLE research_gap_discovery_jobs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'route'").run();
  const indexColumns = await database.prepare("PRAGMA index_info(idx_research_gap_discovery_signal)").all<{ name: string }>();
  if (indexColumns.results.map((column) => column.name).join(",") !== "space_id,track_id,purpose,signal_revision") {
    await database.prepare("DROP INDEX IF EXISTS idx_research_gap_discovery_signal").run();
    await database.prepare("CREATE UNIQUE INDEX idx_research_gap_discovery_signal ON research_gap_discovery_jobs(space_id, track_id, purpose, signal_revision)").run();
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
    database.prepare("CREATE TABLE IF NOT EXISTS semantic_scholar_throttles (id TEXT PRIMARY KEY NOT NULL, scope_key TEXT NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0, next_allowed_at TEXT, last_status INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_scholar_throttles_scope ON semantic_scholar_throttles(scope_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_semantic_scholar_throttles_next ON semantic_scholar_throttles(next_allowed_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS external_source_throttles (source_key TEXT PRIMARY KEY NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0, next_allowed_at TEXT, last_status INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_expires_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_runs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'idle', last_run_at TEXT, next_run_at TEXT, new_count INTEGER NOT NULL DEFAULT 0, scanned_count INTEGER NOT NULL DEFAULT 0, discovery_round INTEGER NOT NULL DEFAULT 0, lock_token TEXT, lock_expires_at TEXT, active_job_id TEXT, lease_generation INTEGER NOT NULL DEFAULT 0, last_trigger TEXT NOT NULL DEFAULT 'visit', last_user_activity_at TEXT, scheduled_runs_since_activity INTEGER NOT NULL DEFAULT 0, automation_paused_at TEXT, automation_pause_reason TEXT NOT NULL DEFAULT '', error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_runs_space ON monitor_runs(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_scheduler_ticks (id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, due_space_count INTEGER NOT NULL DEFAULT 0, started_count INTEGER NOT NULL DEFAULT 0, advanced_count INTEGER NOT NULL DEFAULT 0, completed_count INTEGER NOT NULL DEFAULT 0, paused_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0, trigger_source TEXT NOT NULL DEFAULT 'cloudflare_cron', lease_token TEXT, lease_expires_at TEXT, recovered_job_count INTEGER NOT NULL DEFAULT 0, previous_tick_at TEXT, gap_minutes INTEGER NOT NULL DEFAULT 0, health_status TEXT NOT NULL DEFAULT 'healthy', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_scheduler_ticks_created ON monitor_scheduler_ticks(created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_discovery_pages (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, horizon TEXT NOT NULL, query_key TEXT NOT NULL, next_offset INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_discovery_space_horizon_query ON monitor_discovery_pages(space_id, horizon, query_key)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_scan_jobs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'queued', current_horizon TEXT NOT NULL DEFAULT '', current_source TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0, discovered_count INTEGER NOT NULL DEFAULT 0, new_candidate_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0, reviewed_count INTEGER NOT NULL DEFAULT 0, recommended_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0, attempt INTEGER NOT NULL DEFAULT 1, trigger_source TEXT NOT NULL DEFAULT 'manual', resume_of_job_id TEXT, checkpoint TEXT NOT NULL DEFAULT 'queued', work_queue_json TEXT NOT NULL DEFAULT '{}', first_recommendation_at TEXT, advance_lock_token TEXT, advance_lock_expires_at TEXT, request_key TEXT, failure_kind TEXT NOT NULL DEFAULT '', failure_source TEXT NOT NULL DEFAULT '', retry_count INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT, last_success_stage TEXT NOT NULL DEFAULT '', last_success_source TEXT NOT NULL DEFAULT '', error TEXT, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_scan_jobs_space_updated ON monitor_scan_jobs(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_reliability_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, scan_job_id TEXT REFERENCES monitor_scan_jobs(id) ON DELETE SET NULL, kind TEXT NOT NULL, stage TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT 'info', duration_ms INTEGER NOT NULL DEFAULT 0, error_code TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_reliability_space_created ON monitor_reliability_events(space_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_reliability_job_created ON monitor_reliability_events(scan_job_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_reliability_space_source_created ON monitor_reliability_events(space_id, source, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_reliability_kind_outcome_created ON monitor_reliability_events(kind, outcome, created_at)"),
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
    database.prepare("CREATE TABLE IF NOT EXISTS monitored_papers (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, canonical_id TEXT NOT NULL, doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', published_at TEXT, source TEXT NOT NULL DEFAULT 'crossref', horizon TEXT NOT NULL, citation_count INTEGER NOT NULL DEFAULT 0, relevance_score INTEGER NOT NULL DEFAULT 0, discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_papers_space_canonical ON monitored_papers(space_id, canonical_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitored_papers_space_discovered ON monitored_papers(space_id, discovered_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_delivery_state (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, show_count INTEGER NOT NULL DEFAULT 0, first_shown_at TEXT, last_shown_at TEXT, opened_at TEXT, snoozed_until TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_delivery_space_paper ON paper_delivery_state(space_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_delivery_space_last_shown ON paper_delivery_state(space_id, last_shown_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_engagement_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, event_key TEXT NOT NULL, kind TEXT NOT NULL, weight INTEGER NOT NULL DEFAULT 0, dwell_ms INTEGER NOT NULL DEFAULT 0, context TEXT NOT NULL DEFAULT 'today', route_id TEXT, occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_engagement_space_event ON paper_engagement_events(space_id, event_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_engagement_space_paper_time ON paper_engagement_events(space_id, paper_id, occurred_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_engagement_space_route_time ON paper_engagement_events(space_id, route_id, occurred_at)"),
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
    database.prepare("CREATE TABLE IF NOT EXISTS paper_insights (paper_id TEXT PRIMARY KEY NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, abstract_text TEXT NOT NULL DEFAULT '', summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', why_read_zh TEXT NOT NULL DEFAULT '', why_read_en TEXT NOT NULL DEFAULT '', quality_score INTEGER NOT NULL DEFAULT 0, priority_venue INTEGER NOT NULL DEFAULT 0, analysis_source TEXT NOT NULL DEFAULT 'metadata', analysis_model TEXT NOT NULL DEFAULT '', llm_recommended INTEGER NOT NULL DEFAULT 0, llm_relevance_score INTEGER NOT NULL DEFAULT 0, screening_reason TEXT NOT NULL DEFAULT '', proposed_recommendation_tier TEXT NOT NULL DEFAULT 'browse', recommendation_tier TEXT NOT NULL DEFAULT 'browse', read_minutes INTEGER NOT NULL DEFAULT 12, read_depth TEXT NOT NULL DEFAULT 'focused', problem_zh TEXT NOT NULL DEFAULT '', problem_en TEXT NOT NULL DEFAULT '', method_zh TEXT NOT NULL DEFAULT '', method_en TEXT NOT NULL DEFAULT '', contribution_zh TEXT NOT NULL DEFAULT '', contribution_en TEXT NOT NULL DEFAULT '', limitations_zh TEXT NOT NULL DEFAULT '', limitations_en TEXT NOT NULL DEFAULT '', reading_focus_zh TEXT NOT NULL DEFAULT '', reading_focus_en TEXT NOT NULL DEFAULT '', research_questions_zh TEXT NOT NULL DEFAULT '[]', research_questions_en TEXT NOT NULL DEFAULT '[]', verification_status TEXT NOT NULL DEFAULT 'not_required', verification_coverage_score INTEGER NOT NULL DEFAULT 0, verification_json TEXT NOT NULL DEFAULT '{}', verification_model TEXT NOT NULL DEFAULT '', ever_recommended INTEGER NOT NULL DEFAULT 0, first_recommended_at TEXT, last_recommended_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_insights_space_quality ON paper_insights(space_id, quality_score)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_evidence_documents (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'queued', evidence_level TEXT NOT NULL DEFAULT 'metadata', source_kind TEXT NOT NULL DEFAULT 'metadata', source_url TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '', text_hash TEXT NOT NULL DEFAULT '', extracted_chars INTEGER NOT NULL DEFAULT 0, section_count INTEGER NOT NULL DEFAULT 0, claim_count INTEGER NOT NULL DEFAULT 0, grounded_claim_count INTEGER NOT NULL DEFAULT 0, unsupported_claim_count INTEGER NOT NULL DEFAULT 0, coverage_score INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', error TEXT, lock_token TEXT, lock_expires_at TEXT, fetched_at TEXT, analyzed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_evidence_documents_space_paper ON paper_evidence_documents(space_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_evidence_documents_space_status ON paper_evidence_documents(space_id, status, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_evidence_claims (id TEXT PRIMARY KEY NOT NULL, document_id TEXT NOT NULL REFERENCES paper_evidence_documents(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, kind TEXT NOT NULL, claim_zh TEXT NOT NULL DEFAULT '', claim_en TEXT NOT NULL DEFAULT '', evidence_quote TEXT NOT NULL DEFAULT '', section_label TEXT NOT NULL DEFAULT '', locator TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0, grounded INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_evidence_claims_document_position ON paper_evidence_claims(document_id, position)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_evidence_claims_paper_kind ON paper_evidence_claims(paper_id, kind)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_evidence_audits (id TEXT PRIMARY KEY NOT NULL, document_id TEXT NOT NULL REFERENCES paper_evidence_documents(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, evidence_level TEXT NOT NULL DEFAULT 'metadata', grounding_rate INTEGER NOT NULL DEFAULT 0, locator_coverage INTEGER NOT NULL DEFAULT 0, unsupported_claims INTEGER NOT NULL DEFAULT 0, abstract_conflict_count INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_evidence_audits_document ON paper_evidence_audits(document_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_evidence_audits_space_level ON paper_evidence_audits(space_id, evidence_level, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_candidate_sources (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, source_key TEXT NOT NULL, channel TEXT NOT NULL, query_key TEXT NOT NULL, appearances INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_candidate_source_identity ON monitor_candidate_sources(paper_id, source_key, query_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_candidate_sources_space ON monitor_candidate_sources(space_id, last_seen_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_candidate_sources_route_recovery ON monitor_candidate_sources(space_id, source_key, query_key, first_seen_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS recommendation_audit_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, scan_job_id TEXT NOT NULL REFERENCES monitor_scan_jobs(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, decision TEXT NOT NULL, is_paper INTEGER NOT NULL DEFAULT 1, recommended INTEGER NOT NULL DEFAULT 0, horizon TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', relevance_score INTEGER NOT NULL DEFAULT 0, quality_score INTEGER NOT NULL DEFAULT 0, recommendation_tier TEXT NOT NULL DEFAULT 'browse', screening_reason TEXT NOT NULL DEFAULT '', provenance_json TEXT NOT NULL DEFAULT '[]', appearance_count INTEGER NOT NULL DEFAULT 1, allocated_input_tokens INTEGER NOT NULL DEFAULT 0, allocated_output_tokens INTEGER NOT NULL DEFAULT 0, verification_status TEXT NOT NULL DEFAULT 'not_required', verification_coverage_score INTEGER NOT NULL DEFAULT 0, verification_json TEXT NOT NULL DEFAULT '{}', verification_input_tokens INTEGER NOT NULL DEFAULT 0, verification_output_tokens INTEGER NOT NULL DEFAULT 0, reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_audit_job_paper ON recommendation_audit_events(scan_job_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_recommendation_audit_space_reviewed ON recommendation_audit_events(space_id, reviewed_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_recommendation_audit_space_decision_reviewed ON recommendation_audit_events(space_id, decision, reviewed_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS share_snapshots (id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, kind TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh', title TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_share_snapshots_token ON share_snapshots(token)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_share_snapshots_space_created ON share_snapshots(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_imports (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, source_kind TEXT NOT NULL, file_names TEXT NOT NULL DEFAULT '[]', content_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', safety_attested INTEGER NOT NULL DEFAULT 0, analysis_json TEXT NOT NULL, analysis_model TEXT NOT NULL DEFAULT '', input_chars INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_imports_space_hash ON research_imports(space_id, content_hash)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_imports_space_status_created ON research_imports(space_id, status, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_tracks (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, title_zh TEXT NOT NULL, title_en TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', search_queries TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0, expansion_count INTEGER NOT NULL DEFAULT 0, build_status TEXT NOT NULL DEFAULT 'ready', build_attempt_count INTEGER NOT NULL DEFAULT 0, build_source_status_json TEXT NOT NULL DEFAULT '[]', build_error TEXT, build_retry_at TEXT, user_role TEXT NOT NULL DEFAULT 'explore', monitoring_status TEXT NOT NULL DEFAULT 'active', depth_score INTEGER NOT NULL DEFAULT 0, support_score INTEGER NOT NULL DEFAULT 0, interaction_score INTEGER NOT NULL DEFAULT 0, intelligence_json TEXT NOT NULL DEFAULT '{}', intelligence_model TEXT NOT NULL DEFAULT '', intelligence_updated_at TEXT, intelligence_status TEXT NOT NULL DEFAULT 'pending', intelligence_attempt_count INTEGER NOT NULL DEFAULT 0, intelligence_error TEXT, intelligence_retry_at TEXT, intelligence_lock_token TEXT, intelligence_lock_expires_at TEXT, intelligence_refresh_requested_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_tracks_space_position ON research_tracks(space_id, position)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_map_changes (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'new_evidence', title_zh TEXT NOT NULL, title_en TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_map_changes_paper_track_kind ON research_map_changes(paper_id, track_id, kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_map_changes_space_created ON research_map_changes(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_track_edges (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, source_track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, target_track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'builds_on', relationship_zh TEXT NOT NULL DEFAULT '', relationship_en TEXT NOT NULL DEFAULT '', strength INTEGER NOT NULL DEFAULT 50, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_track_edges_pair_kind ON research_track_edges(source_track_id, target_track_id, kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_track_edges_space ON research_track_edges(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_track_papers (id TEXT PRIMARY KEY NOT NULL, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, canonical_id TEXT NOT NULL, doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', published_at TEXT, citation_count INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL, summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '', curation_status TEXT NOT NULL DEFAULT 'active', curation_reason_code TEXT, curation_reason_zh TEXT NOT NULL DEFAULT '', curation_reason_en TEXT NOT NULL DEFAULT '', curation_source TEXT NOT NULL DEFAULT '', curation_evidence_json TEXT NOT NULL DEFAULT '[]', curation_updated_at TEXT, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_track_papers_track_canonical ON research_track_papers(track_id, canonical_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_track_papers_track_position ON research_track_papers(track_id, position)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_track_paper_curation_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, track_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, action TEXT NOT NULL, reason_code TEXT NOT NULL, reason_zh TEXT NOT NULL DEFAULT '', reason_en TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', actor_kind TEXT NOT NULL DEFAULT 'system', evidence_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_curation_events_paper_created ON research_track_paper_curation_events(track_paper_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_curation_events_space_created ON research_track_paper_curation_events(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_track_paper_precision_audits (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, track_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, gate_version TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('direct', 'borderline', 'off_topic')), confidence INTEGER NOT NULL DEFAULT 0, reason_zh TEXT NOT NULL DEFAULT '', reason_en TEXT NOT NULL DEFAULT '', evidence_json TEXT NOT NULL DEFAULT '[]', model TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow', 'applied', 'superseded')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_at TEXT)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_precision_audits_paper_created ON research_track_paper_precision_audits(track_paper_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_precision_audits_space_status ON research_track_paper_precision_audits(space_id, status, created_at)"),
    ...researchMapEvidenceProposalBootstrapSql.map((statement) => database.prepare(statement)),
    ...researchRouteRevisionBootstrapSql.map((statement) => database.prepare(statement)),
    ...researchSynthesisBootstrapSql.map((statement) => database.prepare(statement)),
    ...researchProblemBootstrapSql.map((statement) => database.prepare(statement)),
    ...researchGapDiscoveryBootstrapSql.map((statement) => database.prepare(statement)),
    database.prepare("CREATE TABLE IF NOT EXISTS research_paper_edges (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, source_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, target_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, kind TEXT NOT NULL, relation_kind TEXT NOT NULL DEFAULT 'related', relationship_zh TEXT NOT NULL DEFAULT '', relationship_en TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0, evidence_source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_paper_edges_pair_kind_relation ON research_paper_edges(source_paper_id, target_paper_id, kind, relation_kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_paper_edges_space_kind ON research_paper_edges(space_id, kind)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_paper_network_states (space_id TEXT PRIMARY KEY NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'idle', built_paper_count INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', sources_json TEXT NOT NULL DEFAULT '[]', error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_paper_network_states_status ON research_paper_network_states(status, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_network_candidates (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, canonical_id TEXT NOT NULL, s2_paper_id TEXT, openalex_id TEXT, doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', published_at TEXT, citation_count INTEGER NOT NULL DEFAULT 0, abstract_text TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ghost', metadata_source TEXT NOT NULL DEFAULT 'semantic-scholar', score INTEGER NOT NULL DEFAULT 0, discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_network_candidates_space_canonical ON research_network_candidates(space_id, canonical_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_network_candidates_space_status_seen ON research_network_candidates(space_id, status, last_seen_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_network_candidates_space_s2 ON research_network_candidates(space_id, s2_paper_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_network_candidate_edges (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, seed_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, candidate_id TEXT NOT NULL REFERENCES research_network_candidates(id) ON DELETE CASCADE, kind TEXT NOT NULL, direction TEXT NOT NULL, is_influential INTEGER NOT NULL DEFAULT 0, intents_json TEXT NOT NULL DEFAULT '[]', contexts_json TEXT NOT NULL DEFAULT '[]', expansion_key TEXT NOT NULL DEFAULT '', seed_set_json TEXT NOT NULL DEFAULT '[]', score INTEGER NOT NULL DEFAULT 0, evidence_source TEXT NOT NULL DEFAULT 'semantic-scholar', first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_network_candidate_edges_unique ON research_network_candidate_edges(seed_paper_id, candidate_id, kind)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_network_candidate_edges_space_seed_seen ON research_network_candidate_edges(space_id, seed_paper_id, last_seen_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_network_candidate_edges_space_candidate_seen ON research_network_candidate_edges(space_id, candidate_id, last_seen_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_network_seed_expansion_states (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, seed_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, reference_offset INTEGER NOT NULL DEFAULT 0, citation_offset INTEGER NOT NULL DEFAULT 0, openalex_neighbor_offset INTEGER NOT NULL DEFAULT 0, openalex_citation_page INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'idle', error TEXT, last_expanded_at TEXT, expires_at TEXT)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_network_seed_expansion_unique ON research_network_seed_expansion_states(space_id, seed_paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_network_seed_expansion_fresh ON research_network_seed_expansion_states(space_id, expires_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_network_expansion_states (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, expansion_key TEXT NOT NULL, seed_canonical_ids TEXT NOT NULL DEFAULT '[]', recommendation_offset INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'idle', error TEXT, similarity_json TEXT NOT NULL DEFAULT '[]', similarity_status TEXT NOT NULL DEFAULT 'idle', similarity_expires_at TEXT, lock_token TEXT, lock_expires_at TEXT, last_expanded_at TEXT, expires_at TEXT)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_network_expansion_state_unique ON research_network_expansion_states(space_id, expansion_key)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_network_expansion_state_fresh ON research_network_expansion_states(space_id, expires_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS learning_paths (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, target TEXT NOT NULL, target_track_id TEXT REFERENCES research_tracks(id) ON DELETE SET NULL, parent_path_id TEXT, revision INTEGER NOT NULL DEFAULT 1, source_revision TEXT NOT NULL DEFAULT '', title_zh TEXT NOT NULL, title_en TEXT NOT NULL, rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', analysis_model TEXT NOT NULL DEFAULT '', estimated_minutes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_paths_space_updated ON learning_paths(space_id, updated_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS learning_path_steps (id TEXT PRIMARY KEY NOT NULL, path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'foundation', title_zh TEXT NOT NULL, title_en TEXT NOT NULL, goal_zh TEXT NOT NULL DEFAULT '', goal_en TEXT NOT NULL DEFAULT '', why_zh TEXT NOT NULL DEFAULT '', why_en TEXT NOT NULL DEFAULT '', read_focus_zh TEXT NOT NULL DEFAULT '', read_focus_en TEXT NOT NULL DEFAULT '', checkpoint_zh TEXT NOT NULL DEFAULT '', checkpoint_en TEXT NOT NULL DEFAULT '', estimated_minutes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', position INTEGER NOT NULL DEFAULT 0, resources_json TEXT NOT NULL DEFAULT '[]', evidence_query TEXT NOT NULL DEFAULT '', discovery_job_id TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path_position ON learning_path_steps(path_id, position)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_path_steps_space_status ON learning_path_steps(space_id, status)"),
  ]);
  await ensureResearchGapDiscoveryColumns(database);
  await ensureLearningPathColumns(database);
  await ensureEvidenceVerificationColumns(database);
  await ensurePaperInsightReviewColumns(database);
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_insights_space_recommendation_history ON paper_insights(space_id, ever_recommended, last_recommended_at)").run();
  await ensureGrowthMapColumns(database);
  await ensureResearchNetworkColumns(database);
  const researchTrackColumns = await database.prepare("PRAGMA table_info(research_tracks)").all<{ name: string }>();
  const researchTrackColumnNames = new Set(researchTrackColumns.results.map((column) => column.name));
  const researchTrackAdditions = [
    ["build_status", "ALTER TABLE research_tracks ADD COLUMN build_status TEXT NOT NULL DEFAULT 'ready'"],
    ["build_attempt_count", "ALTER TABLE research_tracks ADD COLUMN build_attempt_count INTEGER NOT NULL DEFAULT 0"],
    ["build_source_status_json", "ALTER TABLE research_tracks ADD COLUMN build_source_status_json TEXT NOT NULL DEFAULT '[]'"],
    ["build_error", "ALTER TABLE research_tracks ADD COLUMN build_error TEXT"],
    ["build_retry_at", "ALTER TABLE research_tracks ADD COLUMN build_retry_at TEXT"],
  ] as const;
  for (const [name, statement] of researchTrackAdditions) if (!researchTrackColumnNames.has(name)) await database.prepare(statement).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_research_tracks_retry_due ON research_tracks(build_status, build_retry_at, build_attempt_count, space_id)").run();
  await database.prepare(
    `UPDATE research_tracks SET intelligence_status = 'ready'
     WHERE intelligence_status = 'pending' AND intelligence_refresh_requested_at IS NULL
      AND intelligence_updated_at IS NOT NULL AND intelligence_json <> '{}'`,
  ).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_research_tracks_intelligence_due ON research_tracks(space_id, intelligence_status, intelligence_retry_at, intelligence_lock_expires_at, position)").run();
  const researchTrackPaperColumns = await database.prepare("PRAGMA table_info(research_track_papers)").all<{ name: string }>();
  const researchTrackPaperColumnNames = new Set(researchTrackPaperColumns.results.map((column) => column.name));
  const researchTrackPaperAdditions = [
    ["curation_status", "ALTER TABLE research_track_papers ADD COLUMN curation_status TEXT NOT NULL DEFAULT 'active'"],
    ["curation_reason_code", "ALTER TABLE research_track_papers ADD COLUMN curation_reason_code TEXT"],
    ["curation_reason_zh", "ALTER TABLE research_track_papers ADD COLUMN curation_reason_zh TEXT NOT NULL DEFAULT ''"],
    ["curation_reason_en", "ALTER TABLE research_track_papers ADD COLUMN curation_reason_en TEXT NOT NULL DEFAULT ''"],
    ["curation_source", "ALTER TABLE research_track_papers ADD COLUMN curation_source TEXT NOT NULL DEFAULT ''"],
    ["curation_evidence_json", "ALTER TABLE research_track_papers ADD COLUMN curation_evidence_json TEXT NOT NULL DEFAULT '[]'"],
    ["curation_updated_at", "ALTER TABLE research_track_papers ADD COLUMN curation_updated_at TEXT"],
  ] as const;
  for (const [name, statement] of researchTrackPaperAdditions) if (!researchTrackPaperColumnNames.has(name)) await database.prepare(statement).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_research_track_papers_space_curation ON research_track_papers(space_id, curation_status, track_id)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS research_track_paper_curation_events (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, track_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, action TEXT NOT NULL, reason_code TEXT NOT NULL, reason_zh TEXT NOT NULL DEFAULT '', reason_en TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', actor_kind TEXT NOT NULL DEFAULT 'system', evidence_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_curation_events_paper_created ON research_track_paper_curation_events(track_paper_id, created_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_curation_events_space_created ON research_track_paper_curation_events(space_id, created_at)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS research_track_paper_precision_audits (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, track_paper_id TEXT NOT NULL REFERENCES research_track_papers(id) ON DELETE CASCADE, gate_version TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('direct', 'borderline', 'off_topic')), confidence INTEGER NOT NULL DEFAULT 0, reason_zh TEXT NOT NULL DEFAULT '', reason_en TEXT NOT NULL DEFAULT '', evidence_json TEXT NOT NULL DEFAULT '[]', model TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow', 'applied', 'superseded')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_at TEXT)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_precision_audits_paper_created ON research_track_paper_precision_audits(track_paper_id, created_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_track_paper_precision_audits_space_status ON research_track_paper_precision_audits(space_id, status, created_at)").run();
  await database.prepare(
    `INSERT OR IGNORE INTO research_track_paper_curation_events
     (id, space_id, track_id, track_paper_id, action, reason_code, reason_zh, reason_en, source, actor_kind, evidence_json, created_at)
     SELECT 'bootstrap-selection-contradiction:' || paper.id, paper.space_id, paper.track_id, paper.id, 'deactivated',
      'selection_contradiction', '模型选择结果与其理由矛盾：理由明确表示该论文不相关或不应纳入。',
      'The model selection contradicted its rationale, which explicitly said the paper was unrelated or should not be included.',
      'system_model_selection_guard', 'system', json_array(json_object('kind', 'selection_rationale', 'zh', paper.rationale_zh, 'en', paper.rationale_en)), CURRENT_TIMESTAMP
     FROM research_track_papers paper
     WHERE paper.curation_status = 'active' AND NOT EXISTS (
      SELECT 1 FROM research_map_evidence_proposals proposal JOIN monitored_papers monitored
       ON monitored.id = proposal.paper_id AND monitored.space_id = proposal.space_id
      WHERE proposal.space_id = paper.space_id AND proposal.track_id = paper.track_id
       AND monitored.canonical_id = paper.canonical_id AND proposal.status = 'confirmed'
     ) AND (
      lower(paper.rationale_en) LIKE '%so it is rejected%'
      OR lower(paper.rationale_en) LIKE '%not selected%'
      OR lower(paper.rationale_en) LIKE '%should not be included%'
      OR (lower(paper.rationale_en) LIKE '%unrelated%' AND lower(paper.rationale_en) LIKE '%reject%')
      OR paper.rationale_zh LIKE '%不选入%' OR paper.rationale_zh LIKE '%不应纳入%'
      OR (paper.rationale_zh LIKE '%不相关%' AND paper.rationale_zh LIKE '%拒绝%')
     )`,
  ).run();
  await database.prepare(
    `UPDATE research_track_papers SET curation_status = 'deactivated', curation_reason_code = 'selection_contradiction',
     curation_reason_zh = '模型选择结果与其理由矛盾：理由明确表示该论文不相关或不应纳入。',
     curation_reason_en = 'The model selection contradicted its rationale, which explicitly said the paper was unrelated or should not be included.',
     curation_source = 'system_model_selection_guard',
     curation_evidence_json = json_array(json_object('kind', 'selection_rationale', 'zh', rationale_zh, 'en', rationale_en)),
     curation_updated_at = CURRENT_TIMESTAMP
     WHERE curation_status = 'active' AND id IN (
      SELECT track_paper_id FROM research_track_paper_curation_events WHERE id = 'bootstrap-selection-contradiction:' || research_track_papers.id
     )`,
  ).run();
  await database.prepare(
    `UPDATE research_tracks SET build_status = 'retryable', build_error = COALESCE(build_error, 'missing_visible_evidence')
     WHERE build_status IN ('ready', 'partial') AND NOT EXISTS (
      SELECT 1 FROM research_track_papers paper WHERE paper.track_id = research_tracks.id AND paper.space_id = research_tracks.space_id
       AND paper.curation_status = 'active'
     )`,
  ).run();
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
    ["work_queue_json", "ALTER TABLE monitor_scan_jobs ADD COLUMN work_queue_json TEXT NOT NULL DEFAULT '{}'"],
    ["first_recommendation_at", "ALTER TABLE monitor_scan_jobs ADD COLUMN first_recommendation_at TEXT"],
    ["advance_lock_token", "ALTER TABLE monitor_scan_jobs ADD COLUMN advance_lock_token TEXT"],
    ["advance_lock_expires_at", "ALTER TABLE monitor_scan_jobs ADD COLUMN advance_lock_expires_at TEXT"],
    ["request_key", "ALTER TABLE monitor_scan_jobs ADD COLUMN request_key TEXT"],
    ["failure_kind", "ALTER TABLE monitor_scan_jobs ADD COLUMN failure_kind TEXT NOT NULL DEFAULT ''"],
    ["failure_source", "ALTER TABLE monitor_scan_jobs ADD COLUMN failure_source TEXT NOT NULL DEFAULT ''"],
    ["retry_count", "ALTER TABLE monitor_scan_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0"],
    ["next_retry_at", "ALTER TABLE monitor_scan_jobs ADD COLUMN next_retry_at TEXT"],
    ["last_success_stage", "ALTER TABLE monitor_scan_jobs ADD COLUMN last_success_stage TEXT NOT NULL DEFAULT ''"],
    ["last_success_source", "ALTER TABLE monitor_scan_jobs ADD COLUMN last_success_source TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const [name, sql] of scanJobAdditions) if (!scanJobColumnNames.has(name)) await database.prepare(sql).run();
  await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_scan_jobs_request_key ON monitor_scan_jobs(space_id, request_key) WHERE request_key IS NOT NULL").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_scan_jobs_retry_due ON monitor_scan_jobs(status, next_retry_at, space_id)").run();
  const monitorRunColumns = await database.prepare("PRAGMA table_info(monitor_runs)").all<{ name: string }>();
  const monitorRunColumnNames = new Set(monitorRunColumns.results.map((column) => column.name));
  const monitorRunAdditions = [
    ["lock_token", "ALTER TABLE monitor_runs ADD COLUMN lock_token TEXT"],
    ["lock_expires_at", "ALTER TABLE monitor_runs ADD COLUMN lock_expires_at TEXT"],
    ["active_job_id", "ALTER TABLE monitor_runs ADD COLUMN active_job_id TEXT"],
    ["lease_generation", "ALTER TABLE monitor_runs ADD COLUMN lease_generation INTEGER NOT NULL DEFAULT 0"],
    ["last_trigger", "ALTER TABLE monitor_runs ADD COLUMN last_trigger TEXT NOT NULL DEFAULT 'visit'"],
    ["last_user_activity_at", "ALTER TABLE monitor_runs ADD COLUMN last_user_activity_at TEXT"],
    ["scheduled_runs_since_activity", "ALTER TABLE monitor_runs ADD COLUMN scheduled_runs_since_activity INTEGER NOT NULL DEFAULT 0"],
    ["automation_paused_at", "ALTER TABLE monitor_runs ADD COLUMN automation_paused_at TEXT"],
    ["automation_pause_reason", "ALTER TABLE monitor_runs ADD COLUMN automation_pause_reason TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const [name, sql] of monitorRunAdditions) if (!monitorRunColumnNames.has(name)) await database.prepare(sql).run();
  await database.prepare(
    `UPDATE monitor_runs SET active_job_id = (
       SELECT job.id FROM monitor_scan_jobs job
       WHERE job.space_id = monitor_runs.space_id AND job.status NOT IN ('ready', 'error')
       ORDER BY datetime(job.started_at) DESC, job.id DESC LIMIT 1
     )
     WHERE active_job_id IS NULL AND EXISTS (
       SELECT 1 FROM monitor_scan_jobs job
       WHERE job.space_id = monitor_runs.space_id AND job.status NOT IN ('ready', 'error')
     )`,
  ).run();
  await database.prepare(
    `UPDATE monitor_scan_jobs SET status = 'error', checkpoint = 'retry_pending',
      failure_kind = 'superseded', failure_source = 'single-flight-migration',
      error = COALESCE(error, 'superseded_by_active_job'), completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
     WHERE status NOT IN ('ready', 'error') AND EXISTS (
       SELECT 1 FROM monitor_runs run WHERE run.space_id = monitor_scan_jobs.space_id
        AND run.active_job_id IS NOT NULL AND run.active_job_id <> monitor_scan_jobs.id
     )`,
  ).run();
  const schedulerTickColumns = await database.prepare("PRAGMA table_info(monitor_scheduler_ticks)").all<{ name: string }>();
  const schedulerTickColumnNames = new Set(schedulerTickColumns.results.map((column) => column.name));
  const schedulerTickAdditions = [
    ["trigger_source", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'cloudflare_cron'"],
    ["lease_token", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN lease_token TEXT"],
    ["lease_expires_at", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN lease_expires_at TEXT"],
    ["recovered_job_count", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN recovered_job_count INTEGER NOT NULL DEFAULT 0"],
    ["previous_tick_at", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN previous_tick_at TEXT"],
    ["gap_minutes", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN gap_minutes INTEGER NOT NULL DEFAULT 0"],
    ["health_status", "ALTER TABLE monitor_scheduler_ticks ADD COLUMN health_status TEXT NOT NULL DEFAULT 'healthy'"],
  ] as const;
  for (const [name, sql] of schedulerTickAdditions) if (!schedulerTickColumnNames.has(name)) await database.prepare(sql).run();
  await database.prepare("UPDATE monitor_runs SET last_user_activity_at = COALESCE(last_user_activity_at, CASE WHEN last_trigger IN ('visit','manual') THEN updated_at ELSE COALESCE(last_run_at, updated_at) END) WHERE last_user_activity_at IS NULL").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_runs_automation_due ON monitor_runs(automation_paused_at, status, next_run_at)").run();
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
