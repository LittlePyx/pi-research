import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const researchSpaces = sqliteTable(
  "research_spaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    memberName: text("member_name").notNull(),
    description: text("description").notNull().default(""),
    accent: text("accent").notNull().default("blue"),
    preferredLocale: text("preferred_locale").notNull().default("zh"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_research_spaces_owner").on(table.ownerUserId),
    uniqueIndex("idx_research_spaces_owner_name").on(table.ownerUserId, table.name),
  ],
);

export const researchThreads = sqliteTable(
  "research_threads",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    researchQuestion: text("research_question").notNull().default(""),
    status: text("status").notNull().default("active"),
    priority: text("priority").notNull().default("medium"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_research_threads_space").on(table.spaceId)],
);

export const paperFeedback = sqliteTable(
  "paper_feedback",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull(),
    feedback: text("feedback"),
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_paper_feedback_space_paper").on(table.spaceId, table.paperId),
  ],
);

export const researchConversations = sqliteTable(
  "research_conversations",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    locale: text("locale").notNull().default("zh"),
    model: text("model"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_research_conversations_space").on(table.spaceId, table.createdAt)],
);

export const aiUsageDaily = sqliteTable(
  "ai_usage_daily",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    usageDate: text("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_ai_usage_daily_scope_date").on(table.scope, table.usageDate),
    index("idx_ai_usage_daily_date").on(table.usageDate),
  ],
);

export const monitorRuns = sqliteTable(
  "monitor_runs",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("idle"),
    lastRunAt: text("last_run_at"),
    nextRunAt: text("next_run_at"),
    newCount: integer("new_count").notNull().default(0),
    scannedCount: integer("scanned_count").notNull().default(0),
    error: text("error"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [uniqueIndex("idx_monitor_runs_space").on(table.spaceId)],
);

export const monitoredPapers = sqliteTable(
  "monitored_papers",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    canonicalId: text("canonical_id").notNull(),
    doi: text("doi"),
    title: text("title").notNull(),
    authors: text("authors").notNull().default(""),
    venue: text("venue").notNull().default(""),
    url: text("url").notNull().default(""),
    publishedAt: text("published_at"),
    source: text("source").notNull().default("crossref"),
    horizon: text("horizon").notNull(),
    citationCount: integer("citation_count").notNull().default(0),
    relevanceScore: integer("relevance_score").notNull().default(0),
    discoveredAt: text("discovered_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    lastSeenAt: text("last_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitored_papers_space_canonical").on(table.spaceId, table.canonicalId),
    index("idx_monitored_papers_space_discovered").on(table.spaceId, table.discoveredAt),
  ],
);

export const monitorPreferences = sqliteTable(
  "monitor_preferences",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    profileKey: text("profile_key").notNull(),
    priorityVenues: text("priority_venues").notNull().default("[]"),
    userModified: integer("user_modified", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [uniqueIndex("idx_monitor_preferences_space").on(table.spaceId)],
);

export const paperInsights = sqliteTable(
  "paper_insights",
  {
    paperId: text("paper_id").primaryKey().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    abstractText: text("abstract_text").notNull().default(""),
    summaryZh: text("summary_zh").notNull().default(""),
    summaryEn: text("summary_en").notNull().default(""),
    whyReadZh: text("why_read_zh").notNull().default(""),
    whyReadEn: text("why_read_en").notNull().default(""),
    qualityScore: integer("quality_score").notNull().default(0),
    priorityVenue: integer("priority_venue", { mode: "boolean" }).notNull().default(false),
    analysisSource: text("analysis_source").notNull().default("metadata"),
    analysisModel: text("analysis_model").notNull().default(""),
    llmRecommended: integer("llm_recommended", { mode: "boolean" }).notNull().default(false),
    llmRelevanceScore: integer("llm_relevance_score").notNull().default(0),
    screeningReason: text("screening_reason").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_paper_insights_space_quality").on(table.spaceId, table.qualityScore),
    index("idx_paper_insights_space_recommended_quality").on(table.spaceId, table.llmRecommended, table.qualityScore),
  ],
);
