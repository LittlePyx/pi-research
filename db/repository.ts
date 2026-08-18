import { env } from "cloudflare:workers";

export type ApiUser = {
  userId: string;
  email: string;
  displayName: string;
};

type RuntimeEnv = {
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
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
  ]);
  await database.prepare("PRAGMA optimize").run();
}
