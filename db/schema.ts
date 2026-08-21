import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    reasonCode: text("reason_code"),
    note: text("note").notNull().default(""),
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

export const semanticScholarThrottles = sqliteTable(
  "semantic_scholar_throttles",
  {
    id: text("id").primaryKey(),
    scopeKey: text("scope_key").notNull(),
    failureCount: integer("failure_count").notNull().default(0),
    nextAllowedAt: text("next_allowed_at"),
    lastStatus: integer("last_status").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_semantic_scholar_throttles_scope").on(table.scopeKey),
    index("idx_semantic_scholar_throttles_next").on(table.nextAllowedAt),
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
    discoveryRound: integer("discovery_round").notNull().default(0),
    lockToken: text("lock_token"),
    lockExpiresAt: text("lock_expires_at"),
    lastTrigger: text("last_trigger").notNull().default("visit"),
    lastUserActivityAt: text("last_user_activity_at"),
    scheduledRunsSinceActivity: integer("scheduled_runs_since_activity").notNull().default(0),
    automationPausedAt: text("automation_paused_at"),
    automationPauseReason: text("automation_pause_reason").notNull().default(""),
    error: text("error"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_runs_space").on(table.spaceId),
    index("idx_monitor_runs_automation_due").on(table.automationPausedAt, table.status, table.nextRunAt),
  ],
);

export const monitorSchedulerTicks = sqliteTable(
  "monitor_scheduler_ticks",
  {
    id: text("id").primaryKey(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    dueSpaceCount: integer("due_space_count").notNull().default(0),
    startedCount: integer("started_count").notNull().default(0),
    advancedCount: integer("advanced_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    pausedCount: integer("paused_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_monitor_scheduler_ticks_created").on(table.createdAt)],
);

export const monitorDiscoveryPages = sqliteTable(
  "monitor_discovery_pages",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    horizon: text("horizon").notNull(),
    queryKey: text("query_key").notNull(),
    nextOffset: integer("next_offset").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_discovery_space_horizon_query").on(table.spaceId, table.horizon, table.queryKey),
  ],
);

export const monitorScanJobs = sqliteTable(
  "monitor_scan_jobs",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    currentHorizon: text("current_horizon").notNull().default(""),
    currentSource: text("current_source").notNull().default(""),
    progress: integer("progress").notNull().default(0),
    discoveredCount: integer("discovered_count").notNull().default(0),
    newCandidateCount: integer("new_candidate_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    reviewedCount: integer("reviewed_count").notNull().default(0),
    recommendedCount: integer("recommended_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    attempt: integer("attempt").notNull().default(1),
    triggerSource: text("trigger_source").notNull().default("manual"),
    resumeOfJobId: text("resume_of_job_id"),
    checkpoint: text("checkpoint").notNull().default("queued"),
    workQueueJson: text("work_queue_json").notNull().default("{}"),
    firstRecommendationAt: text("first_recommendation_at"),
    error: text("error"),
    startedAt: text("started_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_monitor_scan_jobs_space_updated").on(table.spaceId, table.updatedAt)],
);

export const monitorReliabilityEvents = sqliteTable(
  "monitor_reliability_events",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    scanJobId: text("scan_job_id").references(() => monitorScanJobs.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    stage: text("stage").notNull().default(""),
    source: text("source").notNull().default(""),
    outcome: text("outcome").notNull().default("info"),
    durationMs: integer("duration_ms").notNull().default(0),
    errorCode: text("error_code").notNull().default(""),
    message: text("message").notNull().default(""),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_monitor_reliability_space_created").on(table.spaceId, table.createdAt),
    index("idx_monitor_reliability_job_created").on(table.scanJobId, table.createdAt),
    index("idx_monitor_reliability_space_source_created").on(table.spaceId, table.source, table.createdAt),
  ],
);

export const monitorDailyBriefs = sqliteTable(
  "monitor_daily_briefs",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    briefDate: text("brief_date").notNull(),
    scanJobId: text("scan_job_id"),
    status: text("status").notNull().default("pending"),
    headlineZh: text("headline_zh").notNull().default(""),
    headlineEn: text("headline_en").notNull().default(""),
    overviewZh: text("overview_zh").notNull().default(""),
    overviewEn: text("overview_en").notNull().default(""),
    signalsZh: text("signals_zh").notNull().default("[]"),
    signalsEn: text("signals_en").notNull().default("[]"),
    readingPlanZh: text("reading_plan_zh").notNull().default("[]"),
    readingPlanEn: text("reading_plan_en").notNull().default("[]"),
    watchlistZh: text("watchlist_zh").notNull().default("[]"),
    watchlistEn: text("watchlist_en").notNull().default("[]"),
    paperIds: text("paper_ids").notNull().default("[]"),
    metricsJson: text("metrics_json").notNull().default("{}"),
    model: text("model").notNull().default(""),
    error: text("error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_daily_briefs_space_date").on(table.spaceId, table.briefDate),
    index("idx_monitor_daily_briefs_space_updated").on(table.spaceId, table.updatedAt),
  ],
);

export const monitorWeeklyReviews = sqliteTable(
  "monitor_weekly_reviews",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    weekKey: text("week_key").notNull(),
    status: text("status").notNull().default("pending"),
    titleZh: text("title_zh").notNull().default(""),
    titleEn: text("title_en").notNull().default(""),
    overviewZh: text("overview_zh").notNull().default(""),
    overviewEn: text("overview_en").notNull().default(""),
    gainsZh: text("gains_zh").notNull().default("[]"),
    gainsEn: text("gains_en").notNull().default("[]"),
    gapsZh: text("gaps_zh").notNull().default("[]"),
    gapsEn: text("gaps_en").notNull().default("[]"),
    nextStepsZh: text("next_steps_zh").notNull().default("[]"),
    nextStepsEn: text("next_steps_en").notNull().default("[]"),
    sourceDays: integer("source_days").notNull().default(0),
    model: text("model").notNull().default(""),
    error: text("error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_weekly_reviews_space_week").on(table.spaceId, table.weekKey),
    index("idx_monitor_weekly_reviews_space_updated").on(table.spaceId, table.updatedAt),
  ],
);

export const researchNotifications = sqliteTable(
  "research_notifications",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    kind: text("kind").notNull(),
    priority: text("priority").notNull().default("normal"),
    titleZh: text("title_zh").notNull(),
    titleEn: text("title_en").notNull(),
    bodyZh: text("body_zh").notNull().default(""),
    bodyEn: text("body_en").notNull().default(""),
    actionView: text("action_view").notNull().default("today"),
    entityId: text("entity_id"),
    readAt: text("read_at"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_research_notifications_space_dedupe").on(table.spaceId, table.dedupeKey),
    index("idx_research_notifications_space_read_created").on(table.spaceId, table.readAt, table.createdAt),
  ],
);

export const monitorDiscoveryCoverage = sqliteTable(
  "monitor_discovery_coverage",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    horizon: text("horizon").notNull(),
    sourceKey: text("source_key").notNull(),
    channel: text("channel").notNull(),
    queryKey: text("query_key").notNull(),
    queryText: text("query_text").notNull().default(""),
    routeId: text("route_id"),
    explorationRole: text("exploration_role").notNull().default("core"),
    adaptiveScore: integer("adaptive_score").notNull().default(55),
    nextCursor: integer("next_cursor").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    candidateCount: integer("candidate_count").notNull().default(0),
    totalCandidateCount: integer("total_candidate_count").notNull().default(0),
    newCandidateCount: integer("new_candidate_count").notNull().default(0),
    zeroYieldStreak: integer("zero_yield_streak").notNull().default(0),
    branchStatus: text("branch_status").notNull().default("exploring"),
    cooldownUntil: text("cooldown_until"),
    firstScannedAt: text("first_scanned_at"),
    lastScannedAt: text("last_scanned_at"),
    lastError: text("last_error"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_coverage_scope").on(table.spaceId, table.horizon, table.sourceKey, table.queryKey),
    index("idx_monitor_coverage_space_scanned").on(table.spaceId, table.lastScannedAt),
    index("idx_monitor_coverage_space_route").on(table.spaceId, table.routeId, table.lastScannedAt),
  ],
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

export const paperDeliveryState = sqliteTable(
  "paper_delivery_state",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    showCount: integer("show_count").notNull().default(0),
    firstShownAt: text("first_shown_at"),
    lastShownAt: text("last_shown_at"),
    openedAt: text("opened_at"),
    snoozedUntil: text("snoozed_until"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_paper_delivery_space_paper").on(table.spaceId, table.paperId),
    index("idx_paper_delivery_space_last_shown").on(table.spaceId, table.lastShownAt),
  ],
);

export const paperReadingProgress = sqliteTable(
  "paper_reading_progress",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("unread"),
    note: text("note").notNull().default(""),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_paper_reading_space_paper").on(table.spaceId, table.paperId),
    index("idx_paper_reading_space_status").on(table.spaceId, table.status, table.updatedAt),
  ],
);

export const paperReadingMemories = sqliteTable(
  "paper_reading_memories",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    noteHash: text("note_hash").notNull(),
    analysisStatus: text("analysis_status").notNull().default("pending"),
    takeawayZh: text("takeaway_zh").notNull().default(""),
    takeawayEn: text("takeaway_en").notNull().default(""),
    methodsZh: text("methods_zh").notNull().default("[]"),
    methodsEn: text("methods_en").notNull().default("[]"),
    questionsZh: text("questions_zh").notNull().default("[]"),
    questionsEn: text("questions_en").notNull().default("[]"),
    connectionsZh: text("connections_zh").notNull().default("[]"),
    connectionsEn: text("connections_en").notNull().default("[]"),
    topicsZh: text("topics_zh").notNull().default("[]"),
    topicsEn: text("topics_en").notNull().default("[]"),
    trackId: text("track_id"),
    model: text("model").notNull().default(""),
    error: text("error"),
    analyzedAt: text("analyzed_at"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_reading_memories_space_paper").on(table.spaceId, table.paperId),
    index("idx_reading_memories_space_updated").on(table.spaceId, table.updatedAt),
  ],
);

export const monitorPreferences = sqliteTable(
  "monitor_preferences",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    profileKey: text("profile_key").notNull(),
    priorityVenues: text("priority_venues").notNull().default("[]"),
    trackedAuthors: text("tracked_authors").notNull().default("[]"),
    explorationMode: text("exploration_mode").notNull().default("balanced"),
    userModified: integer("user_modified", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [uniqueIndex("idx_monitor_preferences_space").on(table.spaceId)],
);

export const researchPreferenceSignals = sqliteTable(
  "research_preference_signals",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    layer: text("layer").notNull(),
    kind: text("kind").notNull(),
    labelZh: text("label_zh").notNull(),
    labelEn: text("label_en").notNull(),
    evidence: text("evidence").notNull().default(""),
    confidence: integer("confidence").notNull().default(50),
    weight: integer("weight").notNull().default(50),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    observedAt: text("observed_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_preference_signals_source").on(table.spaceId, table.sourceType, table.sourceId, table.kind, table.labelEn),
    index("idx_preference_signals_space_layer").on(table.spaceId, table.layer, table.active),
  ],
);

export const monitorQueryPlans = sqliteTable(
  "monitor_query_plans",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    planDate: text("plan_date").notNull(),
    explorationMode: text("exploration_mode").notNull(),
    queriesJson: text("queries_json").notNull().default("{}"),
    rationaleZh: text("rationale_zh").notNull().default(""),
    rationaleEn: text("rationale_en").notNull().default(""),
    model: text("model").notNull().default(""),
    error: text("error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_query_plans_space_date").on(table.spaceId, table.planDate),
    index("idx_monitor_query_plans_space_created").on(table.spaceId, table.createdAt),
  ],
);

export const researchMapChanges = sqliteTable(
  "research_map_changes",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    trackId: text("track_id").notNull().references(() => researchTracks.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("new_evidence"),
    titleZh: text("title_zh").notNull(),
    titleEn: text("title_en").notNull(),
    summaryZh: text("summary_zh").notNull().default(""),
    summaryEn: text("summary_en").notNull().default(""),
    confidence: integer("confidence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_research_map_changes_paper_track_kind").on(table.paperId, table.trackId, table.kind),
    index("idx_research_map_changes_space_created").on(table.spaceId, table.createdAt),
  ],
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
    recommendationTier: text("recommendation_tier").notNull().default("browse"),
    readMinutes: integer("read_minutes").notNull().default(12),
    readDepth: text("read_depth").notNull().default("focused"),
    problemZh: text("problem_zh").notNull().default(""),
    problemEn: text("problem_en").notNull().default(""),
    methodZh: text("method_zh").notNull().default(""),
    methodEn: text("method_en").notNull().default(""),
    contributionZh: text("contribution_zh").notNull().default(""),
    contributionEn: text("contribution_en").notNull().default(""),
    limitationsZh: text("limitations_zh").notNull().default(""),
    limitationsEn: text("limitations_en").notNull().default(""),
    readingFocusZh: text("reading_focus_zh").notNull().default(""),
    readingFocusEn: text("reading_focus_en").notNull().default(""),
    researchQuestionsZh: text("research_questions_zh").notNull().default("[]"),
    researchQuestionsEn: text("research_questions_en").notNull().default("[]"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_paper_insights_space_quality").on(table.spaceId, table.qualityScore),
    index("idx_paper_insights_space_recommended_quality").on(table.spaceId, table.llmRecommended, table.qualityScore),
  ],
);

export const monitorCandidateSources = sqliteTable(
  "monitor_candidate_sources",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    channel: text("channel").notNull(),
    queryKey: text("query_key").notNull(),
    appearances: integer("appearances").notNull().default(1),
    firstSeenAt: text("first_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    lastSeenAt: text("last_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_monitor_candidate_source_identity").on(table.paperId, table.sourceKey, table.queryKey),
    index("idx_monitor_candidate_sources_space").on(table.spaceId, table.lastSeenAt),
  ],
);

export const recommendationAuditEvents = sqliteTable(
  "recommendation_audit_events",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    scanJobId: text("scan_job_id").notNull().references(() => monitorScanJobs.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(),
    isPaper: integer("is_paper", { mode: "boolean" }).notNull().default(true),
    recommended: integer("recommended", { mode: "boolean" }).notNull().default(false),
    horizon: text("horizon").notNull(),
    model: text("model").notNull().default(""),
    relevanceScore: integer("relevance_score").notNull().default(0),
    qualityScore: integer("quality_score").notNull().default(0),
    recommendationTier: text("recommendation_tier").notNull().default("browse"),
    screeningReason: text("screening_reason").notNull().default(""),
    provenanceJson: text("provenance_json").notNull().default("[]"),
    appearanceCount: integer("appearance_count").notNull().default(1),
    allocatedInputTokens: integer("allocated_input_tokens").notNull().default(0),
    allocatedOutputTokens: integer("allocated_output_tokens").notNull().default(0),
    reviewedAt: text("reviewed_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_recommendation_audit_job_paper").on(table.scanJobId, table.paperId),
    index("idx_recommendation_audit_space_reviewed").on(table.spaceId, table.reviewedAt),
    index("idx_recommendation_audit_space_decision_reviewed").on(table.spaceId, table.decision, table.reviewedAt),
  ],
);

export const shareSnapshots = sqliteTable(
  "share_snapshots",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    locale: text("locale").notNull().default("zh"),
    title: text("title").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_share_snapshots_token").on(table.token),
    index("idx_share_snapshots_space_created").on(table.spaceId, table.createdAt),
  ],
);

export const researchImports = sqliteTable(
  "research_imports",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    fileNames: text("file_names").notNull().default("[]"),
    contentHash: text("content_hash").notNull(),
    status: text("status").notNull().default("draft"),
    safetyAttested: integer("safety_attested", { mode: "boolean" }).notNull().default(false),
    analysisJson: text("analysis_json").notNull(),
    analysisModel: text("analysis_model").notNull().default(""),
    inputChars: integer("input_chars").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    confirmedAt: text("confirmed_at"),
  },
  (table) => [
    uniqueIndex("idx_research_imports_space_hash").on(table.spaceId, table.contentHash),
    index("idx_research_imports_space_status_created").on(table.spaceId, table.status, table.createdAt),
  ],
);

export const researchTracks = sqliteTable(
  "research_tracks",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    titleZh: text("title_zh").notNull(),
    titleEn: text("title_en").notNull(),
    summaryZh: text("summary_zh").notNull().default(""),
    summaryEn: text("summary_en").notNull().default(""),
    searchQueries: text("search_queries").notNull().default("[]"),
    position: integer("position").notNull().default(0),
    expansionCount: integer("expansion_count").notNull().default(0),
    userRole: text("user_role").notNull().default("explore"),
    depthScore: integer("depth_score").notNull().default(0),
    supportScore: integer("support_score").notNull().default(0),
    interactionScore: integer("interaction_score").notNull().default(0),
    intelligenceJson: text("intelligence_json").notNull().default("{}"),
    intelligenceModel: text("intelligence_model").notNull().default(""),
    intelligenceUpdatedAt: text("intelligence_updated_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_research_tracks_space_position").on(table.spaceId, table.position)],
);

export const researchTrackEdges = sqliteTable(
  "research_track_edges",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    sourceTrackId: text("source_track_id").notNull().references(() => researchTracks.id, { onDelete: "cascade" }),
    targetTrackId: text("target_track_id").notNull().references(() => researchTracks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("builds_on"),
    relationshipZh: text("relationship_zh").notNull().default(""),
    relationshipEn: text("relationship_en").notNull().default(""),
    strength: integer("strength").notNull().default(50),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_research_track_edges_pair_kind").on(table.sourceTrackId, table.targetTrackId, table.kind),
    index("idx_research_track_edges_space").on(table.spaceId),
  ],
);

export const researchTrackPapers = sqliteTable(
  "research_track_papers",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id").notNull().references(() => researchTracks.id, { onDelete: "cascade" }),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    canonicalId: text("canonical_id").notNull(),
    doi: text("doi"),
    title: text("title").notNull(),
    authors: text("authors").notNull().default(""),
    venue: text("venue").notNull().default(""),
    url: text("url").notNull().default(""),
    publishedAt: text("published_at"),
    citationCount: integer("citation_count").notNull().default(0),
    role: text("role").notNull(),
    summaryZh: text("summary_zh").notNull().default(""),
    summaryEn: text("summary_en").notNull().default(""),
    rationaleZh: text("rationale_zh").notNull().default(""),
    rationaleEn: text("rationale_en").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_research_track_papers_track_canonical").on(table.trackId, table.canonicalId),
    index("idx_research_track_papers_track_position").on(table.trackId, table.position),
  ],
);

export const researchMapEvidenceProposals = sqliteTable(
  "research_map_evidence_proposals",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    trackId: text("track_id").notNull().references(() => researchTracks.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => monitoredPapers.id, { onDelete: "cascade" }),
    scanJobId: text("scan_job_id").references(() => monitorScanJobs.id, { onDelete: "set null" }),
    mapRole: text("map_role").notNull().default("frontier"),
    rationaleZh: text("rationale_zh").notNull().default(""),
    rationaleEn: text("rationale_en").notNull().default(""),
    confidence: integer("confidence").notNull().default(0),
    status: text("status").notNull().default("pending"),
    decidedAt: text("decided_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_research_map_evidence_proposals_identity").on(table.spaceId, table.trackId, table.paperId),
    index("idx_research_map_evidence_proposals_space_status").on(table.spaceId, table.status, table.updatedAt),
    index("idx_research_map_evidence_proposals_paper_status").on(table.paperId, table.status),
    check("research_map_evidence_proposals_status_check", sql`${table.status} in ('pending', 'confirmed', 'dismissed')`),
  ],
);

// Keep the runtime bootstrap idempotent with migration 0026. Sites can execute
// application startup before a pending migration on an existing D1 database,
// so both paths must be able to create the same table safely.
export const researchMapEvidenceProposalBootstrapSql = [
  "CREATE TABLE IF NOT EXISTS research_map_evidence_proposals (id TEXT PRIMARY KEY NOT NULL, space_id TEXT NOT NULL REFERENCES research_spaces(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES research_tracks(id) ON DELETE CASCADE, paper_id TEXT NOT NULL REFERENCES monitored_papers(id) ON DELETE CASCADE, scan_job_id TEXT REFERENCES monitor_scan_jobs(id) ON DELETE SET NULL, map_role TEXT NOT NULL DEFAULT 'frontier', rationale_zh TEXT NOT NULL DEFAULT '', rationale_en TEXT NOT NULL DEFAULT '', confidence INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')), decided_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_map_evidence_proposals_identity ON research_map_evidence_proposals(space_id, track_id, paper_id)",
  "CREATE INDEX IF NOT EXISTS idx_research_map_evidence_proposals_space_status ON research_map_evidence_proposals(space_id, status, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_research_map_evidence_proposals_paper_status ON research_map_evidence_proposals(paper_id, status)",
] as const;

export const researchPaperEdges = sqliteTable(
  "research_paper_edges",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    sourcePaperId: text("source_paper_id").notNull().references(() => researchTrackPapers.id, { onDelete: "cascade" }),
    targetPaperId: text("target_paper_id").notNull().references(() => researchTrackPapers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    relationKind: text("relation_kind").notNull().default("related"),
    relationshipZh: text("relationship_zh").notNull().default(""),
    relationshipEn: text("relationship_en").notNull().default(""),
    confidence: integer("confidence").notNull().default(0),
    evidenceSource: text("evidence_source").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    uniqueIndex("idx_research_paper_edges_pair_kind_relation").on(table.sourcePaperId, table.targetPaperId, table.kind, table.relationKind),
    index("idx_research_paper_edges_space_kind").on(table.spaceId, table.kind),
  ],
);

export const researchPaperNetworkStates = sqliteTable(
  "research_paper_network_states",
  {
    spaceId: text("space_id").primaryKey().references(() => researchSpaces.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("idle"),
    builtPaperCount: integer("built_paper_count").notNull().default(0),
    model: text("model").notNull().default(""),
    sourcesJson: text("sources_json").notNull().default("[]"),
    error: text("error"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("idx_research_paper_network_states_status").on(table.status, table.updatedAt)],
);

export const researchNetworkCandidates = sqliteTable(
  "research_network_candidates",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    canonicalId: text("canonical_id").notNull(),
    s2PaperId: text("s2_paper_id"),
    openalexId: text("openalex_id"),
    doi: text("doi"),
    title: text("title").notNull(),
    authors: text("authors").notNull().default(""),
    venue: text("venue").notNull().default(""),
    url: text("url").notNull().default(""),
    publishedAt: text("published_at"),
    citationCount: integer("citation_count").notNull().default(0),
    abstractText: text("abstract_text").notNull().default(""),
    status: text("status").notNull().default("ghost"),
    metadataSource: text("metadata_source").notNull().default("semantic-scholar"),
    score: integer("score").notNull().default(0),
    discoveredAt: text("discovered_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    lastSeenAt: text("last_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("idx_research_network_candidates_space_canonical").on(table.spaceId, table.canonicalId),
    index("idx_research_network_candidates_space_status_seen").on(table.spaceId, table.status, table.lastSeenAt),
    index("idx_research_network_candidates_space_s2").on(table.spaceId, table.s2PaperId),
  ],
);

export const researchNetworkCandidateEdges = sqliteTable(
  "research_network_candidate_edges",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    seedPaperId: text("seed_paper_id").notNull().references(() => researchTrackPapers.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id").notNull().references(() => researchNetworkCandidates.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    direction: text("direction").notNull(),
    isInfluential: integer("is_influential", { mode: "boolean" }).notNull().default(false),
    intentsJson: text("intents_json").notNull().default("[]"),
    contextsJson: text("contexts_json").notNull().default("[]"),
    expansionKey: text("expansion_key").notNull().default(""),
    seedSetJson: text("seed_set_json").notNull().default("[]"),
    score: integer("score").notNull().default(0),
    evidenceSource: text("evidence_source").notNull().default("semantic-scholar"),
    firstSeenAt: text("first_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    lastSeenAt: text("last_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("idx_research_network_candidate_edges_unique").on(table.seedPaperId, table.candidateId, table.kind),
    index("idx_research_network_candidate_edges_space_seed_seen").on(table.spaceId, table.seedPaperId, table.lastSeenAt),
    index("idx_research_network_candidate_edges_space_candidate_seen").on(table.spaceId, table.candidateId, table.lastSeenAt),
  ],
);

export const researchNetworkSeedExpansionStates = sqliteTable(
  "research_network_seed_expansion_states",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    seedPaperId: text("seed_paper_id").notNull().references(() => researchTrackPapers.id, { onDelete: "cascade" }),
    referenceOffset: integer("reference_offset").notNull().default(0),
    citationOffset: integer("citation_offset").notNull().default(0),
    openAlexNeighborOffset: integer("openalex_neighbor_offset").notNull().default(0),
    openAlexCitationPage: integer("openalex_citation_page").notNull().default(1),
    status: text("status").notNull().default("idle"),
    error: text("error"),
    lastExpandedAt: text("last_expanded_at"),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("idx_research_network_seed_expansion_unique").on(table.spaceId, table.seedPaperId),
    index("idx_research_network_seed_expansion_fresh").on(table.spaceId, table.expiresAt),
  ],
);

export const researchNetworkExpansionStates = sqliteTable(
  "research_network_expansion_states",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    expansionKey: text("expansion_key").notNull(),
    seedCanonicalIds: text("seed_canonical_ids").notNull().default("[]"),
    recommendationOffset: integer("recommendation_offset").notNull().default(0),
    status: text("status").notNull().default("idle"),
    error: text("error"),
    similarityJson: text("similarity_json").notNull().default("[]"),
    similarityStatus: text("similarity_status").notNull().default("idle"),
    similarityExpiresAt: text("similarity_expires_at"),
    lockToken: text("lock_token"),
    lockExpiresAt: text("lock_expires_at"),
    lastExpandedAt: text("last_expanded_at"),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("idx_research_network_expansion_state_unique").on(table.spaceId, table.expansionKey),
    index("idx_research_network_expansion_state_fresh").on(table.spaceId, table.expiresAt),
  ],
);

export const learningPaths = sqliteTable(
  "learning_paths",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    targetTrackId: text("target_track_id").references(() => researchTracks.id, { onDelete: "set null" }),
    titleZh: text("title_zh").notNull(),
    titleEn: text("title_en").notNull(),
    rationaleZh: text("rationale_zh").notNull().default(""),
    rationaleEn: text("rationale_en").notNull().default(""),
    status: text("status").notNull().default("draft"),
    analysisModel: text("analysis_model").notNull().default(""),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_learning_paths_space_updated").on(table.spaceId, table.updatedAt),
    index("idx_learning_paths_space_target_updated").on(table.spaceId, table.targetTrackId, table.updatedAt),
  ],
);

export const learningPathSteps = sqliteTable(
  "learning_path_steps",
  {
    id: text("id").primaryKey(),
    pathId: text("path_id").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
    spaceId: text("space_id").notNull().references(() => researchSpaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("foundation"),
    titleZh: text("title_zh").notNull(),
    titleEn: text("title_en").notNull(),
    goalZh: text("goal_zh").notNull().default(""),
    goalEn: text("goal_en").notNull().default(""),
    whyZh: text("why_zh").notNull().default(""),
    whyEn: text("why_en").notNull().default(""),
    readFocusZh: text("read_focus_zh").notNull().default(""),
    readFocusEn: text("read_focus_en").notNull().default(""),
    checkpointZh: text("checkpoint_zh").notNull().default(""),
    checkpointEn: text("checkpoint_en").notNull().default(""),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    status: text("status").notNull().default("pending"),
    position: integer("position").notNull().default(0),
    resourcesJson: text("resources_json").notNull().default("[]"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [
    index("idx_learning_path_steps_path_position").on(table.pathId, table.position),
    index("idx_learning_path_steps_space_status").on(table.spaceId, table.status),
  ],
);
