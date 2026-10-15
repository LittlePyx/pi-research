import { focusedWorkbookQuestion, storedWorkbookQuestion, workbookFocus, graphSelection } from "../../../lib/graph-task";
import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import { requestWorkbookModel } from "../../../lib/workbook-model";
import { WorkbookModelError, workbookFailure, workbookRetryDelay, workbookValidationCode, workbookRecoveryHint, workbookResponseDetail } from "../../../lib/workbook-recovery";
import { WORKBOOK_POLICY, WORKBOOK_REVIEW_BATCH_SIZE, rankWorkbookSources, validateWorkbook, validateWorkbookArtifact, validateWorkbookReview, validateWorkbookReviewPart, workbookReviewFields, workbookReviewIssues, workbookRevision, type WorkbookSource, type WorkbookState } from "../../../lib/research-workbook";
import type { WorkbookGraphReview } from '../../../lib/workbook-graph';
import { anchoredWorkbookPrompt, resolveAnchoredWorkbook } from '../../../lib/workbook-evidence';

type Row = { id: string; question: string; source_revision: string; source_ids_json: string; draft_json: string; content_json: string; review_json: string; status: WorkbookState["status"]; retry_at: number; lease_until: number };
type SourceRow = { id: string; canonical_id: string; title: string; authors: string; url: string; abstract_text: string; reading_focus_zh: string; reading_focus_en: string; route_member: number };
const parse = (v: string) => { try { return JSON.parse(v); } catch { return null; } };
const safeId = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 240) : "";

async function context(request: Request, spaceId: string, trackId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  const database = getDatabase(); await ensureSchema(database);
  const track = await database.prepare(`SELECT t.id, t.title_zh, t.title_en, t.summary_zh, t.summary_en,
    COALESCE((SELECT question FROM research_problems WHERE space_id = t.space_id AND track_id = t.id AND status = 'active'), '') AS question
    FROM research_tracks t JOIN research_spaces s ON s.id = t.space_id
    WHERE t.id = ? AND t.space_id = ? AND s.owner_user_id = ?`).bind(trackId, spaceId, user.userId)
    .first<{ id: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string; question: string }>();
  if (!track) return { error: Response.json({ error: "Research direction not found" }, { status: 404 }) } as const;
  return { database, track, question: track.question || `${track.title_zh} / ${track.title_en}: ${track.summary_zh} ${track.summary_en}`, spaceId, trackId } as const;
}
type Context = Exclude<Awaited<ReturnType<typeof context>>, { error: Response }>;

/** Recheck source values inside the write statement, closing the read/write race. */
function evidenceGuard(ctx: Context, selected: WorkbookSource[]) {
  return {
    sql: ` AND EXISTS (SELECT 1 FROM research_tracks t WHERE t.id = ? AND t.space_id = ?
      AND t.title_zh = ? AND t.title_en = ? AND t.summary_zh = ? AND t.summary_en = ?
      AND COALESCE((SELECT question FROM research_problems WHERE space_id = t.space_id AND track_id = t.id AND status = 'active'), '') = ?)
      ${selected.map(() => `AND EXISTS (SELECT 1 FROM monitored_papers p JOIN paper_insights i ON i.paper_id = p.id AND i.space_id = p.space_id
        WHERE p.id = ? AND p.space_id = ? AND p.canonical_id = ? AND p.title = ? AND p.authors = ? AND p.url = ?
        AND substr(i.abstract_text, 1, 7000) = ? AND i.reading_focus_zh = ? AND i.reading_focus_en = ?
        AND i.ever_recommended = 1 AND i.verification_status IN ('verified', 'revised')
        AND NOT EXISTS (SELECT 1 FROM paper_feedback f WHERE f.space_id = p.space_id AND f.paper_id = p.id AND f.feedback = 'not_relevant'))`).join(" ")}`,
    values: [ctx.trackId, ctx.spaceId, ctx.track.title_zh, ctx.track.title_en, ctx.track.summary_zh, ctx.track.summary_en, ctx.track.question,
      ...selected.flatMap(s => [s.id, ctx.spaceId, s.canonicalId, s.title, s.authors, s.url, s.abstractText, s.readingFocusZh, s.readingFocusEn])],
  };
}

async function sources(ctx: Context) {
  const rows = await ctx.database.prepare(`SELECT p.id, p.canonical_id, p.title, p.authors, p.url,
      i.abstract_text, i.reading_focus_zh, i.reading_focus_en,
      CASE WHEN EXISTS (SELECT 1 FROM research_track_papers r WHERE r.space_id = p.space_id AND r.track_id = ?
        AND r.curation_status = 'active' AND lower(r.canonical_id) = lower(p.canonical_id)) THEN 1 ELSE 0 END AS route_member
    FROM monitored_papers p JOIN paper_insights i ON i.space_id = p.space_id AND i.paper_id = p.id
    WHERE p.space_id = ? AND i.ever_recommended = 1 AND i.verification_status IN ('verified', 'revised')
      AND NOT EXISTS (SELECT 1 FROM paper_feedback f WHERE f.space_id = p.space_id AND f.paper_id = p.id AND f.feedback = 'not_relevant')
    ORDER BY route_member DESC, p.id LIMIT 2000`).bind(ctx.trackId, ctx.spaceId).all<SourceRow>();
  return rankWorkbookSources(ctx.question, rows.results.map(r => ({ id: r.id, canonicalId: r.canonical_id, title: r.title,
    authors: r.authors, url: r.url, abstractText: r.abstract_text.slice(0, 7000), readingFocusZh: r.reading_focus_zh,
    readingFocusEn: r.reading_focus_en, routeMember: Boolean(r.route_member) })));
}

async function rowFor(ctx: Context, id = "") {
  return ctx.database.prepare(`SELECT id, question, source_revision, source_ids_json, draft_json, content_json, review_json, status, retry_at, lease_until
    FROM research_comparison_workbooks WHERE space_id = ? AND track_id = ? ${id ? "AND id = ?" : ""} ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .bind(ctx.spaceId, ctx.trackId, ...(id ? [id] : [])).first<Row>();
}

async function projection(original: Context, row: Row | null, preferred: string[] = [], focus = "") {
  const ctx = { ...original, question: focusedWorkbookQuestion(original.track.question || `${original.track.title_zh} / ${original.track.title_en}: ${original.track.summary_zh} ${original.track.summary_en}`, row ? workbookFocus(row.question) : focus) };
  const candidates = await sources(ctx);
  const ids: string[] = row ? parse(row.source_ids_json) || [] : [];
  const selected = ids.map(id => candidates.find(s => s.id === id)).filter((s): s is WorkbookSource => Boolean(s));
  const revision = await workbookRevision(ctx.question, selected);
  const stale = Boolean(row && (row.source_revision !== revision || selected.length !== ids.length));
  const artifact = row ? await ctx.database.prepare(`SELECT revision, value_json FROM research_comparison_artifacts
    WHERE workbook_id = ? AND space_id = ? ORDER BY revision DESC LIMIT 1`).bind(row.id, ctx.spaceId).first<{ revision: number; value_json: string }>() : null;
  const versions = await ctx.database.prepare(`SELECT id, status, created_at FROM research_comparison_workbooks
    WHERE space_id = ? AND track_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20`).bind(ctx.spaceId, ctx.trackId).all();
  const failureRow = row?.status === 'retryable' ? await ctx.database.prepare(`SELECT code, stage FROM research_workbook_attempts
    WHERE workbook_id = ? AND space_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(row.id, ctx.spaceId).first<NonNullable<WorkbookState['failure']>>() : null;
  const detail = workbookValidationCode(failureRow?.code);
  const responseDetail = workbookResponseDetail(failureRow?.code);
  const failure = failureRow && detail ? { code: 'invalid_evidence' as const, stage: failureRow.stage, detail } : failureRow && responseDetail ? { code: 'invalid_response' as const, stage: failureRow.stage, detail: responseDetail } : failureRow;
  const savedReview = parse(row?.review_json || '');
  const reviewIssues = workbookReviewIssues(savedReview);
  let revisionFlow: WorkbookState['revisionFlow'];
  if (savedReview?.workflow?.engine === 'langgraph-v1') {
    const { workbookGraphNext } = await import('../../../lib/workbook-graph');
    // Historical checkpoints remain readable after evidence is withdrawn; only POST validates against current sources.
    revisionFlow = { engine: 'langgraph-v1', repairs: savedReview.workflow.repairs, limit: 1,
      ...(savedReview.workflow.repairMode === 'fields-v1' ? { revisedFields: savedReview.workflow.previousIssues.length, preservedFields: workbookReviewFields(parse(row!.draft_json)).length - savedReview.workflow.previousIssues.length } : {}),
      next: stale || row?.status === 'ready' || row?.status === 'rejected' ? 'stopped' : workbookGraphNext(parse(row?.draft_json || ''), savedReview) };
  }
  const state: WorkbookState = { id: row?.id || null, revision: row?.source_revision || revision, status: row?.status || "empty",
    stale, sources: selected, candidates: [...candidates.filter(c=>preferred.includes(c.canonicalId.toLowerCase())), ...candidates.filter(c=>!preferred.includes(c.canonicalId.toLowerCase()))].slice(0, 15), content: row?.status === "ready" ? parse(row.content_json) : null,
    artifact: artifact ? { revision: artifact.revision, value: parse(artifact.value_json) } : null, retryAt: row?.retry_at || 0,
    stage: row?.draft_json ? 'review' : 'draft', busyUntil: row && row.lease_until > Date.now() ? row.lease_until : 0, failure,
    reviewProgress: { completed: savedReview?.checks?.length || 0, total: row?.draft_json ? workbookReviewFields(parse(row.draft_json)).length : 0 },
    focusQuestion: row ? workbookFocus(row.question) : focus, reviewIssues, revisionFlow };
  return Response.json({ workbook: state, versions: versions.results }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await context(request, safeId(url.searchParams.get("spaceId")), safeId(url.searchParams.get("trackId")));
  if ("error" in ctx) return ctx.error;
  const id = safeId(url.searchParams.get("workbookId"));
  const preferred = (url.searchParams.get("canonicalIds") || "").split(",").filter(Boolean).map(v=>v.toLowerCase()).slice(0,3);
  const focus = (url.searchParams.get("focus") || "").slice(0,1000);
  let row: Row | null;
  if (!id && url.searchParams.get("selection") === "1") {
    const scoped = { ...ctx, question: focusedWorkbookQuestion(ctx.question, focus) };
    const candidates = await sources(scoped);
    const selection = graphSelection(candidates, preferred);
    const selected = selection.selected.map(id => candidates.find(s=>s.id===id)!);
    // A graph task must resume only its own question and exact source set.
    const revision = await workbookRevision(scoped.question, selected);
    const id = `${ctx.spaceId}:${ctx.trackId}:${revision}`;
    row = !selection.missing.length && selected.length >= 2 ? await rowFor(ctx, `${id}:revision-v6`) || await rowFor(ctx, `${id}:evidence-v6`) || await rowFor(ctx, `${id}:revision-v5`) || await rowFor(ctx, `${id}:evidence-v5`) || await rowFor(ctx, `${id}:revision-v4`) || await rowFor(ctx, `${id}:evidence-v4`) || await rowFor(ctx, `${id}:revision-v3`) || await rowFor(ctx, `${id}:evidence-v3`) || await rowFor(ctx, `${id}:revision-v2`) || await rowFor(ctx, `${id}:evidence-v2`) || await rowFor(ctx, `${id}:revision-v1`) || await rowFor(ctx, id) : null;
  } else row = await rowFor(ctx, id);
  if (id && !row) return Response.json({ error: "Workbook not found" }, { status: 404 });
  return projection(ctx, row, preferred, focus);
}

export async function POST(request: Request) {
  let active: { ctx: Context; id: string; token: string; stage: 'draft' | 'review'; started: number } | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    let ctx = await context(request, safeId(body.spaceId), safeId(body.trackId));
    if ("error" in ctx) return ctx.error;
    const action = safeId(body.action);
    if (!["prepare", "advance", "save-artifact"].includes(action)) return Response.json({ error: "Invalid action" }, { status: 400 });
    const baseContext = ctx;
    let row = await rowFor(ctx, safeId(body.workbookId));
    const focusQuestion = action === "prepare" ? (typeof body.focusQuestion === "string" ? body.focusQuestion.trim().slice(0,1000) : "") : workbookFocus(row?.question || "");
    ctx = { ...ctx, question: focusedWorkbookQuestion(ctx.question, focusQuestion) };
    if (action !== "prepare" && (!body.workbookId || !row)) return Response.json({ error: "Workbook not found" }, { status: 404 });
    if (action === "save-artifact") {
      if (!row || row.status !== "ready") return Response.json({ error: "Reviewed workbook required" }, { status: 422 });
      const live = await sources(ctx); const ids = parse(row.source_ids_json) as string[];
      const selected = live.filter(s => ids.includes(s.id));
      if (body.sourceRevision !== row.source_revision || selected.length !== ids.length || await workbookRevision(ctx.question, selected) !== row.source_revision) return Response.json({ error: "Evidence changed; open the current workbook before saving" }, { status: 409 });
      if (!Number.isInteger(body.baseRevision) || Number(body.baseRevision) < 0) return Response.json({ error: "Artifact revision required" }, { status: 400 });
      const value = validateWorkbookArtifact(body.value, validateWorkbook(parse(row.content_json), selected));
      const next = Number(body.baseRevision) + 1;
      const guard = evidenceGuard(ctx, selected);
      const saved = await ctx.database.prepare(`INSERT OR IGNORE INTO research_comparison_artifacts (id, workbook_id, space_id, revision, value_json)
        SELECT ?, ?, ?, ?, ? WHERE COALESCE((SELECT MAX(revision) FROM research_comparison_artifacts WHERE workbook_id = ? AND space_id = ?), 0) = ? ${guard.sql}`)
        .bind(crypto.randomUUID(), row.id, ctx.spaceId, next, JSON.stringify(value), row.id, ctx.spaceId, body.baseRevision, ...guard.values).run();
      if (!saved.meta.changes) return Response.json({ error: "A newer artifact exists; reload before saving" }, { status: 409 });
      return projection(baseContext, row);
    }
    const credential = resolveDeepSeekCredential(request);
    if (!credential.apiKey) return Response.json({ error: "Connect the model to prepare this comparison", modelRequired: true }, { status: 428 });
    const candidates = await sources(ctx);
    if (action === "prepare") {
      const ids = Array.isArray(body.paperIds) ? [...new Set(body.paperIds.map(safeId))] : [];
      const selected = ids.map(id => candidates.find(s => s.id === id)).filter((s): s is WorkbookSource => Boolean(s));
      if (ids.length < 2 || ids.length > 3 || selected.length !== ids.length) return Response.json({ error: "Select two or three currently approved papers" }, { status: 422 });
      const revision = await workbookRevision(ctx.question, selected);
      const rootId = `${ctx.spaceId}:${ctx.trackId}:${revision}`;
      const baselineId = `${rootId}:evidence-v6`;
      const id = body.allowRepair === true ? `${rootId}:revision-v6` : baselineId;
      const baseline = body.allowRepair === true ? await rowFor(ctx, baselineId) : null;
      const seedDraft = baseline?.status === 'rejected' && baseline.draft_json ? validateWorkbook(parse(baseline.draft_json), selected) : null;
      const initialReview = body.allowRepair === true ? (await import('../../../lib/workbook-graph')).initialWorkbookGraphReview() : null;
      await ctx.database.prepare(`INSERT OR IGNORE INTO research_comparison_workbooks
        (id, space_id, track_id, question, source_revision, source_ids_json, policy, draft_json, review_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, ctx.spaceId, ctx.trackId, storedWorkbookQuestion(baseContext.question, focusQuestion), revision, JSON.stringify(ids), WORKBOOK_POLICY,
          seedDraft ? JSON.stringify(seedDraft) : '', initialReview ? JSON.stringify(initialReview) : '').run();
      row = await rowFor(ctx, id);
    }
    if (!row) throw new Error("workbook_missing");
    if (row.status === "ready" || row.status === "rejected") return projection(baseContext, row);
    const ids = parse(row.source_ids_json) as string[];
    const selected = ids.map(id => candidates.find(s => s.id === id)).filter((s): s is WorkbookSource => Boolean(s));
    if (selected.length !== ids.length || await workbookRevision(ctx.question, selected) !== row.source_revision) return Response.json({ error: "Evidence changed; prepare a new comparison" }, { status: 409 });
    const now = Date.now(); const token = crypto.randomUUID();
    const lease = await ctx.database.prepare(`UPDATE research_comparison_workbooks SET lock_token = ?, lease_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND space_id = ? AND status NOT IN ('ready', 'rejected') AND lease_until <= ? AND retry_at <= ?`)
      .bind(token, now + 150_000, row.id, ctx.spaceId, now, now).run();
    if (!lease.meta.changes) return projection(baseContext, row);
    active = { ctx, id: row.id, token, stage: row.draft_json ? 'review' : 'draft', started: now };
    const draft = row.draft_json ? validateWorkbook(parse(row.draft_json), selected) : null;
    // Keep route context in identity/ranking, but a concrete comparison focus is the model's question.
    const comparisonQuestion = workbookFocus(row.question) || ctx.question;
    const savedReview = parse(row.review_json);
    const isGraph = savedReview?.workflow?.engine === 'langgraph-v1';
    const previous = await ctx.database.prepare(`SELECT code, stage FROM research_workbook_attempts WHERE workbook_id = ? AND space_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(row.id, ctx.spaceId).first<{code:string;stage:string}>();
    const model = async (prompt: string, reviewer: boolean) => {
      active!.stage = reviewer ? 'review' : 'draft';
      // A correction retry contract must never instruct the independent reviewer to return patches.
      const hint = previous?.stage === active!.stage ? workbookRecoveryHint(previous.code, reviewer) : '';
      const response = await requestWorkbookModel(credential.apiKey, hint ? JSON.stringify({...JSON.parse(prompt), recovery: hint}) : prompt, reviewer);
      await ctx.database.prepare(`INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
        VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1,
        input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens, updated_at = CURRENT_TIMESTAMP`)
        .bind(crypto.randomUUID(), `research-workbook:${ctx.spaceId}`, new Date().toISOString().slice(0, 10), response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).run();
      return response.raw;
    };
    let content: NonNullable<WorkbookState['content']>;
    let review: ReturnType<typeof validateWorkbookReview> | WorkbookGraphReview | null;
    let status: WorkbookState['status'];
    if (isGraph) {
      const { advanceWorkbookGraph, restoreWorkbookGraphReview } = await import('../../../lib/workbook-graph');
      const result = await advanceWorkbookGraph(comparisonQuestion, selected, { content: draft, review: restoreWorkbookGraphReview(savedReview, draft, selected), status: 'verifying' }, model);
      content = result.content!; review = result.review; status = result.status;
    } else {
    const earlier = draft && savedReview?.checks?.length ? validateWorkbookReviewPart({ verdict: savedReview.supported ? 'supported' : 'unsupported', checks: savedReview.checks }, draft, selected, savedReview.checks.map((c:{id:string})=>c.id)) : null;
    const pending = draft ? workbookReviewFields(draft).filter(id=>!earlier?.checks.some(c=>c.id===id)).slice(0, WORKBOOK_REVIEW_BATCH_SIZE) : [];
    const prompt = draft ? JSON.stringify({ question: comparisonQuestion, sources: selected, workbook: draft,
      requiredCheckIds: pending,
      rules: "Check BOTH languages of each field, including every missing cell (is the information genuinely absent?), all mathematical conditions/quantifiers/bounds, comparability, and the specificity and feasibility of every task and learning field. For each supported cell, EVERY clause, number, model name and qualification must be entailed by THAT CELL'S SELECTED passages (quotes array, or legacy quote), taken collectively. Information elsewhere in the full abstract does not validate its citation; reject such a cell. Use the full abstract to judge missing cells. No full proofs can be taught from abstracts. Reject invented prerequisites stated as facts, contradiction/novelty claims, interchangeable generic advice, and reader instructions requiring internal JSON keys such as quoteId, quoteIds or evidenceIds. Only supported if all checks pass.",
      output: { verdict: "supported|unsupported", checks: [{ id: "exact requiredCheckId", verdict: "supported|unsupported", paperIds: ["exact source ID"], reason: "specific support or failure reason" }] },
      batchRule: 'Return checks for ONLY the supplied requiredCheckIds. Keep each reason to one short sentence. Other fields are reviewed in separate saved batches.',
    }) : anchoredWorkbookPrompt(comparisonQuestion, selected);
    const raw = await model(prompt, Boolean(draft));
    content = draft || resolveAnchoredWorkbook(raw, selected);
    const part = draft ? validateWorkbookReviewPart(raw, draft, selected, pending) : null;
    review = part ? { supported: (earlier?.supported ?? true) && part.supported, checks: [...(earlier?.checks || []), ...part.checks] } : null;
    const complete = Boolean(draft && review && review.checks.length === workbookReviewFields(draft).length);
    if (draft && review && complete) validateWorkbookReview({verdict:review.supported?'supported':'unsupported',checks:review.checks},draft,selected);
    status = review && !review.supported ? 'rejected' : review?.supported && complete ? 'ready' : 'verifying';
    }
    const published = status === 'ready';
    const freshCtx = await context(request, ctx.spaceId, ctx.trackId);
    if ("error" in freshCtx) throw new Error("workbook_context_changed");
    const freshSources = (await sources(freshCtx)).filter(s => ids.includes(s.id));
    if (await workbookRevision(focusedWorkbookQuestion(freshCtx.question, workbookFocus(row.question)), freshSources) !== row.source_revision) throw new Error("workbook_evidence_changed");
    const guard = evidenceGuard(freshCtx, freshSources);
    const saved = await ctx.database.prepare(`UPDATE research_comparison_workbooks SET draft_json = ?, content_json = ?, review_json = ?, status = ?,
      lock_token = NULL, lease_until = 0, retry_at = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND lock_token = ? ${guard.sql}`)
      .bind(JSON.stringify(content), published ? JSON.stringify(content) : "", review ? JSON.stringify(review) : "",
        status, row.id, ctx.spaceId, token, ...guard.values).run();
    if (!saved.meta.changes) throw new Error("workbook_context_changed");
    return projection(ctx, await rowFor(ctx, row.id));
  } catch (error) {
    if (active) {
      const code = workbookFailure(error);
      await active.ctx.database.batch([
        active.ctx.database.prepare(`INSERT INTO research_workbook_attempts (id, workbook_id, space_id, stage, code, provider_status, finish_reason, elapsed_ms)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM research_comparison_workbooks WHERE id = ? AND space_id = ? AND lock_token = ?)`)
          .bind(crypto.randomUUID(), active.id, active.ctx.spaceId, active.stage, workbookValidationCode(error) || (error instanceof WorkbookModelError ? error.detail : null) || code, error instanceof WorkbookModelError ? error.providerStatus : 0,
            error instanceof WorkbookModelError ? error.finishReason : '', Date.now() - active.started, active.id, active.ctx.spaceId, active.token),
        active.ctx.database.prepare(`UPDATE research_comparison_workbooks SET status = 'retryable', retry_at = ?, lock_token = NULL, lease_until = 0,
          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND lock_token = ?`)
          .bind(Date.now() + workbookRetryDelay(code), active.id, active.ctx.spaceId, active.token),
      ]);
      return projection(active.ctx, await rowFor(active.ctx, active.id));
    }
    return Response.json({ error: "Unable to update comparison workbook" }, { status: 422 });
  }
}
