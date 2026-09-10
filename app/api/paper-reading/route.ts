import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { readAbstractRecovery, recoverPaperAbstract } from "../../../lib/abstract-recovery";

export async function GET(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId") || "";
  const paperId = url.searchParams.get("paperId") || "";
  if (!spaceId || !paperId) return Response.json({ error: "spaceId and paperId required" }, { status: 400 });
  const db = getDatabase(); await ensureSchema(db);
  const paper = await db.prepare(`SELECT COALESCE(i.abstract_text, '') AS abstractText, i.analysis_source AS analysisSource
    FROM monitored_papers p JOIN research_spaces s ON s.id = p.space_id
    LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
    WHERE p.id = ? AND p.space_id = ? AND s.owner_user_id = ? LIMIT 1`)
    .bind(paperId, spaceId, user.userId).first<{ abstractText: string; analysisSource: string }>();
  if (!paper) return Response.json({ error: "Paper not found" }, { status: 404 });
  const recovery = await readAbstractRecovery(db, spaceId, paperId);
  return Response.json({ paper, recovery }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = getApiUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let input: { spaceId?: string; paperId?: string };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (!input || typeof input !== "object") return Response.json({ error: "Invalid request" }, { status: 400 });
  const { spaceId, paperId } = input;
  if (typeof spaceId !== "string" || typeof paperId !== "string") return Response.json({ error: "Missing identity" }, { status: 400 });
  const db = getDatabase(); await ensureSchema(db);
  const owned = await db.prepare("SELECT p.id FROM monitored_papers p JOIN research_spaces s ON s.id=p.space_id WHERE p.id=? AND p.space_id=? AND s.owner_user_id=?").bind(paperId, spaceId, user.userId).first();
  if (!owned) return Response.json({ error: "Paper not found" }, { status: 404 });
  const recovery = await recoverPaperAbstract(db, spaceId, paperId);
  const paper = await db.prepare("SELECT abstract_text AS abstractText, analysis_source AS analysisSource FROM paper_insights WHERE paper_id=? AND space_id=?").bind(paperId, spaceId).first();
  return Response.json({ paper, recovery }, { headers: { "Cache-Control": "private, no-store" } });
}
