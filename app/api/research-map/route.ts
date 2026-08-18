import { ensureSchema, getApiUser, getDatabase, getRuntimeEnv } from "../../../db/repository";
import type { ResearchMapState, ResearchTrack, ResearchTrackPaper, ResearchTrackRole } from "../../../lib/research-map";

type SpaceRow = { id: string; name: string; description: string; owner_user_id: string };
type TrackRow = {
  id: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  summary_en: string;
  search_queries: string;
  expansion_count: number;
  updated_at: string;
};
type TrackPaperRow = {
  id: string;
  track_id: string;
  canonical_id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  citation_count: number;
  role: ResearchTrackRole;
  summary_zh: string;
  summary_en: string;
  rationale_zh: string;
  rationale_en: string;
  position: number;
};
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
  type?: string;
};
type CrossrefResponse = { message?: { items?: CrossrefItem[] } };
type DirectionDraft = {
  key: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  searchQueries: string[];
};
type MapCandidate = {
  directionKey: string;
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
  abstractText: string;
  proposedRole: ResearchTrackRole;
};
type Selection = {
  directionKey: string;
  canonicalId: string;
  role: ResearchTrackRole;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
};
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

const MODEL = "deepseek-v4-pro";
const PAPER_TYPES = new Set(["journal-article", "proceedings-article", "posted-content"]);
const NON_PAPER_PHRASES = /(publication information|information for authors|instructions for authors|table of contents|editorial board|front matter|back matter|issue information|journal masthead|correction|erratum)/i;
const ROLES = new Set<ResearchTrackRole>(["foundation", "milestone", "frontier"]);
const GLOBAL_DAILY_LIMIT = 80;
const WORKSPACE_DAILY_LIMIT = 10;

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function publicationDate(item: CrossrefItem) {
  const parts = item["published-online"]?.["date-parts"]?.[0]
    || item["published-print"]?.["date-parts"]?.[0]
    || item.published?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  return `${String(parts[0]).padStart(4, "0")}-${String(parts[1] || 1).padStart(2, "0")}-${String(parts[2] || 1).padStart(2, "0")}`;
}

async function titleFingerprint(title: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return "title:" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function normalizeItem(item: CrossrefItem, directionKey: string, proposedRole: ResearchTrackRole): Promise<MapCandidate | null> {
  const title = cleanText(item.title?.[0] || "");
  if (title.length < 12 || !PAPER_TYPES.has(item.type || "") || NON_PAPER_PHRASES.test(title)) return null;
  const doi = item.DOI?.trim().toLocaleLowerCase() || null;
  const authors = (item.author || []).slice(0, 8).map((author) => cleanText(author.name || [author.given, author.family].filter(Boolean).join(" "))).filter(Boolean).join(", ");
  const venue = cleanText(item["container-title"]?.[0] || "");
  return {
    directionKey,
    canonicalId: doi ? "doi:" + doi : await titleFingerprint(title),
    doi,
    title,
    authors,
    venue,
    url: item.URL || (doi ? "https://doi.org/" + doi : ""),
    publishedAt: publicationDate(item),
    citationCount: Math.max(0, Math.round(item["is-referenced-by-count"] || 0)),
    abstractText: cleanText(item.abstract || "").slice(0, 700),
    proposedRole,
  };
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

async function importedMemory(database: D1Database, spaceId: string) {
  const rows = await database.prepare("SELECT analysis_json FROM research_imports WHERE space_id = ? AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 5")
    .bind(spaceId).all<{ analysis_json: string }>();
  const memory: string[] = [];
  for (const row of rows.results) {
    try {
      const item = JSON.parse(row.analysis_json) as { summaryEn?: string; searchTerms?: string[]; interests?: Array<{ labelEn?: string }>; openQuestions?: Array<{ labelEn?: string }> };
      memory.push(item.summaryEn || "", ...(item.searchTerms || []), ...(item.interests || []).map((entry) => entry.labelEn || ""), ...(item.openQuestions || []).map((entry) => entry.labelEn || ""));
    } catch {
      // A malformed historical profile should not prevent a map refresh.
    }
  }
  return Array.from(new Set(memory.map(cleanText).filter(Boolean))).join("; ").slice(0, 2600);
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

async function callDeepSeek<T>(database: D1Database, workspaceId: string, system: string, prompt: string, maxTokens = 12000) {
  const runtime = getRuntimeEnv();
  if (!runtime.DEEPSEEK_API_KEY) throw new Error("DeepSeek Pro is required to build the research map");
  const date = new Date().toISOString().slice(0, 10);
  const workspaceScope = "research-map-workspace:" + workspaceId;
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "research-map:global", date),
    usageCount(database, workspaceScope, date),
  ]);
  if (globalCount >= GLOBAL_DAILY_LIMIT || workspaceCount >= WORKSPACE_DAILY_LIMIT) throw new Error("Research-map analysis budget reached for today");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + runtime.DEEPSEEK_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "DeepSeek Pro research-map analysis failed");
  const content = data.choices?.[0]?.message?.content || "";
  if (!content.trim()) throw new Error("DeepSeek Pro returned an empty research map");
  await Promise.all([
    recordUsage(database, "research-map:global", date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    recordUsage(database, workspaceScope, date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
  ]);
  return JSON.parse(content) as T;
}

async function generateDirections(database: D1Database, workspaceId: string, space: SpaceRow, memory: string) {
  const parsed = await callDeepSeek<{ directions?: Array<Partial<DirectionDraft>> }>(
    database,
    workspaceId,
    "You are Pi Research's academic field cartographer. Return strict JSON grounded in the supplied research scope.",
    [
      "Return {\"directions\":[...]} with 3-5 distinct research directions that together form a useful map of this exact field.",
      "Every direction needs key, titleZh, titleEn, summaryZh, summaryEn, and 2-3 concise English scholarly searchQueries suitable for Crossref.",
      "Directions must be intellectually meaningful branches, not generic labels such as background, methods, or applications.",
      "The summaries should state the central question and how this branch relates to the user's scope. Do not claim any specific paper or result yet.",
      `Research space: ${space.name} — ${space.description}`,
      `User-confirmed research memory: ${memory || "none"}`,
    ].join("\n"),
    8000,
  );
  return (parsed.directions || []).map((item, index) => ({
    key: `${cleanText(item.key || "direction").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 52)}-${index + 1}`,
    titleZh: cleanText(item.titleZh || "").slice(0, 160),
    titleEn: cleanText(item.titleEn || "").slice(0, 200),
    summaryZh: cleanText(item.summaryZh || "").slice(0, 500),
    summaryEn: cleanText(item.summaryEn || "").slice(0, 700),
    searchQueries: Array.from(new Set((item.searchQueries || []).map((query) => cleanText(String(query))).filter((query) => query.length >= 4))).slice(0, 3),
  })).filter((item) => item.titleZh && item.titleEn && item.summaryZh && item.summaryEn && item.searchQueries.length).slice(0, 5);
}

function roleDates(role: ResearchTrackRole) {
  const year = new Date().getUTCFullYear();
  if (role === "foundation") return { from: "1950-01-01", until: `${year - 10}-12-31` };
  if (role === "milestone") return { from: `${year - 15}-01-01`, until: `${year - 5}-12-31` };
  return { from: `${year - 5}-01-01`, until: new Date().toISOString().slice(0, 10) };
}

async function fetchCrossref(query: string, role: ResearchTrackRole, offset: number, rows: number) {
  const dates = roleDates(role);
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.bibliographic", cleanText(query).slice(0, 420));
  endpoint.searchParams.set("filter", `from-pub-date:${dates.from},until-pub-date:${dates.until}`);
  endpoint.searchParams.set("rows", String(rows));
  endpoint.searchParams.set("offset", String(offset));
  endpoint.searchParams.set("sort", role === "frontier" ? "relevance" : "is-referenced-by-count");
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const options: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)" },
    signal: AbortSignal.timeout(20_000),
  };
  let response = await fetch(endpoint, options);
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 950));
    response = await fetch(endpoint, options);
  }
  if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
  return (await response.json() as CrossrefResponse).message?.items || [];
}

async function discoverCandidates(directions: DirectionDraft[], offset: number, rows: number) {
  const discovered: MapCandidate[] = [];
  for (const direction of directions) {
    const batches = await Promise.all((["foundation", "milestone", "frontier"] as ResearchTrackRole[]).map(async (role) => {
      const query = direction.searchQueries[(role === "foundation" ? 0 : role === "milestone" ? 1 : 2) % direction.searchQueries.length];
      const items = await fetchCrossref(query, role, offset, rows);
      const normalized = await Promise.all(items.map((item) => normalizeItem(item, direction.key, role)));
      return normalized.filter((item): item is MapCandidate => Boolean(item));
    }));
    discovered.push(...batches.flat());
    if (directions.length > 1) await new Promise((resolve) => setTimeout(resolve, 180));
  }
  const unique = new Map<string, MapCandidate>();
  for (const candidate of discovered) {
    const key = candidate.directionKey + ":" + candidate.canonicalId;
    const previous = unique.get(key);
    if (!previous || candidate.abstractText.length > previous.abstractText.length || candidate.citationCount > previous.citationCount) unique.set(key, candidate);
  }
  const values = Array.from(unique.values());
  const capped: MapCandidate[] = [];
  for (const direction of directions) {
    for (const role of ["foundation", "milestone", "frontier"] as ResearchTrackRole[]) {
      capped.push(...values.filter((item) => item.directionKey === direction.key && item.proposedRole === role).slice(0, 8));
    }
  }
  return capped;
}

async function selectPapers(database: D1Database, workspaceId: string, space: SpaceRow, memory: string, directions: DirectionDraft[], candidates: MapCandidate[], mode: "initialize" | "expand") {
  const compact = candidates.map((item) => ({
    directionKey: item.directionKey,
    canonicalId: item.canonicalId,
    proposedRole: item.proposedRole,
    title: item.title,
    authors: item.authors,
    venue: item.venue,
    publishedAt: item.publishedAt,
    citations: item.citationCount,
    abstract: item.abstractText,
  }));
  const parsed = await callDeepSeek<{ selections?: Array<Partial<Selection>> }>(
    database,
    workspaceId,
    "You are Pi Research's evidence-disciplined academic map editor. Select only real, representative papers and return strict JSON.",
    [
      "Return {\"selections\":[...]} using only supplied canonicalId and directionKey values.",
      "Each selection needs directionKey, canonicalId, role (foundation|milestone|frontier), summaryZh, summaryEn, rationaleZh, rationaleEn.",
      mode === "initialize" ? "Choose 5-8 papers per direction with coverage across all three roles." : "Choose 3-6 genuinely additive papers for this direction; do not fill a quota with weak records.",
      "Foundation = field-defining concepts or methods; milestone = a decisive development or branch point; frontier = a recent representative work that shows the current direction.",
      "Reject publication information, mastheads, editorials, corrections, calls for papers, vague matches, and records whose title/abstract do not establish a substantive research paper.",
      "Citation count is a noisy signal, not proof. Prefer intellectual representativeness and direct fit. A famous paper outside the exact direction must be rejected.",
      "Summary must explain the paper's question, approach, and evidenced contribution. Rationale must explain why it occupies this exact position in the development route. Never invent results not supported by metadata.",
      `Research space: ${space.name} — ${space.description}`,
      `User-confirmed research memory: ${memory || "none"}`,
      `Directions: ${JSON.stringify(directions)}`,
      `Candidate records: ${JSON.stringify(compact)}`,
    ].join("\n"),
    20000,
  );
  const allowed = new Set(candidates.map((item) => item.directionKey + ":" + item.canonicalId));
  return (parsed.selections || []).map((item) => ({
    directionKey: cleanText(item.directionKey || ""),
    canonicalId: cleanText(item.canonicalId || ""),
    role: ROLES.has(item.role as ResearchTrackRole) ? item.role as ResearchTrackRole : "milestone",
    summaryZh: cleanText(item.summaryZh || "").slice(0, 800),
    summaryEn: cleanText(item.summaryEn || "").slice(0, 1100),
    rationaleZh: cleanText(item.rationaleZh || "").slice(0, 700),
    rationaleEn: cleanText(item.rationaleEn || "").slice(0, 950),
  })).filter((item) => allowed.has(item.directionKey + ":" + item.canonicalId) && item.summaryZh && item.summaryEn && item.rationaleZh && item.rationaleEn);
}

function toPaper(row: TrackPaperRow): ResearchTrackPaper {
  return {
    id: row.id,
    canonicalId: row.canonical_id,
    doi: row.doi,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    url: row.url,
    publishedAt: row.published_at,
    citationCount: row.citation_count,
    role: row.role,
    summaryZh: row.summary_zh,
    summaryEn: row.summary_en,
    rationaleZh: row.rationale_zh,
    rationaleEn: row.rationale_en,
    position: row.position,
  };
}

async function readMap(database: D1Database, spaceId: string, extra: Record<string, unknown> = {}) {
  const [tracksResult, papersResult] = await Promise.all([
    database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, updated_at FROM research_tracks WHERE space_id = ? ORDER BY position, created_at")
      .bind(spaceId).all<TrackRow>(),
    database.prepare("SELECT id, track_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position FROM research_track_papers WHERE space_id = ? ORDER BY position, created_at")
      .bind(spaceId).all<TrackPaperRow>(),
  ]);
  const papersByTrack = new Map<string, ResearchTrackPaper[]>();
  for (const row of papersResult.results) papersByTrack.set(row.track_id, [...(papersByTrack.get(row.track_id) || []), toPaper(row)]);
  const tracks: ResearchTrack[] = tracksResult.results.map((row) => ({
    id: row.id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    summaryZh: row.summary_zh,
    summaryEn: row.summary_en,
    expansionCount: row.expansion_count,
    updatedAt: row.updated_at,
    papers: papersByTrack.get(row.id) || [],
  }));
  return { tracks, model: MODEL, generated: tracks.length > 0, ...extra } satisfies ResearchMapState & Record<string, unknown>;
}

export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get("spaceId")?.trim() || "";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  try {
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    return Response.json(await readMap(context.database, context.space.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the research map" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; action?: "initialize" | "expand"; trackId?: string };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space, user } = context;
    const workspaceId = user.userId.replace(/^anonymous:/, "");
    const memory = await importedMemory(database, space.id);

    if ((payload.action || "initialize") === "initialize") {
      const existing = await database.prepare("SELECT COUNT(*) AS count FROM research_tracks WHERE space_id = ?").bind(space.id).first<{ count: number }>();
      if ((existing?.count || 0) > 0) return Response.json(await readMap(database, space.id, { cached: true, addedCount: 0 }));
      const directions = await generateDirections(database, workspaceId, space, memory);
      if (directions.length < 3) throw new Error("DeepSeek Pro did not return enough distinct research directions");
      const candidates = await discoverCandidates(directions, 0, 14);
      const selections = await selectPapers(database, workspaceId, space, memory, directions, candidates, "initialize");
      const candidateByKey = new Map(candidates.map((item) => [item.directionKey + ":" + item.canonicalId, item]));
      const trackIdByKey = new Map<string, string>();
      for (const [position, direction] of directions.entries()) {
        const trackId = crypto.randomUUID();
        trackIdByKey.set(direction.key, trackId);
        await database.prepare(
          "INSERT INTO research_tracks (id, space_id, title_zh, title_en, summary_zh, summary_en, search_queries, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(trackId, space.id, direction.titleZh, direction.titleEn, direction.summaryZh, direction.summaryEn, JSON.stringify(direction.searchQueries), position).run();
      }
      const positions = new Map<string, number>();
      const inserted = new Set<string>();
      let addedCount = 0;
      for (const selection of selections) {
        const trackId = trackIdByKey.get(selection.directionKey);
        const candidate = candidateByKey.get(selection.directionKey + ":" + selection.canonicalId);
        const insertionKey = `${trackId}:${selection.canonicalId}`;
        if (!trackId || !candidate || inserted.has(insertionKey)) continue;
        inserted.add(insertionKey);
        const position = positions.get(trackId) || 0;
        positions.set(trackId, position + 1);
        await database.prepare(
          `INSERT OR IGNORE INTO research_track_papers
           (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), trackId, space.id, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
          candidate.url, candidate.publishedAt, candidate.citationCount, selection.role, selection.summaryZh, selection.summaryEn,
          selection.rationaleZh, selection.rationaleEn, position).run();
        addedCount += 1;
      }
      return Response.json(await readMap(database, space.id, { cached: false, addedCount }));
    }

    const trackId = payload.trackId?.trim() || "";
    const track = await database.prepare(
      "SELECT id, title_zh, title_en, summary_zh, summary_en, search_queries, expansion_count, updated_at FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1",
    ).bind(trackId, space.id).first<TrackRow>();
    if (!track) return Response.json({ error: "Research direction not found" }, { status: 404 });
    const queries = parseJsonArray(track.search_queries);
    if (!queries.length) throw new Error("This direction has no usable discovery queries");
    const direction: DirectionDraft = {
      key: track.id,
      titleZh: track.title_zh,
      titleEn: track.title_en,
      summaryZh: track.summary_zh,
      summaryEn: track.summary_en,
      searchQueries: queries,
    };
    const offset = ((track.expansion_count + 1) * 16) % 608;
    let candidates = await discoverCandidates([direction], offset, 16);
    const existing = await database.prepare("SELECT canonical_id FROM research_track_papers WHERE track_id = ?").bind(track.id).all<{ canonical_id: string }>();
    const existingIds = new Set(existing.results.map((row) => row.canonical_id));
    candidates = candidates.filter((item) => !existingIds.has(item.canonicalId));
    const selections = candidates.length ? await selectPapers(database, workspaceId, space, memory, [direction], candidates, "expand") : [];
    const candidateById = new Map(candidates.map((item) => [item.canonicalId, item]));
    const inserted = new Set<string>();
    let position = existing.results.length;
    let addedCount = 0;
    for (const selection of selections) {
      const candidate = candidateById.get(selection.canonicalId);
      if (!candidate || inserted.has(selection.canonicalId)) continue;
      inserted.add(selection.canonicalId);
      await database.prepare(
        `INSERT OR IGNORE INTO research_track_papers
         (id, track_id, space_id, canonical_id, doi, title, authors, venue, url, published_at, citation_count, role, summary_zh, summary_en, rationale_zh, rationale_en, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), track.id, space.id, candidate.canonicalId, candidate.doi, candidate.title, candidate.authors, candidate.venue,
        candidate.url, candidate.publishedAt, candidate.citationCount, selection.role, selection.summaryZh, selection.summaryEn,
        selection.rationaleZh, selection.rationaleEn, position++).run();
      addedCount += 1;
    }
    await database.prepare("UPDATE research_tracks SET expansion_count = expansion_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(track.id).run();
    return Response.json(await readMap(database, space.id, { cached: false, addedCount }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to build the research map" }, { status: 502 });
  }
}
