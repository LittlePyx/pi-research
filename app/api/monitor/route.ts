import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

type CrossrefDate = { "date-parts"?: number[][] };
type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  published?: CrossrefDate;
  "published-online"?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "is-referenced-by-count"?: number;
  score?: number;
};
type CrossrefResponse = { message?: { items?: CrossrefItem[] }; messageType?: string };

type SpaceRow = { id: string; name: string; description: string };
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
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  horizon: string;
  citation_count: number;
  relevance_score: number;
  discovered_at: string;
};
type Candidate = {
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  horizon: "days" | "months" | "years";
  citationCount: number;
  relevanceScore: number;
};

const CADENCE_MS = 24 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
const HORIZONS = [
  { key: "days" as const, daysFrom: 14, daysUntil: 0, sort: "published" },
  { key: "months" as const, daysFrom: 180, daysUntil: 15, sort: "relevance" },
  { key: "years" as const, daysFrom: 365 * 5, daysUntil: 181, sort: "is-referenced-by-count" },
];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function publicationDate(item: CrossrefItem) {
  const parts = item["published-online"]?.["date-parts"]?.[0]
    || item["published-print"]?.["date-parts"]?.[0]
    || item.published?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  const year = String(parts[0]).padStart(4, "0");
  const month = String(parts[1] || 1).padStart(2, "0");
  const day = String(parts[2] || 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function titleFingerprint(title: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return "title:" + Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function normalizeItem(item: CrossrefItem, horizon: Candidate["horizon"]): Promise<Candidate | null> {
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
    horizon,
    citationCount: Math.max(0, Math.round(item["is-referenced-by-count"] || 0)),
    relevanceScore: Math.max(0, Math.round(item.score || 0)),
  };
}

async function fetchHorizon(space: SpaceRow, horizon: typeof HORIZONS[number], now: Date) {
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.bibliographic", cleanText(`${space.name} ${space.description}`).slice(0, 260));
  endpoint.searchParams.set("filter", `from-pub-date:${isoDate(dateBefore(now, horizon.daysFrom))},until-pub-date:${isoDate(dateBefore(now, horizon.daysUntil))}`);
  endpoint.searchParams.set("rows", "8");
  endpoint.searchParams.set("sort", horizon.sort);
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("mailto", "pi-research@qiudao-pika.chatgpt.site");
  const requestOptions: RequestInit = {
    headers: {
      Accept: "application/json",
      "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)",
    },
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
  return normalized.filter((item): item is Candidate => Boolean(item));
}

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 }) };
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name, description FROM research_spaces WHERE id = ? AND owner_user_id = ?")
    .bind(spaceId, user.userId)
    .first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) };
  return { database, space };
}

async function readState(database: D1Database, spaceId: string, extra: Record<string, unknown> = {}) {
  const [run, papers, known] = await Promise.all([
    database.prepare("SELECT status, last_run_at, next_run_at, new_count, scanned_count, error FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(spaceId).first<RunRow>(),
    database.prepare("SELECT id, doi, title, authors, venue, url, published_at, horizon, citation_count, relevance_score, discovered_at FROM monitored_papers WHERE space_id = ? ORDER BY discovered_at DESC, citation_count DESC LIMIT 12")
      .bind(spaceId).all<PaperRow>(),
    database.prepare("SELECT COUNT(*) AS count FROM monitored_papers WHERE space_id = ?")
      .bind(spaceId).first<{ count: number }>(),
  ]);
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
      papers: papers.results.map((paper) => ({
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
    return Response.json(await readState(context.database, context.space.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load monitoring state" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { spaceId?: string; force?: boolean };
    const spaceId = payload.spaceId?.trim() || "";
    if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
    const context = await ownedSpace(request, spaceId);
    if ("error" in context) return context.error;
    const { database, space } = context;
    const previous = await database.prepare("SELECT last_run_at FROM monitor_runs WHERE space_id = ? LIMIT 1")
      .bind(space.id).first<{ last_run_at: string | null }>();
    const previousTime = previous?.last_run_at ? Date.parse(previous.last_run_at) : 0;
    const now = new Date();
    const minimumAge = payload.force ? MANUAL_COOLDOWN_MS : CADENCE_MS;
    if (previousTime && now.getTime() - previousTime < minimumAge) {
      return Response.json(await readState(database, space.id, { cached: true, throttled: Boolean(payload.force) }));
    }

    await database.prepare(
      `INSERT INTO monitor_runs (id, space_id, status, error, updated_at)
       VALUES (?, ?, 'scanning', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id) DO UPDATE SET status = 'scanning', error = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), space.id).run();

    try {
      const batches: Candidate[][] = [];
      for (const horizon of HORIZONS) batches.push(await fetchHorizon(space, horizon, now));
      const scannedCount = batches.reduce((total, batch) => total + batch.length, 0);
      const candidates = new Map<string, Candidate>();
      for (const candidate of batches.flat()) {
        if (!candidates.has(candidate.canonicalId)) candidates.set(candidate.canonicalId, candidate);
      }

      let newCount = 0;
      for (const candidate of candidates.values()) {
        const inserted = await database.prepare(
          `INSERT OR IGNORE INTO monitored_papers
           (id, space_id, canonical_id, doi, title, authors, venue, url, published_at, source, horizon, citation_count, relevance_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'crossref', ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), space.id, candidate.canonicalId, candidate.doi, candidate.title,
          candidate.authors, candidate.venue, candidate.url, candidate.publishedAt, candidate.horizon,
          candidate.citationCount, candidate.relevanceScore,
        ).run();
        if ((inserted.meta?.changes || 0) > 0) {
          newCount += 1;
        } else {
          await database.prepare(
            `UPDATE monitored_papers SET last_seen_at = CURRENT_TIMESTAMP,
             citation_count = MAX(citation_count, ?), relevance_score = MAX(relevance_score, ?)
             WHERE space_id = ? AND canonical_id = ?`,
          ).bind(candidate.citationCount, candidate.relevanceScore, space.id, candidate.canonicalId).run();
        }
      }

      const completedAt = new Date();
      const nextRunAt = new Date(completedAt.getTime() + CADENCE_MS);
      await database.prepare(
        "UPDATE monitor_runs SET status = 'ready', last_run_at = ?, next_run_at = ?, new_count = ?, scanned_count = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?",
      ).bind(completedAt.toISOString(), nextRunAt.toISOString(), newCount, scannedCount, space.id).run();
      return Response.json(await readState(database, space.id, { cached: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Monitoring scan failed";
      await database.prepare("UPDATE monitor_runs SET status = 'error', error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?")
        .bind(message, space.id).run();
      return Response.json(await readState(database, space.id), { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run monitoring" }, { status: 500 });
  }
}
