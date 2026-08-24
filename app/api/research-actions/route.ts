import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import {
  evidenceVerificationReport,
  sanitizeEvidenceVerificationDraft,
  type EvidenceVerificationStatus,
} from "../../../lib/evidence-verification";
import {
  researchActionInputRevision,
  researchActionKind,
  sanitizeResearchActionDraft,
  type ResearchActionKind,
} from "../../../lib/research-action";

const MODEL = "deepseek-v4-pro";
const GLOBAL_DAILY_LIMIT = 120;
const WORKSPACE_DAILY_LIMIT = 20;

type ActionContextRow = {
  id: string; problem_id: string; assessment_id: string | null; space_id: string; track_id: string; kind: string;
  title_zh: string; title_en: string; rationale_zh: string; rationale_en: string; status: string; action_updated_at: string;
  question: string; objective: string; scope: string; success_criteria: string; stage: string; problem_updated_at: string;
  track_title_zh: string; track_title_en: string; track_summary_zh: string; track_summary_en: string;
};
type PaperRow = {
  id: string; canonical_id: string; title: string; authors: string; venue: string; published_at: string | null;
  citation_count: number; summary_zh: string; summary_en: string; problem_zh: string; problem_en: string;
  method_zh: string; method_en: string; contribution_zh: string; contribution_en: string;
  limitations_zh: string; limitations_en: string; quality_score: number; relevance_score: number;
  evidence_status: string; evidence_level: string; evidence_coverage: number;
};
type ClaimRow = {
  id: string; paper_id: string; kind: string; claim_zh: string; claim_en: string; evidence_quote: string;
  locator: string; source_url: string; confidence: number;
};
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

function clean(value: unknown, limit = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function parseObject(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Pi returned an incomplete research action response");
  return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
}

async function ownedAction(request: Request, spaceId: string, trackId: string, actionId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  const database = getDatabase();
  await ensureSchema(database);
  const action = await database.prepare(
    `SELECT action.id, action.problem_id, action.assessment_id, action.space_id, action.track_id, action.kind,
      action.title_zh, action.title_en, action.rationale_zh, action.rationale_en, action.status,
      action.updated_at AS action_updated_at, problem.question, problem.objective, problem.scope,
      problem.success_criteria, problem.stage, problem.updated_at AS problem_updated_at,
      track.title_zh AS track_title_zh, track.title_en AS track_title_en,
      track.summary_zh AS track_summary_zh, track.summary_en AS track_summary_en
     FROM research_problem_actions action
     JOIN research_problems problem ON problem.id = action.problem_id AND problem.status = 'active'
     JOIN research_tracks track ON track.id = action.track_id AND track.space_id = action.space_id
     JOIN research_spaces space ON space.id = action.space_id AND space.owner_user_id = ?
     WHERE action.id = ? AND action.space_id = ? AND action.track_id = ? LIMIT 1`,
  ).bind(user.userId, actionId, spaceId, trackId).first<ActionContextRow>();
  if (!action) return { error: Response.json({ error: "Research action not found" }, { status: 404 }) } as const;
  return { database, user, action } as const;
}

async function usageCount(database: D1Database, scope: string, date: string) {
  const row = await database.prepare("SELECT request_count FROM ai_usage_daily WHERE scope = ? AND usage_date = ? LIMIT 1")
    .bind(scope, date).first<{ request_count: number }>();
  return row?.request_count || 0;
}

async function reserveBudget(database: D1Database, userId: string, expectedRequests = 3) {
  const date = new Date().toISOString().slice(0, 10);
  const workspaceScope = `research-action-workspace:${userId.replace(/^anonymous:/, "")}`;
  const [globalCount, workspaceCount] = await Promise.all([
    usageCount(database, "research-action:global", date),
    usageCount(database, workspaceScope, date),
  ]);
  if (globalCount + expectedRequests > GLOBAL_DAILY_LIMIT || workspaceCount + expectedRequests > WORKSPACE_DAILY_LIMIT) {
    throw new Error("Today's research-action budget is complete; existing results remain available");
  }
  return { date, workspaceScope };
}

async function recordUsage(database: D1Database, scope: string, date: string, inputTokens: number, outputTokens: number) {
  await database.prepare(
    `INSERT INTO ai_usage_daily (id, scope, usage_date, request_count, input_tokens, output_tokens)
     VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1,
      input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens,
      updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scope, date, inputTokens, outputTokens).run();
}

async function callDeepSeek(apiKey: string, prompt: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are Pi Research's evidence-disciplined research action executor. Produce a useful research deliverable, not generic advice. Return strict JSON only." },
        { role: "user", content: prompt },
      ],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      max_tokens: 4800,
      stream: false,
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "Pi research action failed");
  return { parsed: parseObject(data.choices?.[0]?.message?.content || ""), usage: data.usage };
}

async function callEvidenceVerifier(apiKey: string, prompt: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are Pi Research's independent evidence verifier. Audit every substantive statement against the supplied evidence. Do not reward plausible wording, do not rubber-stamp the drafting model, and return strict JSON only." },
        { role: "user", content: prompt },
      ],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      max_tokens: 4200,
      stream: false,
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "Pi evidence verification failed");
  return { parsed: parseObject(data.choices?.[0]?.message?.content || ""), usage: data.usage };
}

function actionDraftPayload(result: ReturnType<typeof sanitizeResearchActionDraft>) {
  return {
    headlineZh: result.headlineZh,
    headlineEn: result.headlineEn,
    resultZh: result.resultZh,
    resultEn: result.resultEn,
    decisionZh: result.decisionZh,
    decisionEn: result.decisionEn,
    limitationsZh: result.limitationsZh,
    limitationsEn: result.limitationsEn,
    searchQuery: result.searchQuery,
    paperIds: result.paperIds,
    claimIds: result.claimIds,
    steps: result.deliverable.steps,
    comparisonRows: result.deliverable.comparisonRows,
  };
}

async function verifyResearchAction(input: {
  apiKey: string;
  database: D1Database;
  budget: { date: string; workspaceScope: string };
  kind: ResearchActionKind;
  result: ReturnType<typeof sanitizeResearchActionDraft>;
  papers: PaperRow[];
  claims: ClaimRow[];
}) {
  const allowedFields = ["headline", "result", "decision", "limitations", "steps",
    ...(input.kind === "compare" ? ["comparisonRows"] : []), ...(input.kind === "search" ? ["searchQuery"] : [])];
  const allowedEvidenceIds = new Set(input.claims.map((claim) => claim.id));
  const evidenceById = new Map(input.claims.map((claim) => [claim.id, claim.evidence_quote]));
  let verificationInputTokens = 0;
  let verificationOutputTokens = 0;
  const request = async (candidate: ReturnType<typeof sanitizeResearchActionDraft>, allowCorrection: boolean) => {
    const response = await callEvidenceVerifier(input.apiKey, [
      `Action kind: ${input.kind}`,
      `Candidate deliverable: ${JSON.stringify(actionDraftPayload(candidate))}`,
      `Permitted paper metadata: ${JSON.stringify(input.papers)}`,
      `Grounded evidence claims: ${JSON.stringify(input.claims)}`,
      "Audit headline, result, decision, limitations, every step, every comparison row, and any factual premise behind the search query.",
      "A paper ID proves only identity. A claim ID supports only what its quote and locator entail. Plausibility, title similarity, citation count, and the drafting model's confidence are not evidence.",
      "Flag absolute novelty, proof, optimality, completeness, causal, empirical-validation, convergence, or contradiction claims unless the supplied grounded claim explicitly entails them.",
      `Return {verdict:"verified|revise|insufficient",coverageScore,supportedFields,unsupportedFields,overstatements,contradictionRisks,supportedEvidenceIds,claimChecks:[{field,claimExcerpt,evidenceId,evidenceQuote,verdict:"supported|qualified|unsupported",reason}],reason${allowCorrection ? ",corrected:{headlineZh,headlineEn,resultZh,resultEn,decisionZh,decisionEn,limitationsZh,limitationsEn,searchQuery,paperIds,claimIds,steps,comparisonRows}" : ""}}.`,
      `claimChecks must cover every substantive field in: ${allowedFields.join(", ")}. evidenceId must be an exact supplied claim ID and evidenceQuote must be an exact contiguous quote from that claim's evidence_quote.`,
      allowCorrection
        ? "For revise, corrected must be one complete conservative replacement grounded only in supplied evidence. For insufficient, omit corrected."
        : "This is the post-revision check. Do not propose another rewrite; use insufficient when any substantive issue remains.",
    ].join("\n"));
    verificationInputTokens += response.usage?.prompt_tokens || 0;
    verificationOutputTokens += response.usage?.completion_tokens || 0;
    await Promise.all([
      recordUsage(input.database, "research-action:global", input.budget.date, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0),
      recordUsage(input.database, input.budget.workspaceScope, input.budget.date, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0),
    ]);
    return response;
  };
  const firstResponse = await request(input.result, true);
  const initial = sanitizeEvidenceVerificationDraft(firstResponse.parsed, { allowedFields, allowedEvidenceIds, evidenceById, requireAllFields: true });
  if (initial.clean) return {
    result: input.result,
    status: "verified" as EvidenceVerificationStatus,
    report: evidenceVerificationReport({ initial }),
    verificationInputTokens,
    verificationOutputTokens,
  };
  const correctedDraft = firstResponse.parsed.corrected;
  if (initial.verdict !== "revise" || !correctedDraft || typeof correctedDraft !== "object") return {
    result: null,
    status: "degraded" as EvidenceVerificationStatus,
    report: evidenceVerificationReport({ initial }),
    verificationInputTokens,
    verificationOutputTokens,
  };
  let corrected: ReturnType<typeof sanitizeResearchActionDraft>;
  try {
    corrected = sanitizeResearchActionDraft(correctedDraft, input.kind, new Set(input.papers.map((paper) => paper.id)), allowedEvidenceIds);
  } catch {
    return {
      result: null,
      status: "degraded" as EvidenceVerificationStatus,
      report: evidenceVerificationReport({ initial }),
      verificationInputTokens,
      verificationOutputTokens,
    };
  }
  const secondResponse = await request(corrected, false);
  const revised = sanitizeEvidenceVerificationDraft(secondResponse.parsed, { allowedFields, allowedEvidenceIds, evidenceById, requireAllFields: true });
  const report = evidenceVerificationReport({ initial, revised });
  return {
    result: revised.clean ? corrected : null,
    status: report.status,
    report,
    verificationInputTokens,
    verificationOutputTokens,
  };
}

function degradedResearchAction(kind: ResearchActionKind, report: ReturnType<typeof evidenceVerificationReport>) {
  const issue = [...report.unsupportedFields, ...report.overstatements, ...report.contradictionRisks].slice(0, 3).join("；");
  return {
    headlineZh: "当前证据不足以可靠完成这项行动",
    headlineEn: "Current evidence is insufficient for a reliable deliverable",
    resultZh: "Pi 已完成书目与摘要证据核对，但当前材料仍不足以支持原拟交付内容，因此没有把未经支持的判断交给你。",
    resultEn: "Pi completed bibliographic and abstract evidence checks, but the current material does not support the proposed deliverable, so unsupported conclusions were withheld.",
    decisionZh: kind === "search" ? "先补充可核验来源，再生成定向检索。" : "先补充摘要、出版信息或其他可核验来源，再重新执行这项行动。",
    decisionEn: kind === "search" ? "Add verifiable sources before generating a targeted query." : "Add abstracts, publication metadata, or other verifiable sources, then rerun this action.",
    limitationsZh: issue || report.reason || "缺少能够逐条支持结论的证据。",
    limitationsEn: report.reason || "Claim-level supporting evidence is still missing.",
    searchQuery: "",
    paperIds: [] as string[],
    claimIds: [] as string[],
    deliverable: { steps: [{
      titleZh: "补齐证据后重试", titleEn: "Rerun after grounding the evidence",
      detailZh: "优先补齐相关论文的摘要、出版信息或其他可核验来源，并形成可追溯的证据判断。",
      detailEn: "First add abstracts, publication metadata, or other verifiable sources and produce traceable evidence claims.",
      paperIds: [] as string[], claimIds: [] as string[],
    }], comparisonRows: [] as Array<never> },
  };
}

function kindInstruction(kind: ResearchActionKind) {
  if (kind === "read") return "Choose 1-3 supplied papers and create a concrete reading order, focus, and questions. paperIds must follow that order.";
  if (kind === "compare") return "Compare at least two supplied papers across problem, assumptions, method, evidence, and research consequence. comparisonRows must contain the substantive comparison.";
  if (kind === "verify") return "Test the target claim against grounded claims. Separate support, challenge, qualification, and missing evidence. Absence of evidence is not contradiction.";
  if (kind === "search") return "Design one concise English scholarly search query that reduces the named uncertainty. Do not use site: or filetype:. Explain what evidence would change the decision.";
  return "Produce a decision brief with options, evidence for and against, a provisional choice, and the condition that would reverse it.";
}

async function actionEvidence(database: D1Database, action: ActionContextRow) {
  const [hypotheses, synthesis, papers] = await Promise.all([
    database.prepare(
      "SELECT id, statement, rationale, confidence, source_statement_ids FROM research_problem_hypotheses WHERE problem_id = ? AND status = 'confirmed' ORDER BY position",
    ).bind(action.problem_id).all<{ id: string; statement: string; rationale: string; confidence: number; source_statement_ids: string }>(),
    database.prepare(
      `SELECT synthesis.input_revision, synthesis.overview_zh, synthesis.overview_en, synthesis.change_summary_zh,
        synthesis.change_summary_en, synthesis.next_search_query, synthesis.confidence,
        COALESCE((SELECT json_group_array(json_object('id', statement.id, 'kind', statement.kind,
          'textZh', statement.text_zh, 'textEn', statement.text_en, 'confidence', statement.confidence,
          'sourceClaimIds', json(statement.source_claim_ids))) FROM research_synthesis_statements statement
          WHERE statement.synthesis_id = synthesis.id ORDER BY statement.position), '[]') AS statements_json
       FROM research_syntheses synthesis WHERE synthesis.space_id = ? AND synthesis.track_id = ?
        AND synthesis.status IN ('ready', 'partial') LIMIT 1`,
    ).bind(action.space_id, action.track_id).first<{ input_revision: string; overview_zh: string; overview_en: string; change_summary_zh: string; change_summary_en: string; next_search_query: string; confidence: number; statements_json: string }>(),
    database.prepare(
      `SELECT DISTINCT paper.id, paper.canonical_id, paper.title, paper.authors, paper.venue, paper.published_at,
        paper.citation_count, COALESCE(insight.summary_zh, '') AS summary_zh,
        COALESCE(insight.summary_en, '') AS summary_en, COALESCE(insight.problem_zh, '') AS problem_zh,
        COALESCE(insight.problem_en, '') AS problem_en, COALESCE(insight.method_zh, '') AS method_zh,
        COALESCE(insight.method_en, '') AS method_en, COALESCE(insight.contribution_zh, '') AS contribution_zh,
        COALESCE(insight.contribution_en, '') AS contribution_en, COALESCE(insight.limitations_zh, '') AS limitations_zh,
        COALESCE(insight.limitations_en, '') AS limitations_en, COALESCE(insight.quality_score, 0) AS quality_score,
        COALESCE(insight.llm_relevance_score, 0) AS relevance_score,
        COALESCE(document.status, 'unavailable') AS evidence_status,
        COALESCE(document.evidence_level, 'metadata') AS evidence_level,
        COALESCE(document.coverage_score, 0) AS evidence_coverage
       FROM monitored_papers paper
       LEFT JOIN paper_insights insight ON insight.paper_id = paper.id AND insight.space_id = paper.space_id
       LEFT JOIN paper_evidence_documents document ON document.paper_id = paper.id AND document.space_id = paper.space_id
       LEFT JOIN research_track_papers formal ON formal.space_id = paper.space_id AND formal.track_id = ?
        AND formal.canonical_id = paper.canonical_id
       LEFT JOIN research_map_evidence_proposals proposal ON proposal.space_id = paper.space_id
        AND proposal.track_id = ? AND proposal.paper_id = paper.id AND proposal.status = 'confirmed'
       WHERE paper.space_id = ? AND (formal.id IS NOT NULL OR proposal.id IS NOT NULL OR insight.research_problem_id = ?)
       ORDER BY CASE WHEN proposal.id IS NOT NULL THEN 0 WHEN insight.research_problem_id = ? THEN 1 ELSE 2 END,
        COALESCE(document.coverage_score, 0) DESC, COALESCE(insight.quality_score, 0) DESC, paper.citation_count DESC LIMIT 18`,
    ).bind(action.track_id, action.track_id, action.space_id, action.problem_id, action.problem_id).all<PaperRow>(),
  ]);
  const paperIds = papers.results.map((paper) => paper.id);
  const claims = paperIds.length ? await database.prepare(
    `SELECT id, paper_id, kind, claim_zh, claim_en, evidence_quote, locator, source_url, confidence
     FROM paper_evidence_claims WHERE space_id = ? AND grounded = 1 AND paper_id IN (${paperIds.map(() => "?").join(",")})
     ORDER BY confidence DESC, position LIMIT 80`,
  ).bind(action.space_id, ...paperIds).all<ClaimRow>() : { results: [] as ClaimRow[] };
  const revisions = await database.prepare(
    `SELECT COALESCE(MAX(paper.updated_at), '') AS paper_revision,
      COALESCE(MAX(claim.created_at), '') AS evidence_revision
     FROM monitored_papers paper LEFT JOIN paper_evidence_claims claim ON claim.paper_id = paper.id
     WHERE paper.space_id = ?`,
  ).bind(action.space_id).first<{ paper_revision: string; evidence_revision: string }>();
  return { hypotheses: hypotheses.results, synthesis, papers: papers.results, claims: claims.results, revisions };
}

async function enqueueReading(database: D1Database, action: ActionContextRow, paperIds: string[], note: string) {
  if (!paperIds.length) return;
  await database.batch(paperIds.map((paperId) => database.prepare(
    `INSERT INTO paper_reading_progress (id, space_id, paper_id, status, note)
     VALUES (?, ?, ?, 'queued', ?) ON CONFLICT(space_id, paper_id) DO UPDATE SET
      status = CASE WHEN paper_reading_progress.status IN ('reading','read','mastered','cited')
        THEN paper_reading_progress.status ELSE 'queued' END,
      note = CASE WHEN paper_reading_progress.note = '' THEN excluded.note ELSE paper_reading_progress.note END,
      updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), action.space_id, paperId, note.slice(0, 1000))));
}

export async function POST(request: Request) {
  let runId = "";
  let database: D1Database | null = null;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const spaceId = clean(payload.spaceId, 120);
    const trackId = clean(payload.trackId, 120);
    const actionId = clean(payload.actionId, 120);
    if (!spaceId || !trackId || !actionId) return Response.json({ error: "spaceId, trackId, and actionId are required" }, { status: 400 });
    const context = await ownedAction(request, spaceId, trackId, actionId);
    if ("error" in context) return context.error;
    database = context.database;
    if (context.action.status !== "accepted") return Response.json({ error: "Accept this research action before Pi executes it" }, { status: 422 });
    const credential = resolveDeepSeekCredential(request);
    if (!credential.apiKey) return Response.json({ modelRequired: true, error: "DeepSeek Pro is required" }, { status: 428 });
    const recentRunning = await database.prepare(
      "SELECT id, started_at FROM research_action_runs WHERE action_id = ? AND status IN ('queued','running') ORDER BY started_at DESC LIMIT 1",
    ).bind(actionId).first<{ id: string; started_at: string }>();
    if (recentRunning && Date.now() - Date.parse(recentRunning.started_at) < 10 * 60 * 1000) {
      return Response.json({ error: "This research action is already running", runId: recentRunning.id }, { status: 409 });
    }
    if (recentRunning) await database.prepare(
      "UPDATE research_action_runs SET status = 'failed', stage = 'interrupted', error = 'Previous execution was interrupted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(recentRunning.id).run();
    const budget = await reserveBudget(database, context.user.userId);
    const evidence = await actionEvidence(database, context.action);
    const kind = researchActionKind(context.action.kind);
    if (kind === "compare" && evidence.papers.length < 2) return Response.json({ error: "At least two verified route papers are needed before comparison" }, { status: 422 });
    if (kind === "read" && !evidence.papers.length) return Response.json({ error: "No verified route paper is available for a reading plan" }, { status: 422 });
    const assessment = context.action.assessment_id ? await database.prepare(
      `SELECT input_revision, summary_zh, summary_en, uncertainty_zh, uncertainty_en, next_decision_zh,
        next_decision_en, next_search_query, hypothesis_impacts_json, source_statement_ids, confidence
       FROM research_problem_assessments WHERE id = ? AND problem_id = ? LIMIT 1`,
    ).bind(context.action.assessment_id, context.action.problem_id).first<Record<string, unknown>>() : null;
    const inputRevision = await researchActionInputRevision({
      actionUpdatedAt: context.action.action_updated_at,
      problemUpdatedAt: context.action.problem_updated_at,
      assessmentRevision: clean(assessment?.input_revision, 120),
      synthesisRevision: evidence.synthesis?.input_revision || "",
      paperRevision: evidence.revisions?.paper_revision || "",
      evidenceRevision: evidence.revisions?.evidence_revision || "",
    });
    const cached = await database.prepare(
      "SELECT id, search_query FROM research_action_runs WHERE action_id = ? AND input_revision = ? AND status = 'ready' ORDER BY started_at DESC LIMIT 1",
    ).bind(actionId, inputRevision).first<{ id: string; search_query: string }>();
    if (cached && payload.force !== true) return Response.json({ runId: cached.id, kind, searchQuery: cached.search_query, cached: true });

    runId = crypto.randomUUID();
    await database.prepare(
      `INSERT INTO research_action_runs (id, action_id, problem_id, assessment_id, space_id, track_id,
        status, progress, stage, input_revision, model) VALUES (?, ?, ?, ?, ?, ?, 'running', 28, 'collecting_evidence', ?, ?)`,
    ).bind(runId, actionId, context.action.problem_id, context.action.assessment_id, spaceId, trackId, inputRevision, MODEL).run();
    await database.prepare(
      "UPDATE research_action_runs SET progress = 48, stage = 'reasoning', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(runId).run();
    const prompt = [
      `Action kind: ${kind}. ${kindInstruction(kind)}`,
      `User-accepted action: ${JSON.stringify({ titleZh: context.action.title_zh, titleEn: context.action.title_en, rationaleZh: context.action.rationale_zh, rationaleEn: context.action.rationale_en })}`,
      `User-confirmed research problem: ${JSON.stringify({ question: context.action.question, objective: context.action.objective, scope: context.action.scope, successCriteria: context.action.success_criteria, stage: context.action.stage })}`,
      `Confirmed hypotheses: ${JSON.stringify(evidence.hypotheses)}`,
      `Latest evidence assessment: ${JSON.stringify(assessment)}`,
      `Cross-paper synthesis: ${JSON.stringify(evidence.synthesis ? { overviewZh: evidence.synthesis.overview_zh, overviewEn: evidence.synthesis.overview_en, changeZh: evidence.synthesis.change_summary_zh, changeEn: evidence.synthesis.change_summary_en, confidence: evidence.synthesis.confidence, statements: parseJson(evidence.synthesis.statements_json) } : null)}`,
      `Verified route papers (use exact id values): ${JSON.stringify(evidence.papers)}`,
      `Grounded claims (use exact id values): ${JSON.stringify(evidence.claims)}`,
      "Return {headlineZh,headlineEn,resultZh,resultEn,decisionZh,decisionEn,limitationsZh,limitationsEn,searchQuery,paperIds,claimIds,steps:[{titleZh,titleEn,detailZh,detailEn,paperIds,claimIds}],comparisonRows:[{dimensionZh,dimensionEn,findingZh,findingEn,paperIds,claimIds}] }.",
      "Every substantive claim must stay within the supplied evidence. Use only exact paper and claim IDs. When evidence is insufficient, say so in both languages and make the missing evidence explicit. Never present a hypothesis as proven. The decision must be concrete and revisable. For non-search actions searchQuery must be empty; comparisonRows are required only for compare.",
    ].join("\n");
    const llm = await callDeepSeek(credential.apiKey, prompt);
    await Promise.all([
      recordUsage(database, "research-action:global", budget.date, llm.usage?.prompt_tokens || 0, llm.usage?.completion_tokens || 0),
      recordUsage(database, budget.workspaceScope, budget.date, llm.usage?.prompt_tokens || 0, llm.usage?.completion_tokens || 0),
    ]);
    await database.prepare(
      "UPDATE research_action_runs SET progress = 82, stage = 'verifying_sources', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(runId).run();
    const draftedResult = sanitizeResearchActionDraft(
      llm.parsed,
      kind,
      new Set(evidence.papers.map((paper) => paper.id)),
      new Set(evidence.claims.map((claim) => claim.id)),
    );
    let verified: Awaited<ReturnType<typeof verifyResearchAction>>;
    try {
      verified = await verifyResearchAction({
        apiKey: credential.apiKey,
        database,
        budget,
        kind,
        result: draftedResult,
        papers: evidence.papers,
        claims: evidence.claims,
      });
    } catch (verificationError) {
      const initial = sanitizeEvidenceVerificationDraft({
        verdict: "insufficient",
        coverageScore: 0,
        reason: verificationError instanceof Error ? verificationError.message : "Independent verification was unavailable",
      }, { allowedFields: ["headline", "result", "decision", "limitations", "steps", "comparisonRows", "searchQuery"] });
      verified = {
        result: null,
        status: "degraded",
        report: evidenceVerificationReport({ initial }),
        verificationInputTokens: 0,
        verificationOutputTokens: 0,
      };
    }
    const result = verified.result || degradedResearchAction(kind, verified.report);
    await database.prepare(
      `UPDATE research_action_runs SET status = 'ready', progress = 100, stage = 'ready', headline_zh = ?,
        headline_en = ?, result_zh = ?, result_en = ?, decision_zh = ?, decision_en = ?, limitations_zh = ?,
        limitations_en = ?, search_query = ?, deliverable_json = ?, source_paper_ids = ?, source_claim_ids = ?,
        input_tokens = ?, output_tokens = ?, verification_status = ?, verification_coverage_score = ?, verification_json = ?,
        verification_model = ?, verification_input_tokens = ?, verification_output_tokens = ?, error = NULL,
        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(result.headlineZh, result.headlineEn, result.resultZh, result.resultEn, result.decisionZh, result.decisionEn,
      result.limitationsZh, result.limitationsEn, result.searchQuery, JSON.stringify(result.deliverable),
      JSON.stringify(result.paperIds), JSON.stringify(result.claimIds), llm.usage?.prompt_tokens || 0,
      llm.usage?.completion_tokens || 0, verified.status, verified.report.coverageScore, JSON.stringify(verified.report),
      MODEL, verified.verificationInputTokens, verified.verificationOutputTokens, runId).run();
    if (kind === "read" && verified.result) await enqueueReading(database, context.action, result.paperIds, result.decisionZh);
    if (kind === "search" && verified.result) await database.prepare(
      "DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = ?",
    ).bind(spaceId, new Date().toISOString().slice(0, 10)).run();
    return Response.json({ runId, kind, searchQuery: result.searchQuery, verificationStatus: verified.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute this research action";
    if (database && runId) await database.prepare(
      "UPDATE research_action_runs SET status = 'failed', stage = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(message.slice(0, 500), runId).run().catch(() => undefined);
    return Response.json({ error: message }, { status: message.includes("budget") ? 429 : 502 });
  }
}
