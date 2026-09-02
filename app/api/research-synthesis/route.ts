import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import { enqueueResearchGapDiscovery } from "../../../lib/research-gap-discovery";
import {
  primaryResearchSynthesisGap,
  researchSynthesisDiscoveryQuery,
  researchSynthesisInputRevision,
  sanitizeResearchSynthesisStatements,
  type ResearchSynthesisKind,
  type ResearchSynthesisStatementDraft,
} from "../../../lib/research-synthesis";

type SpaceRow = { id: string; owner_user_id: string };
type TrackRow = { id: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string };
type SourceClaimRow = {
  claim_id: string;
  paper_id: string;
  canonical_id: string;
  title: string;
  authors: string;
  venue: string;
  published_at: string | null;
  claim_kind: string;
  claim_zh: string;
  claim_en: string;
  evidence_quote: string;
  section_label: string;
  locator: string;
  source_url: string;
  confidence: number;
  evidence_level: "metadata" | "abstract" | "fulltext";
  text_hash: string;
};
type SynthesisRow = {
  id: string;
  status: string;
  input_revision: string;
  question_zh: string;
  question_en: string;
  overview_zh: string;
  overview_en: string;
  change_summary_zh: string;
  change_summary_en: string;
  next_search_query: string;
  confidence: number;
  source_paper_count: number;
  fulltext_paper_count: number;
  claim_count: number;
  model: string;
  error: string | null;
  analyzed_at: string | null;
  updated_at: string;
};
type StatementRow = {
  id: string;
  kind: ResearchSynthesisKind;
  title_zh: string;
  title_en: string;
  text_zh: string;
  text_en: string;
  confidence: number;
  source_claim_ids: string;
  source_paper_ids: string;
  position: number;
};
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

const MODEL = "deepseek-v4-pro";
const GLOBAL_DAILY_LIMIT = 80;
const WORKSPACE_DAILY_LIMIT = 12;

function clean(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Pi returned an incomplete synthesis");
  return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
}

async function ownedContext(request: Request, spaceId: string, trackId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, owner_user_id FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) } as const;
  const track = await database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(trackId, spaceId).first<TrackRow>();
  if (!track) return { error: Response.json({ error: "Research direction not found" }, { status: 404 }) } as const;
  return { database, user, space, track } as const;
}

async function sourceClaims(database: D1Database, spaceId: string, trackId: string) {
  const result = await database.prepare(
    `SELECT DISTINCT claim.id AS claim_id, paper.id AS paper_id, paper.canonical_id, paper.title, paper.authors,
      paper.venue, paper.published_at, claim.kind AS claim_kind, claim.claim_zh, claim.claim_en,
      claim.evidence_quote, claim.section_label, claim.locator, claim.source_url, claim.confidence,
      document.evidence_level, document.text_hash
     FROM paper_evidence_claims claim
     JOIN paper_evidence_documents document ON document.id = claim.document_id AND document.space_id = claim.space_id
     JOIN monitored_papers paper ON paper.id = claim.paper_id AND paper.space_id = claim.space_id
     WHERE claim.space_id = ? AND claim.grounded = 1 AND document.status IN ('ready', 'partial')
      AND (
       EXISTS (SELECT 1 FROM research_map_evidence_proposals proposal
        WHERE proposal.space_id = claim.space_id AND proposal.paper_id = claim.paper_id
         AND proposal.track_id = ? AND proposal.status = 'confirmed')
       OR (
        EXISTS (SELECT 1 FROM research_track_papers route_paper
         WHERE route_paper.space_id = claim.space_id AND route_paper.track_id = ?
          AND route_paper.curation_status = 'active'
          AND (route_paper.canonical_id = paper.canonical_id
           OR (COALESCE(route_paper.doi, '') != '' AND lower(route_paper.doi) = lower(COALESCE(paper.doi, '')))
           OR lower(trim(route_paper.title)) = lower(trim(paper.title))))
        AND (
         EXISTS (SELECT 1 FROM paper_feedback feedback WHERE feedback.space_id = claim.space_id
          AND feedback.paper_id = claim.paper_id AND (feedback.saved = 1 OR feedback.feedback = 'relevant'))
         OR EXISTS (SELECT 1 FROM paper_reading_progress progress WHERE progress.space_id = claim.space_id
          AND progress.paper_id = claim.paper_id AND progress.status IN ('reading','read','mastered','cited'))
        )
       )
      )
     ORDER BY CASE document.evidence_level WHEN 'fulltext' THEN 0 ELSE 1 END,
      paper.published_at DESC, claim.position LIMIT 40`,
  ).bind(spaceId, trackId, trackId).all<SourceClaimRow>();
  return result.results;
}

function sourceSummary(claims: SourceClaimRow[]) {
  const paperIds = new Set(claims.map((claim) => claim.paper_id));
  const fulltextPaperIds = new Set(claims.filter((claim) => claim.evidence_level === "fulltext").map((claim) => claim.paper_id));
  return { paperCount: paperIds.size, fulltextPaperCount: fulltextPaperIds.size, claimCount: claims.length };
}

async function readState(database: D1Database, spaceId: string, trackId: string) {
  const claims = await sourceClaims(database, spaceId, trackId);
  const revision = await researchSynthesisInputRevision(claims.map((claim) => ({
    claimId: claim.claim_id, paperId: claim.paper_id, evidenceLevel: claim.evidence_level, textHash: claim.text_hash,
  })));
  const availability = sourceSummary(claims);
  const synthesis = await database.prepare(
    `SELECT id, status, input_revision, question_zh, question_en, overview_zh, overview_en,
      change_summary_zh, change_summary_en, next_search_query, confidence, source_paper_count,
      fulltext_paper_count, claim_count, model, error, analyzed_at, updated_at
     FROM research_syntheses WHERE space_id = ? AND track_id = ? LIMIT 1`,
  ).bind(spaceId, trackId).first<SynthesisRow>();
  const statementRows = synthesis ? await database.prepare(
    `SELECT id, kind, title_zh, title_en, text_zh, text_en, confidence, source_claim_ids,
      source_paper_ids, position FROM research_synthesis_statements WHERE synthesis_id = ? ORDER BY position`,
  ).bind(synthesis.id).all<StatementRow>() : { results: [] as StatementRow[] };
  const claimById = new Map(claims.map((claim) => [claim.claim_id, claim]));
  const statements = statementRows.results.map((statement) => ({
    id: statement.id,
    kind: statement.kind,
    titleZh: statement.title_zh,
    titleEn: statement.title_en,
    textZh: statement.text_zh,
    textEn: statement.text_en,
    confidence: statement.confidence,
    sourcePaperIds: parseJsonArray(statement.source_paper_ids),
    sources: parseJsonArray(statement.source_claim_ids).flatMap((claimId) => {
      const claim = claimById.get(claimId);
      return claim ? [{
        claimId,
        paperId: claim.paper_id,
        title: claim.title,
        authors: claim.authors,
        venue: claim.venue,
        publishedAt: claim.published_at,
        evidenceQuote: claim.evidence_quote,
        locator: claim.locator || claim.section_label,
        sourceUrl: claim.source_url,
        evidenceLevel: claim.evidence_level,
      }] : [];
    }),
  })).filter((statement) => statement.sources.length > 0
    && (!["consensus", "disagreement", "method_lineage"].includes(statement.kind)
      || new Set(statement.sources.map((source) => source.paperId)).size >= 2));
  const synthesisStale = Boolean(synthesis?.input_revision && synthesis.input_revision !== revision);
  const sourceEvidenceWithdrawn = synthesisStale && availability.paperCount < 2;
  const primaryGap = primaryResearchSynthesisGap(statements);
  const nextSearchQuery = synthesisStale || sourceEvidenceWithdrawn
    ? ""
    : researchSynthesisDiscoveryQuery(synthesis?.next_search_query || "", statements);
  return {
    synthesis: {
      status: sourceEvidenceWithdrawn ? "empty" : synthesis?.status || "empty",
      questionZh: synthesis?.question_zh || "",
      questionEn: synthesis?.question_en || "",
      overviewZh: synthesis?.overview_zh || "",
      overviewEn: synthesis?.overview_en || "",
      changeSummaryZh: synthesis?.change_summary_zh || "",
      changeSummaryEn: synthesis?.change_summary_en || "",
      nextSearchQuery,
      nextSearchSourceStatementId: nextSearchQuery ? primaryGap?.id || null : null,
      confidence: synthesis?.confidence || 0,
      sourcePaperCount: synthesis?.source_paper_count || 0,
      fulltextPaperCount: synthesis?.fulltext_paper_count || 0,
      claimCount: synthesis?.claim_count || 0,
      availablePaperCount: availability.paperCount,
      availableFulltextPaperCount: availability.fulltextPaperCount,
      availableClaimCount: availability.claimCount,
      canGenerate: availability.paperCount >= 2,
      stale: synthesisStale,
      model: synthesis?.model || MODEL,
      error: synthesis?.error || null,
      analyzedAt: synthesis?.analyzed_at || null,
      updatedAt: synthesis?.updated_at || null,
      statements: sourceEvidenceWithdrawn ? [] : statements,
    },
    revision,
    claims,
  };
}

async function usageCount(database: D1Database, scope: string, date: string) {
  const row = await database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(scope, date).first<{ request_count: number }>();
  return row?.request_count || 0;
}

async function recordUsage(database: D1Database, scope: string, date: string, inputTokens: number, outputTokens: number) {
  await database.prepare(
    `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(scope, usage_date) DO UPDATE SET
      request_count = request_count + 1, input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scope, date, inputTokens, outputTokens).run();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId")?.trim() || "";
  const trackId = url.searchParams.get("trackId")?.trim() || "";
  if (!spaceId || !trackId) return Response.json({ error: "spaceId and trackId are required" }, { status: 400 });
  const context = await ownedContext(request, spaceId, trackId);
  if ("error" in context) return context.error;
  const state = await readState(context.database, spaceId, trackId);
  return Response.json({ synthesis: state.synthesis });
}

export async function POST(request: Request) {
  let lockToken = "";
  let synthesisId = "";
  try {
    const payload = await request.json() as { spaceId?: string; trackId?: string; force?: boolean };
    const spaceId = payload.spaceId?.trim() || "";
    const trackId = payload.trackId?.trim() || "";
    if (!spaceId || !trackId) return Response.json({ error: "spaceId and trackId are required" }, { status: 400 });
    const context = await ownedContext(request, spaceId, trackId);
    if ("error" in context) return context.error;
    const current = await readState(context.database, spaceId, trackId);
    if (!current.synthesis.canGenerate) {
      return Response.json({ synthesis: current.synthesis, error: "At least two user-confirmed papers with grounded claims are required" }, { status: 422 });
    }
    if (!payload.force && current.synthesis.status === "ready" && !current.synthesis.stale) {
      return Response.json({ synthesis: current.synthesis, cached: true });
    }
    const credential = resolveDeepSeekCredential(request);
    if (!credential.apiKey) return Response.json({ synthesis: current.synthesis, modelRequired: true, error: "DeepSeek Pro is required" }, { status: 428 });
    const date = new Date().toISOString().slice(0, 10);
    const workspaceScope = `research-synthesis-workspace:${context.user.userId.replace(/^anonymous:/, "")}`;
    const [globalUsage, workspaceUsage] = await Promise.all([
      usageCount(context.database, "research-synthesis:global", date), usageCount(context.database, workspaceScope, date),
    ]);
    if (globalUsage >= GLOBAL_DAILY_LIMIT || workspaceUsage >= WORKSPACE_DAILY_LIMIT) {
      return Response.json({ synthesis: current.synthesis, error: "Today's synthesis budget is complete; the saved synthesis remains available" }, { status: 429 });
    }
    synthesisId = (await context.database.prepare("SELECT id FROM research_syntheses WHERE space_id = ? AND track_id = ? LIMIT 1")
      .bind(spaceId, trackId).first<{ id: string }>())?.id || crypto.randomUUID();
    await context.database.prepare(
      `INSERT OR IGNORE INTO research_syntheses (id, space_id, track_id, status) VALUES (?, ?, ?, 'empty')`,
    ).bind(synthesisId, spaceId, trackId).run();
    lockToken = crypto.randomUUID();
    const lock = await context.database.prepare(
      `UPDATE research_syntheses SET status = 'generating', lock_token = ?, lock_expires_at = datetime('now', '+2 minutes'), error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND (lock_token IS NULL OR lock_expires_at IS NULL OR datetime(lock_expires_at) < datetime('now'))`,
    ).bind(lockToken, synthesisId).run();
    if (!Number(lock.meta.changes || 0)) {
      const active = await readState(context.database, spaceId, trackId);
      return Response.json({ synthesis: active.synthesis, inProgress: true }, { status: 202 });
    }
    const previous = current.synthesis.status === "ready" ? {
      overviewZh: current.synthesis.overviewZh,
      overviewEn: current.synthesis.overviewEn,
      statements: current.synthesis.statements.map((statement) => ({ kind: statement.kind, titleZh: statement.titleZh, titleEn: statement.titleEn })),
    } : null;
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are Pi Research's evidence-disciplined synthesis editor. Build a living cross-paper synthesis from claim-level evidence. Return strict JSON only." },
          { role: "user", content: [
            `Research direction: ${context.track.title_zh} / ${context.track.title_en}`,
            `Direction scope: ${context.track.summary_zh} / ${context.track.summary_en}`,
            "Return {questionZh,questionEn,overviewZh,overviewEn,changeSummaryZh,changeSummaryEn,nextSearchQuery,confidence,statements:[...]}",
            "Each statement must contain kind=consensus|disagreement|qualification|method_lineage|evidence_gap, titleZh/En, textZh/En, confidence, sourceClaimIds.",
            "Use only exact supplied claim IDs. consensus, disagreement, and method_lineage must compare at least two papers. Distinguish a real contradiction from different assumptions, datasets, metrics, regimes, or goals; use qualification when the apparent conflict is conditional. Never treat absence from supplied papers as proof of absence from the field.",
            "Explain what is stable, what remains disputed, how methods evolve or substitute for each other, and which evidence would most change the current view. nextSearchQuery must be one concise English scholarly query aimed at the strongest evidence gap, without dates or Boolean syntax.",
            "Every factual statement must be traceable through sourceClaimIds to the supplied exact quote and locator. Your cross-paper conclusion is synthesis, not a quote from any one paper. Lower confidence when evidence is abstract-only or source coverage is thin.",
            `Previous saved synthesis, if any: ${JSON.stringify(previous)}`,
            `Grounded claim records: ${JSON.stringify(current.claims.map((claim) => ({
              claimId: claim.claim_id, paperId: claim.paper_id, canonicalId: claim.canonical_id, title: claim.title,
              authors: claim.authors, venue: claim.venue, publishedAt: claim.published_at,
              evidenceLevel: claim.evidence_level, claimKind: claim.claim_kind,
              claimZh: claim.claim_zh, claimEn: claim.claim_en,
              exactQuote: claim.evidence_quote.slice(0, 520), locator: claim.locator || claim.section_label,
            })))}`,
          ].join("\n") },
        ],
        thinking: { type: "enabled" }, reasoning_effort: "high", response_format: { type: "json_object" }, max_tokens: 4200, stream: false,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await response.json() as DeepSeekResponse;
    if (!response.ok) throw new Error(data.error?.message || "Pi synthesis failed");
    const parsed = parseJsonObject(data.choices?.[0]?.message?.content || "");
    const claimSources = new Map(current.claims.map((claim) => [claim.claim_id, { paperId: claim.paper_id, evidenceLevel: claim.evidence_level }]));
    const statements = sanitizeResearchSynthesisStatements(
      Array.isArray(parsed.statements) ? parsed.statements as ResearchSynthesisStatementDraft[] : [], claimSources,
    );
    if (statements.length < 2) throw new Error("Pi did not produce enough traceable cross-paper statements");
    const questionZh = clean(parsed.questionZh, 260);
    const questionEn = clean(parsed.questionEn, 360);
    const overviewZh = clean(parsed.overviewZh, 1200);
    const overviewEn = clean(parsed.overviewEn, 1600);
    if (!questionZh || !questionEn || !overviewZh || !overviewEn) throw new Error("Pi returned an incomplete bilingual synthesis");
    const changeSummaryZh = clean(parsed.changeSummaryZh, 520);
    const changeSummaryEn = clean(parsed.changeSummaryEn, 720);
    const nextSearchQuery = researchSynthesisDiscoveryQuery(parsed.nextSearchQuery, statements);
    const counts = sourceSummary(current.claims);
    const confidenceCap = counts.fulltextPaperCount >= 2 ? 92 : counts.fulltextPaperCount === 1 ? 78 : 64;
    const confidence = Math.min(Math.max(0, Math.round(Number(parsed.confidence) || 0)), confidenceCap);
    const writes = [
      context.database.prepare("DELETE FROM research_synthesis_statements WHERE synthesis_id = ?").bind(synthesisId),
      ...statements.map((statement, position) => context.database.prepare(
        `INSERT INTO research_synthesis_statements
         (id, synthesis_id, space_id, track_id, kind, title_zh, title_en, text_zh, text_en, confidence, source_claim_ids, source_paper_ids, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), synthesisId, spaceId, trackId, statement.kind, statement.titleZh, statement.titleEn,
        statement.textZh, statement.textEn, statement.confidence, JSON.stringify(statement.sourceClaimIds), JSON.stringify(statement.sourcePaperIds), position)),
      context.database.prepare(
        `UPDATE research_syntheses SET status = 'ready', input_revision = ?, question_zh = ?, question_en = ?, overview_zh = ?, overview_en = ?,
          change_summary_zh = ?, change_summary_en = ?, next_search_query = ?, confidence = ?, source_paper_count = ?, fulltext_paper_count = ?,
          claim_count = ?, model = ?, error = NULL, lock_token = NULL, lock_expires_at = NULL, analyzed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND lock_token = ?`,
      ).bind(current.revision, questionZh, questionEn, overviewZh, overviewEn, changeSummaryZh, changeSummaryEn, nextSearchQuery,
        confidence, counts.paperCount, counts.fulltextPaperCount, counts.claimCount, MODEL, synthesisId, lockToken),
      context.database.prepare(
        `INSERT OR IGNORE INTO research_synthesis_revisions
         (id, synthesis_id, space_id, track_id, input_revision, change_summary_zh, change_summary_en, snapshot_json, source_paper_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), synthesisId, spaceId, trackId, current.revision, changeSummaryZh, changeSummaryEn,
        JSON.stringify({ questionZh, questionEn, overviewZh, overviewEn, nextSearchQuery, confidence, statements }), counts.paperCount),
    ];
    await context.database.batch(writes);
    await enqueueResearchGapDiscovery(context.database, {
      spaceId,
      trackId,
      origin: "synthesis",
      sourceRevision: current.revision,
      queryText: nextSearchQuery,
    });
    await Promise.all([
      recordUsage(context.database, "research-synthesis:global", date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
      recordUsage(context.database, workspaceScope, date, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
    ]);
    const saved = await readState(context.database, spaceId, trackId);
    return Response.json({ synthesis: saved.synthesis });
  } catch (error) {
    if (synthesisId && lockToken) {
      try {
        await getDatabase().prepare(
          `UPDATE research_syntheses SET status = CASE WHEN input_revision != '' THEN 'partial' ELSE 'error' END,
           error = ?, lock_token = NULL, lock_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lock_token = ?`,
        ).bind(error instanceof Error ? error.message.slice(0, 400) : "Pi synthesis failed", synthesisId, lockToken).run();
      } catch { /* keep the original error */ }
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to synthesize this route" }, { status: 502 });
  }
}
