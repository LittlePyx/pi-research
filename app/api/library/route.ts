import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";

const READING_STATUSES = new Set(["unread", "queued", "reading", "read", "mastered", "cited"]);

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return null;
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<{ id: string; name: string }>();
  return space ? { database, space } : null;
}

function bibValue(value: string) {
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function citationKey(authors: string, publishedAt: string | null, title: string, index: number) {
  const family = authors.split(",")[0]?.trim().split(/\s+/).at(-1)?.replace(/[^a-zA-Z0-9]/g, "") || "PiResearch";
  const year = publishedAt?.slice(0, 4).replace(/\D/g, "") || "nd";
  const word = title.split(/\s+/).find((item) => item.length >= 4)?.replace(/[^a-zA-Z0-9]/g, "") || "paper";
  return `${family}${year}${word}${index + 1}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId")?.trim() || "";
  const format = url.searchParams.get("format") === "ris" ? "ris" : "bibtex";
  const scope = url.searchParams.get("scope") === "all" ? "all" : "accepted";
  if (!spaceId) return Response.json({ error: "spaceId is required" }, { status: 400 });
  const context = await ownedSpace(request, spaceId);
  if (!context) return Response.json({ error: "Research space not found" }, { status: 404 });
  const condition = scope === "accepted" ? "AND (f.saved = 1 OR f.feedback = 'relevant' OR r.status IN ('reading','read','mastered','cited'))" : "";
  const result = await context.database.prepare(
    `SELECT p.doi, p.title, p.authors, p.venue, p.url, p.published_at
     FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id
     LEFT JOIN paper_feedback f ON f.paper_id = p.id AND f.space_id = p.space_id
     LEFT JOIN paper_reading_progress r ON r.paper_id = p.id AND r.space_id = p.space_id
     WHERE p.space_id = ? AND i.llm_recommended = 1 ${condition}
     ORDER BY p.published_at DESC, p.title LIMIT 1000`,
  ).bind(spaceId).all<{ doi: string | null; title: string; authors: string; venue: string; url: string; published_at: string | null }>();
  const content = format === "ris"
    ? result.results.map((paper) => [
        "TY  - JOUR", `TI  - ${paper.title}`,
        ...paper.authors.split(",").map((author) => author.trim()).filter(Boolean).map((author) => `AU  - ${author}`),
        paper.venue ? `JO  - ${paper.venue}` : "", paper.published_at ? `PY  - ${paper.published_at.slice(0, 4)}` : "",
        paper.doi ? `DO  - ${paper.doi}` : "", paper.url ? `UR  - ${paper.url}` : "", "ER  -",
      ].filter(Boolean).join("\r\n")).join("\r\n\r\n")
    : result.results.map((paper, index) => {
        const fields = [
          `  title = {${bibValue(paper.title)}}`,
          paper.authors ? `  author = {${paper.authors.split(",").map((author) => bibValue(author)).join(" and ")}}` : "",
          paper.venue ? `  journal = {${bibValue(paper.venue)}}` : "",
          paper.published_at ? `  year = {${paper.published_at.slice(0, 4)}}` : "",
          paper.doi ? `  doi = {${bibValue(paper.doi)}}` : "",
          paper.url ? `  url = {${bibValue(paper.url)}}` : "",
        ].filter(Boolean).join(",\n");
        return `@article{${citationKey(paper.authors, paper.published_at, paper.title, index)},\n${fields}\n}`;
      }).join("\n\n");
  const safeName = context.space.name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "pi-research";
  return new Response(content, {
    headers: {
      "Content-Type": format === "ris" ? "application/x-research-info-systems; charset=utf-8" : "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.${format === "ris" ? "ris" : "bib"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null) as { spaceId?: string; paperId?: string; status?: string; note?: string } | null;
  const spaceId = payload?.spaceId?.trim() || "";
  const paperId = payload?.paperId?.trim() || "";
  const status = payload?.status?.trim() || "";
  const note = (payload?.note || "").trim().slice(0, 3000);
  if (!spaceId || !paperId || !READING_STATUSES.has(status)) return Response.json({ error: "Invalid reading progress payload" }, { status: 400 });
  const context = await ownedSpace(request, spaceId);
  if (!context) return Response.json({ error: "Research space not found" }, { status: 404 });
  const paper = await context.database.prepare("SELECT id FROM monitored_papers WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(paperId, spaceId).first<{ id: string }>();
  if (!paper) return Response.json({ error: "Paper not found" }, { status: 404 });
  const now = new Date().toISOString();
  await context.database.prepare(
    `INSERT INTO paper_reading_progress (id, space_id, paper_id, status, note, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id, paper_id) DO UPDATE SET status = excluded.status, note = excluded.note,
     started_at = CASE WHEN excluded.status = 'reading' THEN COALESCE(paper_reading_progress.started_at, excluded.started_at) ELSE paper_reading_progress.started_at END,
     completed_at = CASE WHEN excluded.status IN ('read','mastered','cited') THEN excluded.completed_at ELSE NULL END,
     updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), spaceId, paperId, status, note, status === "reading" ? now : null,
    ["read", "mastered", "cited"].includes(status) ? now : null).run();
  return Response.json({ ok: true, status, note });
}
