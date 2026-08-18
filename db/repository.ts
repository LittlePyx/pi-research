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

export async function ensureSchema(database = getDatabase()) {
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS research_spaces (id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, member_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', accent TEXT NOT NULL DEFAULT 'blue', preferred_locale TEXT NOT NULL DEFAULT 'zh', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_research_spaces_owner_name ON research_spaces(owner_user_id, name)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_spaces_owner ON research_spaces(owner_user_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_threads (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, title TEXT NOT NULL, research_question TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'medium', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_threads_space ON research_threads(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_feedback (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL, feedback TEXT, saved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_feedback_space_paper ON paper_feedback(space_id, paper_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS research_conversations (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh', model TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_research_conversations_space ON research_conversations(space_id, created_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS ai_usage_daily (id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, usage_date TEXT NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_daily_scope_date ON ai_usage_daily(scope, usage_date)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_date ON ai_usage_daily(usage_date)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_runs (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'idle', last_run_at TEXT, next_run_at TEXT, new_count INTEGER NOT NULL DEFAULT 0, scanned_count INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_runs_space ON monitor_runs(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitored_papers (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, canonical_id TEXT NOT NULL, doi TEXT, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', published_at TEXT, source TEXT NOT NULL DEFAULT 'crossref', horizon TEXT NOT NULL, citation_count INTEGER NOT NULL DEFAULT 0, relevance_score INTEGER NOT NULL DEFAULT 0, discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_papers_space_canonical ON monitored_papers(space_id, canonical_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_monitored_papers_space_discovered ON monitored_papers(space_id, discovered_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_delivery_state (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, show_count INTEGER NOT NULL DEFAULT 0, first_shown_at TEXT, last_shown_at TEXT, opened_at TEXT, snoozed_until TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_delivery_space_paper ON paper_delivery_state(space_id, paper_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_delivery_space_last_shown ON paper_delivery_state(space_id, last_shown_at)"),
    database.prepare("CREATE TABLE IF NOT EXISTS monitor_preferences (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, profile_key TEXT NOT NULL, priority_venues TEXT NOT NULL DEFAULT '[]', user_modified INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_preferences_space ON monitor_preferences(space_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS paper_insights (paper_id TEXT PRIMARY KEY NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, abstract_text TEXT NOT NULL DEFAULT '', summary_zh TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', why_read_zh TEXT NOT NULL DEFAULT '', why_read_en TEXT NOT NULL DEFAULT '', quality_score INTEGER NOT NULL DEFAULT 0, priority_venue INTEGER NOT NULL DEFAULT 0, analysis_source TEXT NOT NULL DEFAULT 'metadata', analysis_model TEXT NOT NULL DEFAULT '', llm_recommended INTEGER NOT NULL DEFAULT 0, llm_relevance_score INTEGER NOT NULL DEFAULT 0, screening_reason TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_insights_space_quality ON paper_insights(space_id, quality_score)"),
    database.prepare("CREATE TABLE IF NOT EXISTS share_snapshots (id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, kind TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh', title TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_share_snapshots_token ON share_snapshots(token)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_share_snapshots_space_created ON share_snapshots(space_id, created_at)"),
  ]);
  await ensurePaperInsightReviewColumns(database);
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_paper_insights_space_recommended_quality ON paper_insights(space_id, llm_recommended, quality_score)").run();
  await database.prepare("PRAGMA optimize").run();
}
