import { ensureSchema, getApiUser, getDatabase } from "../../../db/repository";
import { resolveDeepSeekCredential } from "../../../lib/model-credentials";
import {
  cleanResearchProblemText,
  researchProblemInputRevision,
  researchProblemStage,
  sanitizeResearchProblemAssessment,
  sanitizeResearchProblemDraft,
} from "../../../lib/research-problem";

const MODEL = "deepseek-v4-pro";
const GLOBAL_DAILY_LIMIT = 80;
const WORKSPACE_DAILY_LIMIT = 14;

type SpaceRow = { id: string; name: string; description: string };
type TrackRow = { id: string; title_zh: string; title_en: string; summary_zh: string; summary_en: string };
type ProblemRow = {
  id: string; status: string; working_language: string; question: string; objective: string; scope: string;
  success_criteria: string; stage: string; model: string; source_revision: string; confirmed_at: string | null;
  created_at: string; updated_at: string;
};
type HypothesisRow = {
  id: string; statement: string; rationale: string; status: string; confidence: number;
  source_statement_ids: string; position: number; updated_at: string;
};
type StatementRow = {
  id: string; kind: string; title_zh: string; title_en: string; text_zh: string; text_en: string;
  confidence: number; source_claim_ids: string;
};
type AssessmentRow = {
  id: string; input_revision: string; summary_zh: string; summary_en: string; change_zh: string; change_en: string;
  uncertainty_zh: string; uncertainty_en: string; next_decision_zh: string; next_decision_en: string;
  next_search_query: string; hypothesis_impacts_json: string; source_statement_ids: string;
  confidence: number; model: string; created_at: string;
};
type ActionRow = {
  id: string; assessment_id: string | null; kind: string; title_zh: string; title_en: string;
  rationale_zh: string; rationale_en: string; status: string; position: number; completed_at: string | null; updated_at: string;
};
type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function parseObject(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Pi returned an incomplete research problem response");
  return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
}

async function ownedContext(request: Request, spaceId: string, trackId: string) {
  const user = getApiUser(request);
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  const database = getDatabase();
  await ensureSchema(database);
  const space = await database.prepare("SELECT id, name, description FROM research_spaces WHERE id = ? AND owner_user_id = ? LIMIT 1")
    .bind(spaceId, user.userId).first<SpaceRow>();
  if (!space) return { error: Response.json({ error: "Research space not found" }, { status: 404 }) } as const;
  const track = await database.prepare("SELECT id, title_zh, title_en, summary_zh, summary_en FROM research_tracks WHERE id = ? AND space_id = ? LIMIT 1")
    .bind(trackId, spaceId).first<TrackRow>();
  if (!track) return { error: Response.json({ error: "Research direction not found" }, { status: 404 }) } as const;
  return { database, user, space, track } as const;
}

async function synthesisContext(database: D1Database, spaceId: string, trackId: string) {
  const synthesis = await database.prepare(
    `SELECT id, input_revision, question_zh, question_en, overview_zh, overview_en, change_summary_zh, change_summary_en,
      next_search_query, confidence, updated_at FROM research_syntheses
     WHERE space_id = ? AND track_id = ? AND status IN ('ready', 'partial') LIMIT 1`,
  ).bind(spaceId, trackId).first<{ id: string; input_revision: string; question_zh: string; question_en: string; overview_zh: string; overview_en: string; change_summary_zh: string; change_summary_en: string; next_search_query: string; confidence: number; updated_at: string }>();
  const statements = synthesis ? await database.prepare(
    `SELECT id, kind, title_zh, title_en, text_zh, text_en, confidence, source_claim_ids
     FROM research_synthesis_statements WHERE synthesis_id = ? ORDER BY position`,
  ).bind(synthesis.id).all<StatementRow>() : { results: [] as StatementRow[] };
  return { synthesis, statements: statements.results };
}

async function readState(database: D1Database, spaceId: string, trackId: string) {
  const [problem, synthesis] = await Promise.all([
    database.prepare(
      `SELECT id, status, working_language, question, objective, scope, success_criteria, stage, model,
        source_revision, confirmed_at, created_at, updated_at FROM research_problems WHERE space_id = ? AND track_id = ? LIMIT 1`,
    ).bind(spaceId, trackId).first<ProblemRow>(),
    synthesisContext(database, spaceId, trackId),
  ]);
  const hypotheses = problem ? (await database.prepare(
    `SELECT id, statement, rationale, status, confidence, source_statement_ids, position, updated_at
     FROM research_problem_hypotheses WHERE problem_id = ? ORDER BY position`,
  ).bind(problem.id).all<HypothesisRow>()).results : [];
  const revision = problem ? await researchProblemInputRevision({
    problemUpdatedAt: problem.updated_at,
    synthesisRevision: synthesis.synthesis?.input_revision || "",
    hypotheses: hypotheses.map((item) => ({ id: item.id, statement: item.statement, status: item.status, updatedAt: item.updated_at })),
  }) : "";
  const assessment = problem ? await database.prepare(
    `SELECT id, input_revision, summary_zh, summary_en, change_zh, change_en, uncertainty_zh, uncertainty_en,
      next_decision_zh, next_decision_en, next_search_query, hypothesis_impacts_json, source_statement_ids,
      confidence, model, created_at FROM research_problem_assessments WHERE problem_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).bind(problem.id).first<AssessmentRow>() : null;
  const actions = problem ? (await database.prepare(
    `SELECT id, assessment_id, kind, title_zh, title_en, rationale_zh, rationale_en, status, position,
      completed_at, updated_at FROM research_problem_actions WHERE problem_id = ? AND status != 'dismissed'
     ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'proposed' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, position, updated_at DESC`,
  ).bind(problem.id).all<ActionRow>()).results : [];
  return {
    problem: problem ? {
      id: problem.id, status: problem.status, workingLanguage: problem.working_language,
      question: problem.question, objective: problem.objective, scope: problem.scope,
      successCriteria: problem.success_criteria, stage: problem.stage, model: problem.model,
      sourceRevision: problem.source_revision, confirmedAt: problem.confirmed_at,
      createdAt: problem.created_at, updatedAt: problem.updated_at,
    } : null,
    hypotheses: hypotheses.map((item) => ({
      id: item.id, statement: item.statement, rationale: item.rationale, status: item.status,
      confidence: item.confidence, sourceStatementIds: parseArray(item.source_statement_ids), position: item.position,
    })),
    assessment: assessment ? {
      id: assessment.id, inputRevision: assessment.input_revision,
      summaryZh: assessment.summary_zh, summaryEn: assessment.summary_en,
      changeZh: assessment.change_zh, changeEn: assessment.change_en,
      uncertaintyZh: assessment.uncertainty_zh, uncertaintyEn: assessment.uncertainty_en,
      nextDecisionZh: assessment.next_decision_zh, nextDecisionEn: assessment.next_decision_en,
      nextSearchQuery: assessment.next_search_query, hypothesisImpacts: parseArray(assessment.hypothesis_impacts_json),
      sourceStatementIds: parseArray(assessment.source_statement_ids), confidence: assessment.confidence,
      model: assessment.model, createdAt: assessment.created_at, stale: assessment.input_revision !== revision,
    } : null,
    actions: actions.map((item) => ({
      id: item.id, assessmentId: item.assessment_id, kind: item.kind, titleZh: item.title_zh, titleEn: item.title_en,
      rationaleZh: item.rationale_zh, rationaleEn: item.rationale_en, status: item.status,
      position: item.position, completedAt: item.completed_at, updatedAt: item.updated_at,
    })),
    evidence: {
      synthesisReady: Boolean(synthesis.synthesis), statementCount: synthesis.statements.length,
      synthesisRevision: synthesis.synthesis?.input_revision || "", canDraft: synthesis.statements.length > 0,
      canAssess: problem?.status === "active" && synthesis.statements.length > 0,
    },
    revision,
    rawSynthesis: synthesis,
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
     VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(scope, usage_date) DO UPDATE SET request_count = request_count + 1,
      input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens,
      updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scope, date, inputTokens, outputTokens).run();
}

async function assertBudget(database: D1Database, userId: string) {
  const date = new Date().toISOString().slice(0, 10);
  const workspaceScope = `research-problem-workspace:${userId.replace(/^anonymous:/, "")}`;
  const [global, workspace] = await Promise.all([
    usageCount(database, "research-problem:global", date), usageCount(database, workspaceScope, date),
  ]);
  if (global >= GLOBAL_DAILY_LIMIT || workspace >= WORKSPACE_DAILY_LIMIT) throw new Error("Today's research-problem budget is complete; saved work remains available");
  return { date, workspaceScope };
}

async function callDeepSeek(apiKey: string, system: string, prompt: string, maxTokens: number) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      thinking: { type: "enabled" }, reasoning_effort: "high", response_format: { type: "json_object" },
      max_tokens: maxTokens, stream: false,
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const data = await response.json() as DeepSeekResponse;
  if (!response.ok) throw new Error(data.error?.message || "Pi research-problem analysis failed");
  return { parsed: parseObject(data.choices?.[0]?.message?.content || ""), usage: data.usage };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId")?.trim() || "";
  const trackId = url.searchParams.get("trackId")?.trim() || "";
  if (!spaceId || !trackId) return Response.json({ error: "spaceId and trackId are required" }, { status: 400 });
  const context = await ownedContext(request, spaceId, trackId);
  if ("error" in context) return context.error;
  const state = await readState(context.database, spaceId, trackId);
  return Response.json({ problemState: { problem: state.problem, hypotheses: state.hypotheses, assessment: state.assessment, actions: state.actions, evidence: state.evidence } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const spaceId = cleanResearchProblemText(payload.spaceId, 120);
    const trackId = cleanResearchProblemText(payload.trackId, 120);
    const action = cleanResearchProblemText(payload.action, 40);
    if (!spaceId || !trackId || !action) return Response.json({ error: "spaceId, trackId, and action are required" }, { status: 400 });
    const context = await ownedContext(request, spaceId, trackId);
    if ("error" in context) return context.error;
    const current = await readState(context.database, spaceId, trackId);

    if (action === "confirm") {
      const question = cleanResearchProblemText(payload.question, 520);
      const objective = cleanResearchProblemText(payload.objective, 700);
      const scope = cleanResearchProblemText(payload.scope, 700);
      const successCriteria = cleanResearchProblemText(payload.successCriteria, 700);
      if (!question || !objective || !scope || !successCriteria) return Response.json({ error: "Complete the question, objective, scope, and success criteria before confirmation" }, { status: 422 });
      const problemId = current.problem?.id || crypto.randomUUID();
      const allowedStatementIds = new Set(current.rawSynthesis.statements.map((item) => item.id));
      const hypothesisInputs = (Array.isArray(payload.hypotheses) ? payload.hypotheses : []).slice(0, 6).flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as Record<string, unknown>;
        const statement = cleanResearchProblemText(item.statement, 520);
        return statement ? [{ statement, rationale: cleanResearchProblemText(item.rationale, 700), confidence: Math.max(0, Math.min(100, Math.round(Number(item.confidence) || 0))), sourceStatementIds: Array.isArray(item.sourceStatementIds) ? Array.from(new Set(item.sourceStatementIds.map((id) => cleanResearchProblemText(id, 120)).filter((id) => allowedStatementIds.has(id)))).slice(0, 8) : [] }] : [];
      });
      const writes = [
        context.database.prepare(
          `INSERT INTO research_problems (id, space_id, track_id, status, working_language, question, objective, scope,
            success_criteria, stage, model, source_revision, confirmed_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(space_id, track_id) DO UPDATE SET status = 'active', working_language = excluded.working_language,
            question = excluded.question, objective = excluded.objective, scope = excluded.scope,
            success_criteria = excluded.success_criteria, stage = excluded.stage, confirmed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP`,
        ).bind(problemId, spaceId, trackId, payload.workingLanguage === "en" ? "en" : "zh", question, objective, scope,
          successCriteria, researchProblemStage(payload.stage), current.problem?.model || "user-confirmed", current.evidence.synthesisRevision),
        context.database.prepare("DELETE FROM research_problem_hypotheses WHERE problem_id = ?").bind(problemId),
        ...hypothesisInputs.map((item, position) => context.database.prepare(
          `INSERT INTO research_problem_hypotheses (id, problem_id, space_id, track_id, statement, rationale, status,
            confidence, source_statement_ids, position) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
        ).bind(crypto.randomUUID(), problemId, spaceId, trackId, item.statement, item.rationale, item.confidence, JSON.stringify(item.sourceStatementIds), position)),
      ];
      await context.database.batch(writes);
      await context.database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = ?")
        .bind(spaceId, new Date().toISOString().slice(0, 10)).run();
      const saved = await readState(context.database, spaceId, trackId);
      return Response.json({ problemState: { problem: saved.problem, hypotheses: saved.hypotheses, assessment: saved.assessment, actions: saved.actions, evidence: saved.evidence } });
    }

    if (action !== "draft" && action !== "assess") return Response.json({ error: "Unsupported action" }, { status: 400 });
    if (!current.rawSynthesis.statements.length) return Response.json({ error: "Build a grounded cross-paper synthesis before shaping a research problem" }, { status: 422 });
    if (action === "draft" && current.problem?.status === "active") {
      return Response.json({
        error: "The confirmed research problem is protected from automatic rewriting",
        problemState: {
          problem: current.problem,
          hypotheses: current.hypotheses,
          assessment: current.assessment,
          actions: current.actions,
          evidence: current.evidence,
        },
      }, { status: 409 });
    }
    if (action === "assess" && current.problem?.status !== "active") return Response.json({ error: "Confirm the research problem before assessing it" }, { status: 422 });
    if (action === "assess" && current.assessment && !current.assessment.stale) {
      return Response.json({ problemState: { problem: current.problem, hypotheses: current.hypotheses, assessment: current.assessment, actions: current.actions, evidence: current.evidence }, cached: true });
    }
    const credential = resolveDeepSeekCredential(request);
    if (!credential.apiKey) return Response.json({ modelRequired: true, error: "DeepSeek Pro is required" }, { status: 428 });
    const budget = await assertBudget(context.database, context.user.userId);
    const statementIds = new Set(current.rawSynthesis.statements.map((item) => item.id));

    if (action === "draft") {
      const locale = payload.workingLanguage === "en" ? "en" : "zh";
      const llm = await callDeepSeek(
        credential.apiKey,
        "You are Pi Research's evidence-disciplined research-question editor. Turn a broad research direction into one user-reviewable working problem. Never present an AI proposal as a confirmed user belief. Return strict JSON only.",
        [
          `Working language: ${locale === "zh" ? "Chinese" : "English"}. All user-editable fields and hypotheses must use that language.`,
          `Research space: ${context.space.name} — ${context.space.description}`,
          `Direction: ${context.track.title_zh} / ${context.track.title_en}`,
          `Direction scope: ${context.track.summary_zh} / ${context.track.summary_en}`,
          "Return {question,objective,scope,successCriteria,stage,hypotheses:[{statement,rationale,confidence,sourceStatementIds}]}.",
          "stage must be literature|theory|method|experiment|writing. Draft one answerable question, a concrete objective, explicit in/out scope, and an observable success criterion. Propose 2-4 testable hypotheses; label uncertainty in their wording. Use only exact supplied synthesis statement IDs. A source statement can motivate a hypothesis but does not prove the user's hypothesis.",
          `Cross-paper synthesis: ${JSON.stringify(current.rawSynthesis.synthesis)}`,
          `Traceable statements: ${JSON.stringify(current.rawSynthesis.statements)}`,
        ].join("\n"),
        2800,
      );
      const draft = sanitizeResearchProblemDraft(llm.parsed, statementIds);
      const problemId = current.problem?.id || crypto.randomUUID();
      await context.database.batch([
        context.database.prepare(
          `INSERT INTO research_problems (id, space_id, track_id, status, working_language, question, objective, scope,
            success_criteria, stage, model, source_revision) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(space_id, track_id) DO UPDATE SET question = CASE WHEN research_problems.status = 'active' THEN research_problems.question ELSE excluded.question END,
            objective = CASE WHEN research_problems.status = 'active' THEN research_problems.objective ELSE excluded.objective END,
            scope = CASE WHEN research_problems.status = 'active' THEN research_problems.scope ELSE excluded.scope END,
            success_criteria = CASE WHEN research_problems.status = 'active' THEN research_problems.success_criteria ELSE excluded.success_criteria END,
            stage = CASE WHEN research_problems.status = 'active' THEN research_problems.stage ELSE excluded.stage END,
            working_language = CASE WHEN research_problems.status = 'active' THEN research_problems.working_language ELSE excluded.working_language END,
            model = excluded.model, source_revision = excluded.source_revision,
            status = CASE WHEN research_problems.status = 'active' THEN research_problems.status ELSE 'draft' END,
            updated_at = CURRENT_TIMESTAMP`,
        ).bind(problemId, spaceId, trackId, locale, draft.question, draft.objective, draft.scope, draft.successCriteria,
          draft.stage, MODEL, current.evidence.synthesisRevision),
        context.database.prepare("DELETE FROM research_problem_hypotheses WHERE problem_id = ? AND status = 'proposed'").bind(problemId),
        ...draft.hypotheses.map((item, position) => context.database.prepare(
          `INSERT INTO research_problem_hypotheses (id, problem_id, space_id, track_id, statement, rationale, status,
            confidence, source_statement_ids, position) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)`,
        ).bind(crypto.randomUUID(), problemId, spaceId, trackId, item.statement, item.rationale, item.confidence, JSON.stringify(item.sourceStatementIds), position)),
      ]);
      await Promise.all([
        recordUsage(context.database, "research-problem:global", budget.date, llm.usage?.prompt_tokens || 0, llm.usage?.completion_tokens || 0),
        recordUsage(context.database, budget.workspaceScope, budget.date, llm.usage?.prompt_tokens || 0, llm.usage?.completion_tokens || 0),
      ]);
    } else {
      const hypothesisIds = new Set(current.hypotheses.filter((item) => item.status === "confirmed").map((item) => item.id));
      const llm = await callDeepSeek(
        credential.apiKey,
        "You are Pi Research's evidence-disciplined research-progress editor. Assess how new cross-paper evidence affects a user-confirmed problem without silently rewriting the problem or hypotheses. Return strict JSON only.",
        [
          `User-confirmed problem: ${JSON.stringify(current.problem)}`,
          `User-confirmed hypotheses: ${JSON.stringify(current.hypotheses.filter((item) => item.status === "confirmed"))}`,
          "Return {summaryZh,summaryEn,changeZh,changeEn,uncertaintyZh,uncertaintyEn,nextDecisionZh,nextDecisionEn,nextSearchQuery,confidence,sourceStatementIds,hypothesisImpacts:[{hypothesisId,relation,explanationZh,explanationEn,confidence,sourceStatementIds}],actions:[{kind,titleZh,titleEn,rationaleZh,rationaleEn}]}",
          "relation must be supports|challenges|qualifies|method|gap. Use only supplied hypothesis IDs and exact synthesis statement IDs. Treat supports as evidence that shifts confidence, not proof. Distinguish conditional disagreement from contradiction. nextSearchQuery must be one concise English scholarly query that would reduce the decision's most important uncertainty. actions must be 1-3 concrete read|compare|verify|search|decide steps. Never modify the user's confirmed wording.",
          `Current synthesis: ${JSON.stringify(current.rawSynthesis.synthesis)}`,
          `Traceable synthesis statements: ${JSON.stringify(current.rawSynthesis.statements)}`,
        ].join("\n"),
        3600,
      );
      const assessment = sanitizeResearchProblemAssessment(llm.parsed, statementIds, hypothesisIds);
      const assessmentId = crypto.randomUUID();
      await context.database.batch([
        context.database.prepare(
          `INSERT OR IGNORE INTO research_problem_assessments (id, problem_id, space_id, track_id, input_revision,
            summary_zh, summary_en, change_zh, change_en, uncertainty_zh, uncertainty_en, next_decision_zh,
            next_decision_en, next_search_query, hypothesis_impacts_json, source_statement_ids, confidence, model)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(assessmentId, current.problem!.id, spaceId, trackId, current.revision, assessment.summaryZh, assessment.summaryEn,
          assessment.changeZh, assessment.changeEn, assessment.uncertaintyZh, assessment.uncertaintyEn,
          assessment.nextDecisionZh, assessment.nextDecisionEn, assessment.nextSearchQuery,
          JSON.stringify(assessment.hypothesisImpacts), JSON.stringify(assessment.sourceStatementIds), assessment.confidence, MODEL),
        context.database.prepare("UPDATE research_problem_actions SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP WHERE problem_id = ? AND status = 'proposed'").bind(current.problem!.id),
        ...assessment.actions.map((item, position) => context.database.prepare(
          `INSERT INTO research_problem_actions (id, problem_id, assessment_id, space_id, track_id, kind, title_zh,
            title_en, rationale_zh, rationale_en, status, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
        ).bind(crypto.randomUUID(), current.problem!.id, assessmentId, spaceId, trackId, item.kind, item.titleZh,
          item.titleEn, item.rationaleZh, item.rationaleEn, position)),
      ]);
      await context.database.prepare("DELETE FROM monitor_query_plans WHERE space_id = ? AND plan_date = ?")
        .bind(spaceId, new Date().toISOString().slice(0, 10)).run();
      await Promise.all([
        recordUsage(context.database, "research-problem:global", budget.date, llm.usage?.prompt_tokens || 0, llm.usage?.completion_tokens || 0),
        recordUsage(context.database, budget.workspaceScope, budget.date, llm.usage?.prompt_tokens || 0, llm.usage?.completion_tokens || 0),
      ]);
    }
    const saved = await readState(context.database, spaceId, trackId);
    return Response.json({ problemState: { problem: saved.problem, hypotheses: saved.hypotheses, assessment: saved.assessment, actions: saved.actions, evidence: saved.evidence } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update this research problem";
    return Response.json({ error: message }, { status: message.includes("budget") ? 429 : 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const spaceId = cleanResearchProblemText(payload.spaceId, 120);
    const trackId = cleanResearchProblemText(payload.trackId, 120);
    const actionId = cleanResearchProblemText(payload.actionId, 120);
    const status = cleanResearchProblemText(payload.status, 30);
    if (!spaceId || !trackId || !actionId || !["accepted", "done", "dismissed"].includes(status)) return Response.json({ error: "Invalid action update" }, { status: 400 });
    const context = await ownedContext(request, spaceId, trackId);
    if ("error" in context) return context.error;
    const updated = await context.database.prepare(
      `UPDATE research_problem_actions SET status = ?, completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND track_id = ?`,
    ).bind(status, status, actionId, spaceId, trackId).run();
    if (!Number(updated.meta.changes || 0)) return Response.json({ error: "Research action not found" }, { status: 404 });
    const saved = await readState(context.database, spaceId, trackId);
    return Response.json({ problemState: { problem: saved.problem, hypotheses: saved.hypotheses, assessment: saved.assessment, actions: saved.actions, evidence: saved.evidence } });
  } catch {
    return Response.json({ error: "Unable to update this research action" }, { status: 502 });
  }
}
