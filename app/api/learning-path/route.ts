import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import type { LearningPath, LearningPathState, LearningReadingStatus, LearningResource, LearningResourceSource, LearningStepKind, LearningStepStatus } from "../../../lib/learning-path";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";

type SpaceRow = { id: string; name: string; description: string; owner_user_id: string };
type PathRow = {
  id: string; target: string; target_track_id: string | null; title_zh: string; title_en: string; rationale_zh: string; rationale_en: string;
  status: LearningPath["status"]; analysis_model: string; estimated_minutes: number; created_at: string; updated_at: string;
};
type StepRow = {
  id: string; kind: LearningStepKind; title_zh: string; title_en: string; goal_zh: string; goal_en: string;
  why_zh: string; why_en: string; read_focus_zh: string; read_focus_en: string; checkpoint_zh: string; checkpoint_en: string;
  estimated_minutes: number; status: LearningStepStatus; position: number; resources_json: string; completed_at: string | null;
};
type CandidateRow = {
  resource_id: string; canonical_id: string; source: LearningResourceSource; title: string; authors: string; venue: string; url: string; published_at: string | null;
  track_id: string | null; track_title: string; track_role: string; paper_role: string; citation_count: number;
  summary_zh: string; summary_en: string; rationale_zh: string; rationale_en: string;
  reading_focus_zh: string; reading_focus_en: string; quality_score: number | null; read_minutes: number | null; reading_status: LearningReadingStatus;
  selection_role: "target-direction" | "cross-direction-bridge" | "all-space" | "daily-scan-bridge";
};
type TrackContext = { id: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string; user_role: string; depth_score: number; support_score: number };
type DraftStep = {
  kind: LearningStepKind; titleZh: string; titleEn: string; goalZh: string; goalEn: string; whyZh: string; whyEn: string;
  readFocusZh: string; readFocusEn: string; checkpointZh: string; checkpointEn: string; estimatedMinutes: number; resourceIds: string[];
};
type DraftPath = { titleZh: string; titleEn: string; rationaleZh: string; rationaleEn: string; steps: DraftStep[] };
type DeepSeekResponse = { choices?: Array<{ message?: { content?: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };

const MODEL = "deepseek-v4-pro";
const STEP_KINDS = new Set<LearningStepKind>(["prerequisite", "foundation", "method", "frontier", "project"]);
const GLOBAL_DAILY_LIMIT = 120;
const WORKSPACE_DAILY_LIMIT = 8;
const TARGET_DIRECTION_RESOURCE_LIMIT = 36;
const CROSS_DIRECTION_RESOURCE_LIMIT = 12;
const TARGET_DAILY_BRIDGE_LIMIT = 12;
const ALL_SPACE_ROUTE_LIMIT = 70;
const ALL_SPACE_DAILY_LIMIT = 40;
const READING_STATUSES = new Set<LearningReadingStatus>(["unread", "queued", "reading", "read", "mastered", "cited"]);
const LEARNING_PATH_GENERATION_ROUTE_SIGNAL_SQL = "UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + 3), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?";
const LEARNING_PATH_STAGE_ROUTE_SIGNAL_SQL = `UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + 2), updated_at = CURRENT_TIMESTAMP
 WHERE id = ? AND space_id = ? AND EXISTS (
  SELECT 1 FROM learning_path_steps s JOIN learning_paths p ON p.id = s.path_id
  WHERE s.id = ? AND s.path_id = ? AND s.space_id = ? AND p.space_id = s.space_id
   AND p.status != 'superseded' AND p.target_track_id = research_tracks.id AND s.completed_at IS NULL
 )`;

function cleanText(value: unknown, max = 900) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function boundedMinutes(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(20, Math.min(360, Math.round(numeric))) : 60;
}

function readingStatus(value: unknown): LearningReadingStatus {
  return READING_STATUSES.has(value as LearningReadingStatus) ? value as LearningReadingStatus : "unread";
}

function targetDirectionResourceCoverage(
  candidates: Array<Pick<CandidateRow, "resource_id" | "track_id" | "selection_role">>,
  targetTrackId: string | null,
  usedResourceIds: Iterable<string>,
) {
  if (!targetTrackId) return { available: 0, required: 0, used: 0, valid: true };
  const targetResourceIds = new Set(candidates
    .filter((candidate) => candidate.selection_role === "target-direction" && candidate.track_id === targetTrackId)
    .map((candidate) => candidate.resource_id));
  const required = Math.min(2, targetResourceIds.size);
  const used = Array.from(new Set(usedResourceIds)).filter((resourceId) => targetResourceIds.has(resourceId)).length;
  return { available: targetResourceIds.size, required, used, valid: required > 0 && used >= required };
}

class TargetDirectionCoverageError extends Error {}

function parseResources(value: string): LearningResource[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string")).map((item) => ({
      id: String(item.id),
      ...(typeof item.canonicalId === "string" && item.canonicalId ? { canonicalId: item.canonicalId } : {}),
      title: String(item.title),
      authors: typeof item.authors === "string" ? item.authors : "",
      venue: typeof item.venue === "string" ? item.venue : "",
      url: typeof item.url === "string" ? item.url : "",
      publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
      trackId: typeof item.trackId === "string" ? item.trackId : null,
      ...(item.source === "research-map" || item.source === "daily-scan" || item.source === "research-map+daily-scan" ? { source: item.source } : {}),
      ...(typeof item.qualityScore === "number" && Number.isFinite(item.qualityScore) ? { qualityScore: item.qualityScore } : item.qualityScore === null ? { qualityScore: null } : {}),
      ...(typeof item.readingStatus === "string" ? { readingStatus: readingStatus(item.readingStatus) } : {}),
      ...(typeof item.suggestedMinutes === "number" && Number.isFinite(item.suggestedMinutes) ? { suggestedMinutes: item.suggestedMinutes } : item.suggestedMinutes === null ? { suggestedMinutes: null } : {}),
    }));
  } catch {
    return [];
  }
}

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name, description, owner_user_id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database, space, user };
}

async function readPath(database: D1Database, spaceId: string): Promise<LearningPath | null> {
  const path = await database.prepare("SELECT id, target, target_track_id, title_zh, title_en, rationale_zh, rationale_en, status, analysis_model, estimated_minutes, created_at, updated_at FROM learning_paths WHERE space_id = ? AND status != 'superseded' ORDER BY updated_at DESC LIMIT 1")
    .bind(spaceId).first<PathRow>();
  if (!path) return null;
  const steps = await database.prepare("SELECT id, kind, title_zh, title_en, goal_zh, goal_en, why_zh, why_en, read_focus_zh, read_focus_en, checkpoint_zh, checkpoint_en, estimated_minutes, status, position, resources_json, completed_at FROM learning_path_steps WHERE path_id = ? ORDER BY position")
    .bind(path.id).all<StepRow>();
  return {
    id: path.id,
    target: path.target,
    targetTrackId: path.target_track_id,
    titleZh: path.title_zh,
    titleEn: path.title_en,
    rationaleZh: path.rationale_zh,
    rationaleEn: path.rationale_en,
    status: path.status,
    model: path.analysis_model,
    estimatedMinutes: path.estimated_minutes,
    completedSteps: steps.results.filter((step) => step.status === "completed").length,
    createdAt: path.created_at,
    updatedAt: path.updated_at,
    steps: steps.results.map((step) => ({
      id: step.id,
      kind: step.kind,
      titleZh: step.title_zh,
      titleEn: step.title_en,
      goalZh: step.goal_zh,
      goalEn: step.goal_en,
      whyZh: step.why_zh,
      whyEn: step.why_en,
      readFocusZh: step.read_focus_zh,
      readFocusEn: step.read_focus_en,
      checkpointZh: step.checkpoint_zh,
      checkpointEn: step.checkpoint_en,
      estimatedMinutes: step.estimated_minutes,
      status: step.status,
      position: step.position,
      resources: parseResources(step.resources_json),
      completedAt: step.completed_at,
    })),
  };
}

async function contextForSpace(database: D1Database, space: SpaceRow, targetTrackId: string | null = null) {
  const routePaperSelect = "SELECT 'track:' || p.id AS resource_id, p.canonical_id, 'research-map' AS source, p.title, p.authors, p.venue, p.url, p.published_at, p.track_id, COALESCE(NULLIF(t.title_en, ''), t.title_zh) AS track_title, t.user_role AS track_role, p.role AS paper_role, p.citation_count, p.summary_zh, p.summary_en, p.rationale_zh, p.rationale_en, '' AS reading_focus_zh, '' AS reading_focus_en, NULL AS quality_score, NULL AS read_minutes, COALESCE((SELECT r.status FROM monitored_papers mp JOIN paper_reading_progress r ON r.paper_id = mp.id AND r.space_id = mp.space_id WHERE mp.space_id = p.space_id AND ((p.doi IS NOT NULL AND p.doi != '' AND lower(mp.doi) = lower(p.doi)) OR lower(trim(mp.title)) = lower(trim(p.title))) LIMIT 1), 'unread') AS reading_status";
  const routePaperOrder = " ORDER BY CASE p.role WHEN 'foundation' THEN 0 WHEN 'milestone' THEN 1 ELSE 2 END, p.citation_count DESC";
  const targetPaperQuery = targetTrackId
    ? database.prepare(`${routePaperSelect}, 'target-direction' AS selection_role FROM research_track_papers p JOIN research_tracks t ON t.id = p.track_id WHERE p.space_id = ? AND p.track_id = ?${routePaperOrder} LIMIT ${TARGET_DIRECTION_RESOURCE_LIMIT}`).bind(space.id, targetTrackId).all<CandidateRow>()
    : database.prepare(`${routePaperSelect}, 'all-space' AS selection_role FROM research_track_papers p JOIN research_tracks t ON t.id = p.track_id WHERE p.space_id = ? ORDER BY CASE t.user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END, CASE p.role WHEN 'foundation' THEN 0 WHEN 'milestone' THEN 1 ELSE 2 END, p.citation_count DESC LIMIT ${ALL_SPACE_ROUTE_LIMIT}`).bind(space.id).all<CandidateRow>();
  const crossDirectionQuery = targetTrackId
    ? database.prepare(`${routePaperSelect}, 'cross-direction-bridge' AS selection_role FROM research_track_papers p JOIN research_tracks t ON t.id = p.track_id WHERE p.space_id = ? AND p.track_id != ? ORDER BY CASE t.user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END, p.citation_count DESC LIMIT ${CROSS_DIRECTION_RESOURCE_LIMIT}`).bind(space.id, targetTrackId).all<CandidateRow>()
    : Promise.resolve({ results: [] as CandidateRow[] });
  const dailyLimit = targetTrackId ? TARGET_DAILY_BRIDGE_LIMIT : ALL_SPACE_DAILY_LIMIT;
  const tracksQuery = targetTrackId
    ? database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, user_role, depth_score + interaction_score AS depth_score, support_score FROM research_tracks WHERE space_id = ? ORDER BY CASE WHEN id = ? THEN 0 WHEN user_role = 'core' THEN 1 WHEN user_role = 'support' THEN 2 ELSE 3 END, position LIMIT 64").bind(space.id, targetTrackId).all<TrackContext>()
    : database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, user_role, depth_score + interaction_score AS depth_score, support_score FROM research_tracks WHERE space_id = ? ORDER BY CASE user_role WHEN 'core' THEN 0 WHEN 'support' THEN 1 ELSE 2 END, position LIMIT 64").bind(space.id).all<TrackContext>();
  const [tracks, targetPapers, crossDirectionPapers, monitored, imports] = await Promise.all([
    tracksQuery,
    targetPaperQuery,
    crossDirectionQuery,
    database.prepare(`SELECT 'monitor:' || p.id AS resource_id, p.canonical_id, 'daily-scan' AS source, p.title, p.authors, p.venue, p.url, p.published_at, NULL AS track_id, '' AS track_title, 'explore' AS track_role, CASE p.horizon WHEN 'years' THEN 'foundation' ELSE 'frontier' END AS paper_role, p.citation_count, i.summary_zh, i.summary_en, i.why_read_zh AS rationale_zh, i.why_read_en AS rationale_en, i.reading_focus_zh, i.reading_focus_en, i.quality_score, i.read_minutes, COALESCE(r.status, 'unread') AS reading_status, '${targetTrackId ? "daily-scan-bridge" : "all-space"}' AS selection_role FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id WHERE p.space_id = ? AND i.llm_recommended = 1 AND i.analysis_source = 'deepseek' ORDER BY i.quality_score DESC, p.citation_count DESC LIMIT ${dailyLimit}`)
      .bind(space.id).all<CandidateRow>(),
    database.prepare("SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 5")
      .bind(space.id).all<{ analysis_json: string }>(),
  ]);
  const candidateMap = new Map<string, CandidateRow>();
  const candidateKeyByTitle = new Map<string, string>();
  const readingRanks: Record<LearningReadingStatus, number> = { unread: 0, queued: 1, reading: 2, read: 3, mastered: 4, cited: 5 };
  const richer = (left: string, right: string) => right.trim().length > left.trim().length ? right : left;
  for (const rawItem of [...targetPapers.results, ...crossDirectionPapers.results, ...monitored.results]) {
    if (!rawItem.url) continue;
    const item = { ...rawItem, reading_status: readingStatus(rawItem.reading_status) };
    const normalizedTitle = item.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const canonicalKey = item.canonical_id.trim().toLocaleLowerCase();
    const fingerprint = canonicalKey || normalizedTitle;
    if (!fingerprint) continue;
    const existingKey = candidateMap.has(fingerprint) ? fingerprint : candidateKeyByTitle.get(normalizedTitle);
    const existing = existingKey ? candidateMap.get(existingKey) : undefined;
    if (!existing) {
      candidateMap.set(fingerprint, item);
      if (normalizedTitle) candidateKeyByTitle.set(normalizedTitle, fingerprint);
      continue;
    }
    const combinedSource: LearningResourceSource = existing.source === item.source ? existing.source : "research-map+daily-scan";
    candidateMap.set(existingKey!, {
      ...existing,
      source: combinedSource,
      summary_zh: richer(existing.summary_zh, item.summary_zh),
      summary_en: richer(existing.summary_en, item.summary_en),
      rationale_zh: richer(existing.rationale_zh, item.rationale_zh),
      rationale_en: richer(existing.rationale_en, item.rationale_en),
      reading_focus_zh: richer(existing.reading_focus_zh, item.reading_focus_zh),
      reading_focus_en: richer(existing.reading_focus_en, item.reading_focus_en),
      quality_score: Math.max(existing.quality_score ?? 0, item.quality_score ?? 0) || null,
      read_minutes: existing.read_minutes || item.read_minutes,
      reading_status: readingRanks[item.reading_status] > readingRanks[existing.reading_status] ? item.reading_status : existing.reading_status,
    });
    if (normalizedTitle) candidateKeyByTitle.set(normalizedTitle, existingKey!);
  }
  const memory = imports.results.map((row) => {
    try {
      const value = JSON.parse(row.analysis_json) as Record<string, unknown>;
      return JSON.stringify({ summaryZh: value.summaryZh, summaryEn: value.summaryEn, knowledge: value.knowledge, openQuestions: value.openQuestions, interests: value.interests, exclusions: value.exclusions });
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n").slice(0, 7000);
  const targetTrack = targetTrackId ? tracks.results.find((track) => track.id === targetTrackId) || null : null;
  const suggestedTarget = cleanText(targetTrack?.title_zh || tracks.results.find((track) => track.user_role === "core")?.title_zh || tracks.results[0]?.title_zh || space.description || space.name, 160);
  const actionableCandidates = Array.from(candidateMap.values())
    .filter((candidate) => candidate.reading_status !== "mastered" && candidate.reading_status !== "cited");
  return {
    tracks: tracks.results,
    candidates: actionableCandidates,
    memory,
    suggestedTarget,
    targetTrack,
    candidatePolicy: targetTrackId ? {
      targetDirectionLimit: TARGET_DIRECTION_RESOURCE_LIMIT,
      crossDirectionBridgeLimit: CROSS_DIRECTION_RESOURCE_LIMIT,
      dailyScanBridgeLimit: TARGET_DAILY_BRIDGE_LIMIT,
    } : null,
  };
}

async function usageCount(database: D1Database, scope: string, date: string) {
  const row = await database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1").bind(scope, date).first<{ request_count: number }>();
  return row?.request_count || 0;
}

async function recordUsage(database: D1Database, scope: string, date: string, inputTokens: number, outputTokens: number) {
  await database.prepare("INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens, updated_at = CURRENT_TIMESTAMP")
    .bind(crypto.randomUUID(), scope, date, inputTokens, outputTokens).run();
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

async function buildDraft(database: D1Database, workspaceId: string, space: SpaceRow, target: string, context: Awaited<ReturnType<typeof contextForSpace>>, apiKey: string) {
  if (!apiKey) throw new Error("DeepSeek Pro is not configured");
  const date = new Date().toISOString().slice(0, 10);
  const workspaceScope = "learning-path-workspace:" + workspaceId;
  const [globalCount, workspaceCount] = await Promise.all([usageCount(database, "learning-path:global", date), usageCount(database, workspaceScope, date)]);
  if (globalCount >= GLOBAL_DAILY_LIMIT || workspaceCount >= WORKSPACE_DAILY_LIMIT) throw new Error("Learning-path analysis budget reached for today");
  const sources = context.candidates.map((item) => ({
    id: item.resource_id, canonicalId: item.canonical_id, source: item.source, selectionRole: item.selection_role, title: item.title, authors: item.authors, venue: item.venue, publishedAt: item.published_at,
    citations: item.citation_count, direction: item.track_title, directionRole: item.track_role, routeRole: item.paper_role,
    summaryZh: cleanText(item.summary_zh, 420), summaryEn: cleanText(item.summary_en, 420), routeRationaleZh: cleanText(item.rationale_zh, 320), routeRationaleEn: cleanText(item.rationale_en, 320),
    existingReadingFocusZh: cleanText(item.reading_focus_zh, 260), existingReadingFocusEn: cleanText(item.reading_focus_en, 260),
    qualityScore: item.quality_score, suggestedMinutes: item.read_minutes, readingStatus: item.reading_status,
  }));
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are Pi Research's curriculum architect. Build a compact, rigorous, personalized bilingual research learning path. Use only the supplied real paper IDs; never invent a paper, author, venue, URL, section number, or citation. Infer what the user already knows from memory and direction depth, skip redundant basics, and order the shortest coherent route from prerequisites to independent research. Return JSON only." },
        { role: "user", content: JSON.stringify({
          task: "Create 4-7 ordered stages. Every stage must cite 1-3 supplied resource IDs, and each resource may appear in only one stage. Papers inside one stage are parallel resources, not a hidden order. When targetDirection is present, make its target-direction papers the backbone and use only a small number of cross-direction-bridge or daily-scan-bridge papers when they close a prerequisite or method gap. Use prerequisite only if evidence shows a genuine gap. Treat read/mastered/cited papers as prior knowledge or optional references instead of repeating them as core work. Prefer quality-reviewed or route-grounded evidence. Include a concrete checkpoint that lets the user verify mastery. readFocus must describe concepts, figures, proofs, experiments, or questions to inspect without inventing section numbers.",
          outputSchema: { titleZh: "string", titleEn: "string", rationaleZh: "string", rationaleEn: "string", steps: [{ kind: "prerequisite|foundation|method|frontier|project", titleZh: "string", titleEn: "string", goalZh: "string", goalEn: "string", whyZh: "string", whyEn: "string", readFocusZh: "string", readFocusEn: "string", checkpointZh: "string", checkpointEn: "string", estimatedMinutes: 90, resourceIds: ["exact supplied id"] }] },
          target, targetDirection: context.targetTrack, candidatePolicy: context.candidatePolicy, space: { name: space.name, description: space.description }, researchDirections: context.tracks, confirmedResearchMemory: context.memory || "No confirmed import", realPaperPool: sources,
        }) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "enabled" },
      max_tokens: 16000,
    }),
  });
  const body = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(body.error?.message || "DeepSeek Pro could not build the learning path");
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek Pro returned an empty learning path");
  const parsed = extractJson(content) as Partial<DraftPath>;
  const allowedIds = new Set(context.candidates.map((item) => item.resource_id));
  const usedResourceIds = new Set<string>();
  const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).slice(0, 7).flatMap((step) => {
    const cleaned = {
      kind: STEP_KINDS.has(step.kind) ? step.kind : "foundation" as LearningStepKind,
      titleZh: cleanText(step.titleZh, 180), titleEn: cleanText(step.titleEn, 180), goalZh: cleanText(step.goalZh), goalEn: cleanText(step.goalEn),
      whyZh: cleanText(step.whyZh), whyEn: cleanText(step.whyEn), readFocusZh: cleanText(step.readFocusZh), readFocusEn: cleanText(step.readFocusEn),
      checkpointZh: cleanText(step.checkpointZh), checkpointEn: cleanText(step.checkpointEn), estimatedMinutes: boundedMinutes(step.estimatedMinutes),
    };
    if (!cleaned.titleZh || !cleaned.titleEn || !cleaned.whyZh || !cleaned.whyEn || !cleaned.readFocusZh || !cleaned.readFocusEn || !cleaned.checkpointZh || !cleaned.checkpointEn) return [];
    const resourceIds = Array.isArray(step.resourceIds) ? Array.from(new Set(step.resourceIds.filter((id) => typeof id === "string" && allowedIds.has(id) && !usedResourceIds.has(id)))).slice(0, 3) : [];
    if (!resourceIds.length) return [];
    for (const id of resourceIds) usedResourceIds.add(id);
    return [{ ...cleaned, resourceIds }];
  });
  if (steps.length < 3 || usedResourceIds.size < 3) throw new Error("Not enough unique grounded resources were produced from the real paper pool");
  const targetCoverage = targetDirectionResourceCoverage(context.candidates, context.targetTrack?.id || null, usedResourceIds);
  if (!targetCoverage.valid) {
    throw new TargetDirectionCoverageError(
      `The generated path used ${targetCoverage.used} of ${targetCoverage.required} required real papers from the target direction`,
    );
  }
  await Promise.all([
    recordUsage(database, "learning-path:global", date, body.usage?.prompt_tokens || 0, body.usage?.completion_tokens || 0),
    recordUsage(database, workspaceScope, date, body.usage?.prompt_tokens || 0, body.usage?.completion_tokens || 0),
  ]);
  return { titleZh: cleanText(parsed.titleZh, 220), titleEn: cleanText(parsed.titleEn, 220), rationaleZh: cleanText(parsed.rationaleZh, 1200), rationaleEn: cleanText(parsed.rationaleEn, 1200), steps };
}

async function stateFor(database: D1Database, space: SpaceRow): Promise<LearningPathState> {
  const context = await contextForSpace(database, space);
  return { path: await readPath(database, space.id), suggestedTarget: context.suggestedTarget, availablePaperCount: context.candidates.length, model: MODEL };
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get("spaceId") || "";
  const owned = await ownedSpace(request, spaceId);
  if ("error" in owned) return owned.error;
  return Response.json(await stateFor(owned.database, owned.space));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { spaceId?: string; target?: string; trackId?: string | null };
  const spaceId = cleanText(body.spaceId, 100);
  const targetTrackId = cleanText(body.trackId, 100) || null;
  const owned = await ownedSpace(request, spaceId);
  if ("error" in owned) return owned.error;
  const requestedTrack = targetTrackId ? await owned.database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, user_role, depth_score + interaction_score AS depth_score, support_score FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(targetTrackId, spaceId).first<TrackContext>() : null;
  if (targetTrackId && !requestedTrack) return Response.json({ error: "Research direction not found in this workspace" }, { status: 404 });
  const context = await contextForSpace(owned.database, owned.space, targetTrackId);
  if (context.candidates.length < 3) return Response.json({ error: "研究地图中还没有足够的真实论文，请先完成一次扫描或继续深挖研究路线。" }, { status: 422 });
  const targetCoverage = targetDirectionResourceCoverage(context.candidates, targetTrackId, []);
  if (targetTrackId && targetCoverage.available === 0) {
    return Response.json({ error: "目标研究方向还没有可用于学习路径的真实论文，请先继续填充该方向。" }, { status: 422 });
  }
  const target = cleanText(body.target, 240) || cleanText(requestedTrack?.title_zh || requestedTrack?.title_en, 240) || context.suggestedTarget;
  if (target.length < 2) return Response.json({ error: "Please provide a learning target" }, { status: 400 });
  try {
    const draft = await buildDraft(owned.database, owned.user.userId, owned.space, target, context, resolveDeepSeekCredential(request).apiKey);
    const pathId = crypto.randomUUID();
    const estimatedMinutes = draft.steps.reduce((sum, step) => sum + step.estimatedMinutes, 0);
    const candidateMap = new Map(context.candidates.map((item) => [item.resource_id, item]));
    const statements = [
      owned.database.prepare("UPDATE learning_paths SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND status != 'superseded'").bind(spaceId),
      owned.database.prepare("INSERT INTO learning_paths (id, space_id, target, target_track_id, title_zh, title_en, rationale_zh, rationale_en, status, analysis_model, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)")
        .bind(pathId, spaceId, target, targetTrackId, draft.titleZh || target, draft.titleEn || target, draft.rationaleZh, draft.rationaleEn, MODEL, estimatedMinutes),
      ...draft.steps.map((step, index) => {
        const resources: LearningResource[] = step.resourceIds.map((id) => candidateMap.get(id)).filter((item): item is CandidateRow => Boolean(item)).map((item) => ({
          id: item.resource_id,
          canonicalId: item.canonical_id,
          title: item.title,
          authors: item.authors,
          venue: item.venue,
          url: item.url,
          publishedAt: item.published_at,
          trackId: item.track_id,
          source: item.source,
          qualityScore: item.quality_score,
          readingStatus: readingStatus(item.reading_status),
          suggestedMinutes: item.read_minutes,
        }));
        return owned.database.prepare("INSERT INTO learning_path_steps (id, path_id, space_id, kind, title_zh, title_en, goal_zh, goal_en, why_zh, why_en, read_focus_zh, read_focus_en, checkpoint_zh, checkpoint_en, estimated_minutes, status, position, resources_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), pathId, spaceId, step.kind, step.titleZh, step.titleEn, step.goalZh, step.goalEn, step.whyZh, step.whyEn, step.readFocusZh, step.readFocusEn, step.checkpointZh, step.checkpointEn, step.estimatedMinutes, index === 0 ? "active" : "pending", index, JSON.stringify(resources));
      }),
      ...(targetTrackId ? [owned.database.prepare(LEARNING_PATH_GENERATION_ROUTE_SIGNAL_SQL).bind(targetTrackId, spaceId)] : []),
    ];
    await owned.database.batch(statements);
    return Response.json(await stateFor(owned.database, owned.space));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Learning path generation failed" },
      { status: error instanceof TargetDirectionCoverageError ? 422 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({})) as { spaceId?: string; pathId?: string; stepId?: string; completed?: boolean };
  const spaceId = cleanText(body.spaceId, 100);
  const pathId = cleanText(body.pathId, 100);
  const stepId = cleanText(body.stepId, 100);
  const owned = await ownedSpace(request, spaceId);
  if ("error" in owned) return owned.error;
  const step = await owned.database.prepare("SELECT s.id, s.status, s.completed_at, p.status AS path_status, p.target_track_id FROM learning_path_steps s JOIN learning_paths p ON p.id = s.path_id WHERE s.id = ? AND s.path_id = ? AND s.space_id = ? AND p.space_id = ? LIMIT 1")
    .bind(stepId, pathId, spaceId, spaceId).first<{ id: string; status: LearningStepStatus; completed_at: string | null; path_status: LearningPath["status"]; target_track_id: string | null }>();
  if (!step) return Response.json({ error: "Learning step not found" }, { status: 404 });
  if (step.path_status === "superseded") return Response.json({ error: "This learning path has been superseded; refresh before updating progress" }, { status: 409 });
  const completing = body.completed === true;
  const completedAt = new Date().toISOString();
  const progressStatements: D1PreparedStatement[] = [];
  if (completing && step.target_track_id) {
    progressStatements.push(owned.database.prepare(LEARNING_PATH_STAGE_ROUTE_SIGNAL_SQL)
      .bind(step.target_track_id, spaceId, stepId, pathId, spaceId));
  }
  progressStatements.push(owned.database.prepare("UPDATE learning_path_steps SET status = ?, completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE completed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND path_id = ? AND space_id = ? AND EXISTS (SELECT 1 FROM learning_paths p WHERE p.id = ? AND p.space_id = ? AND p.status != 'superseded')")
    .bind(completing ? "completed" : "pending", completing ? 1 : 0, completedAt, stepId, pathId, spaceId, pathId, spaceId));
  const progressResults = await owned.database.batch(progressStatements);
  const stepUpdate = progressResults[progressResults.length - 1];
  if ((stepUpdate.meta.changes || 0) !== 1) return Response.json({ error: "This learning path has been superseded; refresh before updating progress" }, { status: 409 });
  const steps = await owned.database.prepare("SELECT id, status FROM learning_path_steps WHERE path_id = ? ORDER BY position").bind(pathId).all<{ id: string; status: LearningStepStatus }>();
  const firstOpen = steps.results.find((item) => item.status !== "completed");
  const updates = steps.results.filter((item) => item.status !== "completed").map((item) => owned.database.prepare("UPDATE learning_path_steps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.id === firstOpen?.id ? "active" : "pending", item.id));
  updates.push(owned.database.prepare("UPDATE learning_paths SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND status != 'superseded'").bind(firstOpen ? "active" : "completed", pathId, spaceId));
  if (updates.length) await owned.database.batch(updates);
  return Response.json(await stateFor(owned.database, owned.space));
}
