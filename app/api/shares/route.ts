import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import type { ShareKind, ShareLocale, SharePaper, ShareSnapshotPayload } from "../../../db/share-snapshots";

type SpaceRow = { id: string; name: string };
type PaperRow = {
  id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  published_at: string | null;
  horizon: "days" | "months" | "years";
  citation_count: number;
  relevance_score: number;
  summary_zh: string;
  summary_en: string;
  why_read_zh: string;
  why_read_en: string;
  quality_score: number;
  priority_venue: number;
};

function toSharePaper(row: PaperRow): SharePaper {
  return {
    id: row.id,
    doi: row.doi,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    url: row.url,
    publishedAt: row.published_at,
    horizon: row.horizon,
    citationCount: row.citation_count,
    relevanceScore: row.relevance_score,
    summaryZh: row.summary_zh,
    summaryEn: row.summary_en,
    whyReadZh: row.why_read_zh,
    whyReadEn: row.why_read_en,
    qualityScore: row.quality_score,
    priorityVenue: Boolean(row.priority_venue),
  };
}

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Anonymous workspace is not initialized" }, { status: 401 });

  try {
    const input = await request.json() as { spaceId?: string; kind?: ShareKind; paperIds?: string[]; locale?: ShareLocale };
    const spaceId = input.spaceId?.trim() ?? "";
    const kind: ShareKind | null = input.kind === "daily" || input.kind === "paper" ? input.kind : null;
    const locale: ShareLocale = input.locale === "en" ? "en" : "zh";
    const paperIds = [...new Set((input.paperIds || []).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{20,64}$/.test(id)))];
    if (!spaceId || !kind) return Response.json({ error: "Space and snapshot kind are required" }, { status: 400 });
    if ((kind === "paper" && paperIds.length !== 1) || (kind === "daily" && (paperIds.length < 1 || paperIds.length > 6))) {
      return Response.json({ error: "A paper snapshot requires one paper; a daily snapshot supports one to six papers" }, { status: 400 });
    }

    const database = getDatabase();
    await ensureSchema(database);
    const space = await database
      .prepare("SELECT id, name FROM research_spaces WHERE id = ? AND owner_user_id = ?")
      .bind(spaceId, user.userId)
      .first<SpaceRow>();
    if (!space) return Response.json({ error: "Research space not found" }, { status: 404 });

    const placeholders = paperIds.map(() => "?").join(", ");
    const rows = await database.prepare(`
      SELECT p.id, p.doi, p.title, p.authors, p.venue, p.url, p.published_at, p.horizon,
        p.citation_count, p.relevance_score, i.summary_zh, i.summary_en, i.why_read_zh,
        i.why_read_en, i.quality_score, i.priority_venue
      FROM monitored_papers p
      INNER JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
      WHERE p.space_id = ? AND p.id IN (${placeholders})
        AND i.llm_recommended = 1 AND i.analysis_source = 'deepseek'
        AND i.analysis_model = 'deepseek-v4-pro'
    `).bind(space.id, ...paperIds).all<PaperRow>();
    if (rows.results.length !== paperIds.length) {
      return Response.json({ error: "Only recommendations approved and written by DeepSeek Pro can be shared" }, { status: 400 });
    }

    const rowById = new Map(rows.results.map((row) => [row.id, row]));
    const papers = paperIds.map((id) => toSharePaper(rowById.get(id)!));
    const createdAt = new Date().toISOString();
    const title = kind === "daily"
      ? locale === "zh" ? `Pi Research 今日推荐 · ${space.name}` : `Pi Research Today's Picks · ${space.name}`
      : `${papers[0].title} · Pi Research`;
    const payload: ShareSnapshotPayload = { version: 1, kind, locale, spaceName: space.name, createdAt, papers };
    const token = crypto.randomUUID().replaceAll("-", "");

    await database.prepare("INSERT INTO share_snapshots (id, token, space_id, kind, locale, title, payload) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), token, space.id, kind, locale, title, JSON.stringify(payload))
      .run();

    const url = new URL(`/share/${token}`, request.url).toString();
    return Response.json({ token, kind, title, url }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create a share snapshot";
    return Response.json({ error: message }, { status: 500 });
  }
}
