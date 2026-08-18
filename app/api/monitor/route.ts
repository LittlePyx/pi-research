import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";
import { getDomainProfile, inferDomainProfile } from "./domain-profiles";

type Horizon = "days" | "months" | "years";
type CrossrefDate = { "date-parts"?: number[][] };
type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  published?: CrossrefDate;
  "published-online"?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "is-referenced-by-count"?: number;
  score?: number;
};
type CrossrefResponse = { message?: { items?: CrossrefItem[] } };
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type SpaceRow = { id: string; name: string; description: string };
type PreferenceRow = { profile_key: string; priority_venues: string; user_modified: number };
type RunRow = {
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
  new_count: number;
  scanned_count: number;
  error: string | null;
};
type PaperRow = {
  id: string;
  canonical_id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  horizon: Horizon;
  citation_count: number;
  relevance_score: number;
  discovered_at: string;
  abstract_text: string;
  summary_zh: string;
  summary_en: string;
  why_read_zh: string;
  why_read_en: string;
  quality_score: number;
  priority_venue: number;
  analysis_source: string;
};
type Candidate = {
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  abstractText: string;
  horizon: Horizon;
  citationCount: number;
  relevanceScore: number;
  qualityScore: number;
  priorityVenue: boolean;
};
type InsightDraft = {
  canonicalId: string;
  summaryZh: string;
  summaryEn: string;
  whyReadZh: string;
  whyReadEn: string;
  source: "deepseek" | "metadata";
};

const CADENCE_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
const HORIZONS = [
  { key: "days" as const, daysFrom: 14, daysUntil: 0, sort: "published" },
  { key: "months" as const, daysFrom: 180, daysUntil: 15, sort: "relevance" },
  { key: "years" as const, daysFrom: 365 * 5, daysUntil: 181, sort: "is-referenced-by-count" },
];
const MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT = 40;
const MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT = 3;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function publicationDate(item: CrossrefItem) {
  const parts = item["published-online"]?.["date-parts"]?.[0]
    || item["published-print"]?.["date-parts"]?.[0]
    || item.published?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  return `${String(parts[0]).padStart(4, "0")}-${String(parts[1] || 1).padStart(2, "0")}-${String(parts[2] || 1).padStart(2, "0")}`;
}

function parseVenues(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeVenue(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPriorityVenue(venue: string, priorityVenues: string[]) {
  const normalized = normalizeVenue(venue);
  if (!normalized) return false;
  return priorityVenues.some((priority) => {
    const target = normalizeVenue(priority);
    return target.length > 5 && (normalized.includes(target) || target.includes(normalized));
  });
}

function scoreCandidate(candidate: Omit<Candidate, "qualityScore" | "priorityVenue">, priorityVenues: string[], now: Date) {
  const priorityVenue = isPriorityVenue(candidate.venue, priorityVenues);
  const published = candidate.publishedAt ? Date.parse(candidate.publishedAt) : now.getTime();
  const ageDays = Math.max(0, Math.round((now.getTime() - published) / (24 * 60 * 60 * 1000)));
  const relevance = Math.min(40, Math.log1p(candidate.relevanceScore) * 9);
  const citations = Math.min(70, Math.log1p(candidate.citationCount) * 13);
  let qualityScore: number;
  if (candidate.horizon === "days") {
    qualityScore = 115 - Math.min(55, ageDays * 3.5) + relevance * 0.45 + citations * 0.2 + (priorityVenue ? 18 : 0);
  } else if (candidate.horizon === "months") {
    qualityScore = 38 + Math.max(0, 28 - ageDays * 0.12) + relevance * 0.8 + citations * 0.65 + (priorityVenue ? 42 : 0);
  } else {
    qualityScore = 30 + relevance * 0.35 + citations + (priorityVenue ? 48 : 0) + (candidate.abstractText ? 8 : 0);
  }
  return { ...candidate, priorityVenue, qualityScore: Math.max(0, Math.round(qualityScore)) };
}

async function titleFingerprint(title: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return "title:" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function normalizeItem(item: CrossrefItem, horizon: Horizon): Promise<Omit<Candidate, "qualityScore" | "priorityVenue"> | null> {
  const title = cleanText(item.title?.[0] || "");
  if (!title) return null;
  const doi = item.DOI?.trim().toLowerCase() || null;
  const authors = (item.author || []).slice(0, 8).map((author) => {
    return cleanText(author.name || [author.given, author.family].filter(Boolean).join(" "));
  }).filter(Boolean).join(", ");
  const venue = cleanText(item["container-title"]?.[0] || "");
  return {
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors,
    venue,
    url: item.URL || (doi ? "https://doi.org/" + doi : ""),
    publishedAt: publicationDate(item),
    abstractText: cleanText(item.abstract || "").slice(0, 2200),
    horizon,
    citationCount: Math.max(0, Math.round(item["is-referenced-by-count"] || 0)),
    relevanceScore: Math.max(0, Math.round(item.score || 0)),
  };
}

async function fetchHorizon(space: SpaceRow, horizon: typeof HORIZONS[number], now: Date, priorityVenues: string[]) {
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.bibliographic", cleanText(`${space.name} ${space.description}`).slice(0, 260));
  endpoint.searchParams.set("filter", `from-pub-date:${isoDate(dateBefore(now, horizon.daysFrom))},until-pub-date:${isoDate(dateBefore(now, horizon.daysUntil))}`);
  endpoint.searchParams.set("rows", "20");
  endpoint.searchParams.set("sort", horizon.sort);
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const requestOptions: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  let response = await fetch(endpoint, requestOptions);
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await fetch(endpoint, requestOptions);
  }
  if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
  const data = await response.json() as CrossrefResponse;
  const normalized = await Promise.all((data.message?.items || []).map((item) => normalizeItem(item, horizon.key)));
  return normalized
    .filter((item): item is Omit<Candidate, "qualityScore" | "priorityVenue"> => Boolean(item))
    .map((item) => scoreCandidate(item, priorityVenues, now))
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, 8);
}

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name, description FROM research_spaces WHERE id = ? AND owner_user_id = ?")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database, space, user };
}

async function ensurePreference(database: D1Database, space: SpaceRow) {
  let row = await database.prepare("SELECT profile_key, priority_venues, user_modified FROM monitor_preferences WHERE space_id = ? LIMIT 1")
    .bind(space.id).first<PreferenceRow>();
  if (!row) {
    const profile = inferDomainProfile(space.name, space.description);
    await database.prepare("INSERT OR IGNORE INTO monitor_preferences (id, space_id, profile_key, priority_venues) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), space.id, profile.key, JSON.stringify(profile.venues)).run();
    row = await database.prepare("SELECT profile_key, priority_venues, user_modified FROM monitor_preferences WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<PreferenceRow>();
  }
  const profile = getDomainProfile(row?.profile_key || "general_research");
  return {
    profileKey: profile.key,
    profileNameZh: profile.nameZh,
    profileNameEn: profile.nameEn,
    priorityVenues: parseVenues(row?.priority_venues || "[]"),
    userModified: Boolean(row?.user_modified),
  };
}

function fallbackInsight(candidate: Candidate): InsightDraft {
  const venueZh = candidate.venue ? `发表于 ${candidate.venue}` : "已登记在学术元数据中";
  const venueEn = candidate.venue ? `Published in ${candidate.venue}` : "Indexed in scholarly metadata";
  const summaryZh = `${venueZh}，这项工作围绕“${candidate.title}”展开。${candidate.abstractText ? "Pi 已结合作者摘要提取其研究主题，建议进入精读前先核对问题设定与主要结论。" : "当前元数据没有摘要，Pi 的介绍仅依据题目、来源和引用信号。"}`;
  const summaryEn = candidate.abstractText
    ? candidate.abstractText.slice(0, 420)
    : `${venueEn}, this work focuses on “${candidate.title}”. The current record has no abstract, so this introduction is based on its title, venue, and citation signals.`;
  const priority = candidate.priorityVenue ? "它还来自当前领域的重点期刊或会议。" : "";
  const priorityEn = candidate.priorityVenue ? " It also appears in a priority venue for this research space." : "";
  if (candidate.horizon === "days") {
    return { canonicalId: candidate.canonicalId, summaryZh, summaryEn, whyReadZh: `它位于近 14 天新作窗口，适合快速判断这个方向刚发生了什么。${priority}`, whyReadEn: `It is in the 14-day new-work window, making it useful for seeing what just changed in this field.${priorityEn}`, source: "metadata" };
  }
  if (candidate.horizon === "months") {
    return { canonicalId: candidate.canonicalId, summaryZh, summaryEn, whyReadZh: `它在近 6 个月窗口中同时获得较高相关性与质量评分${candidate.citationCount ? `，已有 ${candidate.citationCount} 次引用信号` : ""}。${priority}`, whyReadEn: `Within the six-month window, it combines research relevance with quality signals${candidate.citationCount ? ` and ${candidate.citationCount} citations` : ""}.${priorityEn}`, source: "metadata" };
  }
  return { canonicalId: candidate.canonicalId, summaryZh, summaryEn, whyReadZh: `它在近 5 年窗口中具有较强的质量与可复用性信号${candidate.citationCount ? `，引用量为 ${candidate.citationCount}` : ""}，适合作为方法、框架或研究路线参考。${priority}`, whyReadEn: `In the five-year window, it has strong quality and reuse signals${candidate.citationCount ? `, including ${candidate.citationCount} citations` : ""}, making it useful as a methodological or strategic guide.${priorityEn}`, source: "metadata" };
}

async function usageCount(database: D1Database, scope: string, date: string) {
  const row = await database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(scope, date).first<{ request_count: number }>();
  return row?.request_count || 0;
}

async function recordUsage(database: D1Database, scope: string, date: string, inputTokens: number, outputTokens: number) {
  await database.prepare(
    `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1,
     input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens,
     updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scope, date, inputTokens, outputTokens).run();
}

async function analyzeCandidates(database: D1Database, space: SpaceRow, userId: string, priorityVenues: string[], candidates: Candidate[]) {
  if (!candidates.length) return [] as InsightDraft[];
  const fallback = candidates.map(fallbackInsight);
  const runtime = getRuntimeEnv();
  if (!runtime.DEEPSEEK_API_KEY) return fallback;
  const usageDate = new Date().toISOString().slice(0, 10);
  const workspaceScope = "monitor-workspace:" + userId.slice("anonymous:".length);
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "monitor:global", usageDate),
    usageCount(database, workspaceScope, usageDate),
  ]);
  if (globalCount >= MONITOR_GLOBAL_DAILY_ANALYSIS_LIMIT || workspaceCount >= MONITOR_WORKSPACE_DAILY_ANALYSIS_LIMIT) return fallback;

  const prompt = [
    "You are Pi Research. Return a JSON array only, with no markdown.",
    "For every paper provide: canonicalId, summaryZh, summaryEn, whyReadZh, whyReadEn.",
    "Be evidence-disciplined. Never invent methods or results absent from the supplied title/abstract.",
    "summaryZh: 60-120 Chinese characters. summaryEn: 35-65 words.",
    "whyRead fields: explain fit to the research space and its time-horizon objective.",
    "Horizon objectives: days = newest developments; months = new plus high quality; years = high quality, useful, and strategically or methodologically instructive.",
    `Research space: ${space.name} — ${space.description}`,
    `Priority venues: ${priorityVenues.join("; ")}`,
    "Papers:",
    JSON.stringify(candidates.map((paper) => ({
      canonicalId: paper.canonicalId,
      title: paper.title,
      venue: paper.venue,
      publishedAt: paper.publishedAt,
      horizon: paper.horizon,
      citations: paper.citationCount,
      priorityVenue: paper.priorityVenue,
      abstract: paper.abstractText.slice(0, 900),
    }))),
  ].join("\n");

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + runtime.DEEPSEEK_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: runtime.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "disabled" },
        max_tokens: 2200,
        temperature: 0.15,
        stream: false,
      }),
    });
    const data = await response.json() as DeepSeekResponse;
    if (!response.ok) throw new Error(data.error?.message || "DeepSeek analysis failed");
    const content = data.choices?.[0]?.message?.content || "";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start < 0 || end <= start) throw new Error("DeepSeek returned invalid JSON");
    const parsed = JSON.parse(content.slice(start, end + 1)) as Array<Partial<InsightDraft>>;
    const byId = new Map(parsed.map((item) => [item.canonicalId, item]));
    const result = fallback.map((base) => {
      const item = byId.get(base.canonicalId);
      if (!item?.summaryZh || !item.summaryEn || !item.whyReadZh || !item.whyReadEn) return base;
      return {
        canonicalId: base.canonicalId,
        summaryZh: cleanText(item.summaryZh).slice(0, 700),
        summaryEn: cleanText(item.summaryEn).slice(0, 900),
        whyReadZh: cleanText(item.whyReadZh).slice(0, 600),
        whyReadEn: cleanText(item.whyReadEn).slice(0, 800),
        source: "deepseek" as const,
      };
    });
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    await Promise.all([
      recordUsage(database, "monitor:global", usageDate, inputTokens, outputTokens),
      recordUsage(database, workspaceScope, usageDate, inputTokens, outputTokens),
    ]);
    return result;
  } catch {
    return fallback;
  }
}

async function readState(database: D1Database, space: SpaceRow, extra: Record<string, unknown> = {}) {
  const preference = await ensurePreference(database, space);
  const [run, papers, known] = await Promise.all([
    database.prepare("SELECT status, last_run_at, next_run_at, new_count, scanned_count, error FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<RunRow>(),
    database.prepare(
      `SELECT p.id, p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.horizon,
       p.citation_count, p.relevance_score, p.discovered_at, COALESCE(i.abstract_text, '') AS abstract_text,
       COALESCE(i.summary_zh, '') AS summary_zh, COALESCE(i.summary_en, '') AS summary_en,
       COALESCE(i.why_read_zh, '') AS why_read_zh, COALESCE(i.why_read_en, '') AS why_read_en,
       COALESCE(i.quality_score, 0) AS quality_score, COALESCE(i.priority_venue, 0) AS priority_venue,
       COALESCE(i.analysis_source, 'metadata') AS analysis_source
       FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id = p.id
       WHERE p.space_id = ? ORDER BY i.quality_score DESC, p.discovered_at DESC LIMIT 60`,
    ).bind(space.id).all<PaperRow>(),
    database.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = ?").bind(space.id).first<{ count: number }>(),
  ]);
  const selected: PaperRow[] = [];
  for (const horizon of ["days", "months", "years"] as Horizon[]) {
    selected.push(...papers.results.filter((paper) => paper.horizon === horizon).slice(0, 2));
  }
  return {
    monitor: {
      status: run?.status || "idle",
      lastRunAt: run?.last_run_at || null,
      nextRunAt: run?.next_run_at || null,
      newCount: run?.new_count || 0,
      scannedCount: run?.scanned_count || 0,
      knownCount: known?.count || 0,
      error: run?.error || null,
      cadenceHours: 24,
      source: "Crossref",
      horizons: ["days", "months", "years"],
      preferences: preference,
      papers: selected.map((paper) => ({
        id: paper.id,
        doi: paper.doi,
        title: paper.title,
        authors: paper.authors,
        venue: paper.venue,
        url: paper.url,
        publishedAt: paper.published_at,
        horizon: paper.horizon,
        citationCount: paper.citation_count,
        relevanceScore: paper.relevance_score,
        discoveredAt: paper.discovered_at,
        summaryZh: paper.summary_zh,
        summaryEn: paper.summary_en,
        whyReadZh: paper.why_read_zh,
        whyReadEn: paper.why_read_en,
        qualityScore: paper.quality_score,
        priorityVenue: Boolean(paper.priority_venue),
        analysisSource: paper.analysis_source,
      })),
      ...extra,
    },
  };
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get("spaceId")?.trim() || "";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  try {
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    return Response.json(await readState(context.database, context.space));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load monitoring state" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; priorityVenues?: string[]; reset?: boolean };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space } = context;
    if (payload.reset) {
      await database.prepare("DELETE FROM monitor_preferences WHERE space_id = ?").bind(space.id).run();
      await ensurePreference(database, space);
    } else {
      const venues = Array.from(new Set((payload.priorityVenues || []).map((venue) => cleanText(venue).slice(0, 120)).filter(Boolean))).slice(0, 30);
      if (!venues.length) return Response.json({ error: "At least one priority venue is required" }, { status: 400 });
      const current = await ensurePreference(database, space);
      await database.prepare(
        `INSERT INTO monitor_preferences (id, space_id, profile_key, priority_venues, user_modified)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(space_id) DO UPDATE SET priority_venues = excluded.priority_venues,
         user_modified = 1, updated_at = CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), space.id, current.profileKey, JSON.stringify(venues)).run();
    }
    await database.prepare("UPDATE monitor_runs SET last_run_at = NULL, next_run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?")
      .bind(space.id).run();
    return Response.json(await readState(database, space, { preferencesSaved: true }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save monitoring preferences" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; force?: boolean };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    const preference = await ensurePreference(database, space);
    const previous = await database.prepare("SELECT last_run_at FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ last_run_at: string | null }>();
    const previousTime = previous?.last_run_at ? Date.parse(previous.last_run_at) : 0;
    const now = new Date();
    const minimumAge = payload.force ? MANUAL_COOLDOWN_MS : CADENCE_MS;
    const missingInsights = await database.prepare(
      "SELECT COUNT(*) AS count FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id = p.id WHERE p.space_id = ? AND i.paper_id IS NULL",
    ).bind(space.id).first<{ count: number }>();
    if (previousTime && now.getTime() - previousTime < minimumAge && !(missingInsights?.count || 0)) {
      return Response.json(await readState(database, space, { cached: true, throttled: Boolean(payload.force) }));
    }

    await database.prepare(
      `INSERT INTO monitor_runs (id, space_id, status, error, updated_at)
       VALUES (?, ?, 'scanning', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'scanning', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), space.id).run();

    try {
      const batches: Candidate[][] = [];
      for (const horizon of HORIZONS) batches.push(await fetchHorizon(space, horizon, now, preference.priorityVenues));
      const scannedCount = batches.reduce((total, batch) => total + batch.length, 0);
      const candidates = new Map<string, Candidate>();
      for (const candidate of batches.flat()) {
        const existing = candidates.get(candidate.canonicalId);
        if (!existing || candidate.qualityScore > existing.qualityScore) candidates.set(candidate.canonicalId, candidate);
      }

      let newCount = 0;
      for (const candidate of candidates.values()) {
        const generatedId = crypto.randomUUID();
        const inserted = await database.prepare(
          `INSERT OR IGNORE INTO monitored_papers
           (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon, citation_count, relevance_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'crossref', ?, ?, ?)`,
        ).bind(generatedId, space.id, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
          candidate.url, candidate.publishedAt, candidate.horizon, candidate.citationCount, candidate.relevanceScore).run();
        if ((inserted.meta?.changes || 0) > 0) newCount += 1;
        const paper = await database.prepare("SELECT id FROM monitored_papers WHERE space_id = ? AND canonical_id = ? LIMIT 1")
          .bind(space.id, candidate.canonicalId).first<{ id: string }>();
        if (!paper) continue;
        if ((inserted.meta?.changes || 0) === 0) {
          await database.prepare(
            `UPDATE monitored_papers SET title = ?, authors = ?, venue = ?, url = ?, published_at = ?, horizon = ?,
             last_seen_at = CURRENT_TIMESTAMP, citation_count = MAX(citation_count, ?), relevance_score = MAX(relevance_score, ?)
             WHERE id = ?`,
          ).bind(candidate.title, candidate.authors, candidate.venue, candidate.url, candidate.publishedAt, candidate.horizon,
            candidate.citationCount, candidate.relevanceScore, paper.id).run();
        }
        const fallback = fallbackInsight(candidate);
        await database.prepare(
          `INSERT INTO paper_insights
           (paper_id, space_id, abstract_text, summary_zh, summary_en, why_read_zh, why_read_en, quality_score, priority_venue)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(paper_id) DO UPDATE SET abstract_text = excluded.abstract_text,
           quality_score = excluded.quality_score, priority_venue = excluded.priority_venue, updated_at = CURRENT_TIMESTAMP`,
        ).bind(paper.id, space.id, candidate.abstractText, fallback.summaryZh, fallback.summaryEn, fallback.whyReadZh,
          fallback.whyReadEn, candidate.qualityScore, candidate.priorityVenue ? 1 : 0).run();
      }

      const analysisTargets: Candidate[] = [];
      for (const horizon of ["days", "months", "years"] as Horizon[]) {
        const rows = await database.prepare(
          `SELECT p.canonical_id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.horizon,
           p.citation_count, p.relevance_score, i.abstract_text, i.quality_score, i.priority_venue
           FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
           WHERE p.space_id = ? AND p.horizon = ? AND i.analysis_source != 'deepseek'
           ORDER BY i.quality_score DESC LIMIT 2`,
        ).bind(space.id, horizon).all<{
          canonical_id: string; doi: string | null; title: string; authors: string; venue: string; url: string;
          published_at: string | null; horizon: Horizon; citation_count: number; relevance_score: number;
          abstract_text: string; quality_score: number; priority_venue: number;
        }>();
        analysisTargets.push(...rows.results.map((row) => ({
          canonicalId: row.canonical_id, doi: row.doi, title: row.title, authors: row.authors, venue: row.venue,
          url: row.url, publishedAt: row.published_at, horizon: row.horizon, citationCount: row.citation_count,
          relevanceScore: row.relevance_score, abstractText: row.abstract_text, qualityScore: row.quality_score,
          priorityVenue: Boolean(row.priority_venue),
        })));
      }
      const insights = await analyzeCandidates(database, space, user.userId, preference.priorityVenues, analysisTargets);
      for (const insight of insights) {
        await database.prepare(
          `UPDATE paper_insights SET summary_zh = ?, summary_en = ?, why_read_zh = ?, why_read_en = ?,
           analysis_source = ?, updated_at = CURRENT_TIMESTAMP
           WHERE paper_id = (SELECT id FROM monitored_papers WHERE space_id = ? AND canonical_id = ? LIMIT 1)`,
        ).bind(insight.summaryZh, insight.summaryEn, insight.whyReadZh, insight.whyReadEn, insight.source,
          space.id, insight.canonicalId).run();
      }

      const completedAt = new Date();
      await database.prepare(
        "UPDATE monitor_runs SET status = 'ready', last_run_at = ?, next_run_at = ?, new_count = ?, scanned_count = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
      ).bind(completedAt.toISOString(), new Date(completedAt.getTime() + CADENCE_MS).toISOString(), newCount, scannedCount, space.id).run();
      return Response.json(await readState(database, space, { cached: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Monitoring scan failed";
      await database.prepare("UPDATE monitor_runs SET status = 'error', error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?")
        .bind(message, space.id).run();
      return Response.json(await readState(database, space), { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run monitoring" }, { status: 500 });
  }
}
