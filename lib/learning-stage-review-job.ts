import { stageReviewKey, stageReviewPapers, stageReviewPrompt, validateStageReview, type StageReviewInput } from "./learning-stage-review.ts";

/** Continue beyond cached negative batches, with at most one new model request per turn. */
export async function reviewLearningStageBatches(options: Parameters<typeof reviewLearningStage>[0]) {
  const papers = stageReviewPapers(options.input, options.input.candidates.length);
  for (let offset = 0; offset < papers.length; offset += 8) {
    const input = { ...options.input, candidates: papers.slice(offset, offset + 8) };
    let attempted = false;
    const result = await reviewLearningStage({ ...options, input, judge: async prompt => {
      attempted = true;
      return options.judge(prompt);
    } });
    if (attempted || result.status !== "valid" || result.assignments.length) return { ...result, input };
  }
  return { status: "empty" as const, assignments: [], key: "", input: options.input };
}

/** A durable single-flight judgement. No credentials or model error bodies are stored. */
export async function reviewLearningStage(options: {
  database: D1Database; spaceId: string; input: StageReviewInput;
  judge: (prompt: ReturnType<typeof stageReviewPrompt>) => Promise<unknown>;
  now?: number;
}) {
  const { database, spaceId, input, judge } = options;
  const key = await stageReviewKey(input);
  const id = `${spaceId}:${key}`;
  if (!stageReviewPapers(input).length) return { status: "empty" as const, key, assignments: [] };
  const now = options.now ?? Date.now();
  await database.prepare(`INSERT OR IGNORE INTO learning_stage_reviews (id, space_id, path_id, step_id)
    VALUES (?, ?, ?, ?)`).bind(id, spaceId, input.pathId, input.stepId).run();
  const row = await database.prepare("SELECT status, result_json FROM learning_stage_reviews WHERE id = ? AND space_id = ?")
    .bind(id, spaceId).first<{ status: string; result_json: string }>();
  if (row?.status === "complete") {
    try { return { ...await validateStageReview(input, key, JSON.parse(row.result_json)), key }; }
    catch { return { status: "invalid" as const, key, assignments: [] }; }
  }
  const token = crypto.randomUUID();
  const claimed = await database.prepare(`UPDATE learning_stage_reviews SET status = 'running', lock_token = ?, lease_until = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND space_id = ? AND status != 'complete' AND lease_until <= ? AND retry_at <= ?`)
    .bind(token, now + 150_000, id, spaceId, now, now).run();
  if (!claimed.meta.changes) return { status: "waiting" as const, key, assignments: [] };
  try {
    const raw = await judge(stageReviewPrompt(input));
    const checked = await validateStageReview(input, key, raw);
    if (checked.status !== "valid") throw new Error("invalid_stage_review");
    // Only retain validated excerpts/reasons, not arbitrary model output.
    const primary = new Map(checked.assignments.map(item => [item.canonicalId, item.evidence]));
    const sanitized = { decisions: stageReviewPapers(input).map(paper => ({ canonicalId: paper.canonicalId,
      ...(primary.get(paper.canonicalId) || { role: "unsuitable" }) })) };
    const saved = await database.prepare(`UPDATE learning_stage_reviews SET status = 'complete', result_json = ?, lock_token = NULL,
      lease_until = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND lock_token = ?`)
      .bind(JSON.stringify(sanitized), id, spaceId, token).run();
    if (!saved.meta.changes) return { status: "stale" as const, key, assignments: [] };
    return { ...checked, key };
  } catch {
    await database.prepare(`UPDATE learning_stage_reviews SET status = 'retryable', lock_token = NULL, lease_until = 0,
      retry_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ? AND lock_token = ?`)
      .bind(now + 300_000, id, spaceId, token).run();
    return { status: "retryable" as const, key, assignments: [] };
  }
}
