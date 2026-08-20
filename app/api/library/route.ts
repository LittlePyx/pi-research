import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import { upsertPreferenceSignal } from "../../../lib/preference-memory";
import { reconcileResearchMapEvidenceStatements } from "../../../lib/research-map-evidence";

const READING_STATUSES = new Set(["unread", "queued", "reading", "read", "mastered", "cited"]);
const READING_MEMORY_MODEL = "deepseek-v4-pro";
const READING_MEMORY_DAILY_LIMIT = 20;
const READING_MEMORY_GLOBAL_DAILY_LIMIT = 100;

type ReadingMemoryDraft = {
  takeawayZh?: string;
  takeawayEn?: string;
  methodsZh?: string[];
  methodsEn?: string[];
  questionsZh?: string[];
  questionsEn?: string[];
  connectionsZh?: string[];
  connectionsEn?: string[];
  topicsZh?: string[];
  topicsEn?: string[];
  trackId?: string;
};
type ReadingPaper = {
  id: string;
  title: string;
  authors: string;
  venue: string;
  summary_zh: string;
  summary_en: string;
  problem_zh: string;
  problem_en: string;
  method_zh: string;
  method_en: string;
  contribution_zh: string;
  contribution_en: string;
  limitations_zh: string;
  limitations_en: string;
};

async function ownedSpace(request: Request, spaceId: string) {
  const user = getApiUser(request);
  if (!user) return null;
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<{ id: string; name: string }>();
  return space ? { database, space, user } : null;
}

function cleanText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseJsonObject(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned) as ReadingMemoryDraft; } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("DeepSeek Pro returned malformed reading-memory JSON");
    return JSON.parse(cleaned.slice(start, end + 1)) as ReadingMemoryDraft;
  }
}

function textArray(value: unknown, max = 6) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(String(item)).slice(0, 320)).filter(Boolean))).slice(0, max);
}

async function contentHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function analyzeReadingNote(database: D1Database, space: { id: string; name: string }, userId: string, paper: ReadingPaper, note: string, readingStatus: string, apiKey: string) {
  const noteHash = await contentHash(note);
  const existing = await database.prepare(
    "SELECT note_hash, analysis_status FROM paper_reading_memories WHERE space_id = ? AND paper_id = ? LIMIT 1",
  ).bind(space.id, paper.id).first<{ note_hash: string; analysis_status: string }>();
  if (existing?.note_hash === noteHash && existing.analysis_status === "ready") return { status: "ready", cached: true };

  await database.prepare(
    `INSERT INTO paper_reading_memories (id, space_id, paper_id, note_hash, analysis_status, model)
     VALUES (?, ?, ?, ?, 'pending', ?)
     ON CONFLICT(space_id, paper_id) DO UPDATE SET note_hash = excluded.note_hash, analysis_status = 'pending',
     model = excluded.model, error = NULL, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), space.id, paper.id, noteHash, READING_MEMORY_MODEL).run();

  if (!apiKey) return { status: "pending", cached: false };
  const usageDate = new Date().toISOString().slice(0, 10);
  const workspaceScope = "reading-memory-workspace:" + userId.replace(/^anonymous:/, "");
  const [workspaceUsage, globalUsage] = await Promise.all([
    usageCount(database, workspaceScope, usageDate),
    usageCount(database, "reading-memory:global", usageDate),
  ]);
  if (workspaceUsage >= READING_MEMORY_DAILY_LIMIT || globalUsage >= READING_MEMORY_GLOBAL_DAILY_LIMIT) {
    await database.prepare("UPDATE paper_reading_memories SET analysis_status = 'error', error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ?")
      .bind("Daily reading-memory analysis limit reached", space.id, paper.id).run();
    return { status: "error", cached: false };
  }

  const tracks = await database.prepare(
    "SELECT id, title_zh, title_en, summary_en FROM research_tracks WHERE space_id = ? ORDER BY interaction_score DESC, depth_score DESC LIMIT 12",
  ).bind(space.id).all<{ id: string; title_zh: string; title_en: string; summary_en: string }>();
  const allowedTrackIds = new Set(tracks.results.map((track) => track.id));
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: READING_MEMORY_MODEL,
        messages: [
          { role: "system", content: "You are Pi Research's research-memory editor. Convert a researcher's own reading note into durable, evidence-disciplined bilingual memory. Return strict JSON only. Never add a claim that is not supported by the note or supplied paper context." },
          { role: "user", content: [
            "Return {takeawayZh,takeawayEn,methodsZh,methodsEn,questionsZh,questionsEn,connectionsZh,connectionsEn,topicsZh,topicsEn,trackId}.",
            "Takeaway must capture what the researcher can reuse, not re-summarize the abstract. Methods are reusable techniques. Questions are unresolved questions explicitly suggested by the note. Connections link the paper to the user's ongoing work. Topics are concise retrieval concepts for future recommendations.",
            "Use 2-6 items per array and align Chinese/English arrays semantically. Use an exact supplied trackId only when directly supported; otherwise use an empty string.",
            `Research space: ${space.name}`,
            `Reading status: ${readingStatus}`,
            `Paper context: ${JSON.stringify(paper)}`,
            `Researcher note: ${note}`,
            `Available research tracks: ${JSON.stringify(tracks.results)}`,
          ].join("\n") },
        ],
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        max_tokens: 1800,
        stream: false,
        user_id: "reading-memory-" + space.id,
      }),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "DeepSeek reading-memory analysis failed");
    const draft = parseJsonObject(data.choices?.[0]?.message?.content || "");
    const memory = {
      takeawayZh: cleanText(draft.takeawayZh || "").slice(0, 900),
      takeawayEn: cleanText(draft.takeawayEn || "").slice(0, 1200),
      methodsZh: textArray(draft.methodsZh), methodsEn: textArray(draft.methodsEn),
      questionsZh: textArray(draft.questionsZh), questionsEn: textArray(draft.questionsEn),
      connectionsZh: textArray(draft.connectionsZh), connectionsEn: textArray(draft.connectionsEn),
      topicsZh: textArray(draft.topicsZh), topicsEn: textArray(draft.topicsEn),
      trackId: allowedTrackIds.has(cleanText(draft.trackId || "")) ? cleanText(draft.trackId || "") : "",
    };
    if (!memory.takeawayZh || !memory.takeawayEn) throw new Error("DeepSeek Pro returned an incomplete reading memory");
    await database.prepare(
      `UPDATE paper_reading_memories SET analysis_status = 'ready', takeaway_zh = ?, takeaway_en = ?,
       methods_zh = ?, methods_en = ?, questions_zh = ?, questions_en = ?, connections_zh = ?, connections_en = ?,
       topics_zh = ?, topics_en = ?, track_id = ?, model = ?, error = NULL, analyzed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ?`,
    ).bind(memory.takeawayZh, memory.takeawayEn, JSON.stringify(memory.methodsZh), JSON.stringify(memory.methodsEn),
      JSON.stringify(memory.questionsZh), JSON.stringify(memory.questionsEn), JSON.stringify(memory.connectionsZh),
      JSON.stringify(memory.connectionsEn), JSON.stringify(memory.topicsZh), JSON.stringify(memory.topicsEn),
      memory.trackId || null, READING_MEMORY_MODEL, space.id, paper.id).run();

    await database.prepare("UPDATE research_preference_signals SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND source_type = 'reading_note' AND source_id LIKE ?")
      .bind(space.id, `${paper.id}:%`).run();
    const signalGroups = [
      { kind: "reading_topic", zh: memory.topicsZh, en: memory.topicsEn, confidence: 82 },
      { kind: "reading_method", zh: memory.methodsZh, en: memory.methodsEn, confidence: 78 },
      { kind: "reading_question", zh: memory.questionsZh, en: memory.questionsEn, confidence: 76 },
    ];
    for (const group of signalGroups) {
      for (let index = 0; index < Math.min(group.zh.length, group.en.length, 5); index += 1) {
        await upsertPreferenceSignal(database, {
          spaceId: space.id, layer: "inferred", kind: group.kind, labelZh: group.zh[index], labelEn: group.en[index],
          evidence: `From the researcher's reading note on “${paper.title}”.`, confidence: group.confidence, weight: group.confidence,
          sourceType: "reading_note", sourceId: `${paper.id}:${noteHash}:${group.kind}:${index}`,
          expiresAt: new Date(Date.now() + 730 * 86_400_000).toISOString(),
        });
      }
    }
    if (memory.trackId) {
      await database.prepare(
        "UPDATE research_tracks SET interaction_score = MIN(35, interaction_score + 2), depth_score = MIN(100, depth_score + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?",
      ).bind(["read", "mastered", "cited"].includes(readingStatus) ? 2 : 1, memory.trackId, space.id).run();
    }
    await Promise.all([
      recordUsage(database, "reading-memory:global", usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(database, workspaceScope, usageDate, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    ]);
    return { status: "ready", cached: false, memory };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Reading-memory analysis failed";
    await database.prepare("UPDATE paper_reading_memories SET analysis_status = 'error', error = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ? AND paper_id = ?")
      .bind(message, space.id, paper.id).run();
    return { status: "error", cached: false };
  }
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
  const payload = await request.json().catch(() => null) as { spaceId?: string; paperId?: string; status?: string; note?: string; analyze?: boolean } | null;
  const spaceId = payload?.spaceId?.trim() || "";
  const paperId = payload?.paperId?.trim() || "";
  const status = payload?.status?.trim() || "";
  const note = (payload?.note || "").trim().slice(0, 3000);
  if (!spaceId || !paperId || !READING_STATUSES.has(status)) return Response.json({ error: "Invalid reading progress payload" }, { status: 400 });
  const context = await ownedSpace(request, spaceId);
  if (!context) return Response.json({ error: "Research space not found" }, { status: 404 });
  const paper = await context.database.prepare(
    `SELECT p.id, p.title, p.authors, p.venue, COALESCE(i.summary_zh, '') AS summary_zh,
     COALESCE(i.summary_en, '') AS summary_en, COALESCE(i.problem_zh, '') AS problem_zh,
     COALESCE(i.problem_en, '') AS problem_en, COALESCE(i.method_zh, '') AS method_zh,
     COALESCE(i.method_en, '') AS method_en, COALESCE(i.contribution_zh, '') AS contribution_zh,
     COALESCE(i.contribution_en, '') AS contribution_en, COALESCE(i.limitations_zh, '') AS limitations_zh,
     COALESCE(i.limitations_en, '') AS limitations_en
     FROM monitored_papers p LEFT JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
     WHERE p.id = ? AND p.space_id = ? LIMIT 1`,
  ).bind(paperId, spaceId).first<ReadingPaper>();
  if (!paper) return Response.json({ error: "Paper not found" }, { status: 404 });
  const now = new Date().toISOString();
  const readingProgressStatement = context.database.prepare(
    `INSERT INTO paper_reading_progress (id, space_id, paper_id, status, note, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id, paper_id) DO UPDATE SET status = excluded.status, note = excluded.note,
     started_at = CASE WHEN excluded.status = 'reading' THEN COALESCE(paper_reading_progress.started_at, excluded.started_at) ELSE paper_reading_progress.started_at END,
     completed_at = CASE WHEN excluded.status IN ('read','mastered','cited') THEN excluded.completed_at ELSE NULL END,
     updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), spaceId, paperId, status, note, status === "reading" ? now : null,
    ["read", "mastered", "cited"].includes(status) ? now : null);
  await context.database.batch([
    readingProgressStatement,
    ...reconcileResearchMapEvidenceStatements(context.database, spaceId, paperId),
  ]);
  const memoryAnalysis = payload?.analyze
    ? note.length >= 40 ? await analyzeReadingNote(context.database, context.space, context.user.userId, paper, note, status, resolveDeepSeekCredential(request).apiKey)
      : { status: "needs_more_context", cached: false }
    : null;
  return Response.json({ ok: true, status, note, memoryAnalysis });
}
