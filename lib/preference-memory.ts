export type PreferenceLayer = "explicit" | "inferred";

export type PreferenceSignalInput = {
  spaceId: string;
  layer: PreferenceLayer;
  kind: string;
  labelZh: string;
  labelEn: string;
  evidence?: string;
  confidence: number;
  weight?: number;
  sourceType: string;
  sourceId: string;
  expiresAt?: string | null;
};

export type PreferenceSignal = {
  id: string;
  layer: PreferenceLayer;
  kind: string;
  labelZh: string;
  labelEn: string;
  evidence: string;
  confidence: number;
  effectiveConfidence: number;
  sourceType: string;
  observedAt: string;
  expiresAt: string | null;
};

export const FEEDBACK_REASONS = {
  topic_fit: { kind: "topic", zh: "主题正好相关", en: "Strong topic fit", polarity: "positive" },
  method_fit: { kind: "method", zh: "方法值得借鉴", en: "Useful method", polarity: "positive" },
  solves_question: { kind: "question", zh: "回应了我的问题", en: "Addresses my question", polarity: "positive" },
  foundational: { kind: "foundation", zh: "是重要基础工作", en: "Important foundation", polarity: "positive" },
  surprising: { kind: "novelty", zh: "带来新方向或反直觉结果", en: "Surprising new direction", polarity: "positive" },
  topic_drift: { kind: "exclusion", zh: "偏离我的研究范围", en: "Outside my scope", polarity: "negative" },
  too_shallow: { kind: "exclusion", zh: "内容太浅或增量太小", en: "Too shallow or incremental", polarity: "negative" },
  weak_evidence: { kind: "exclusion", zh: "证据或方法不够可靠", en: "Weak evidence or method", polarity: "negative" },
  duplicate_known: { kind: "mastery", zh: "内容有价值，但我已经掌握", en: "Valuable, but already mastered", polarity: "negative" },
  wrong_type: { kind: "exclusion", zh: "不是我需要的论文类型", en: "Wrong kind of paper", polarity: "negative" },
  network_dismissed: { kind: "exclusion", zh: "已在论文网络中忽略", en: "Dismissed from the research network", polarity: "negative" },
} as const;

export type FeedbackReasonCode = keyof typeof FEEDBACK_REASONS;

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function upsertPreferenceSignal(database: D1Database, signal: PreferenceSignalInput) {
  const labelZh = signal.labelZh.trim().slice(0, 240);
  const labelEn = signal.labelEn.trim().slice(0, 320);
  if (!labelZh || !labelEn) return;
  await database.prepare(
    `INSERT INTO research_preference_signals
     (id, space_id, layer, kind, label_zh, label_en, evidence, confidence, weight, source_type, source_id, active, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(space_id, source_type, source_id, kind, label_en) DO UPDATE SET
       layer = excluded.layer, label_zh = excluded.label_zh, evidence = excluded.evidence,
       confidence = excluded.confidence, weight = excluded.weight, active = 1,
       observed_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    crypto.randomUUID(), signal.spaceId, signal.layer, signal.kind, labelZh, labelEn,
    (signal.evidence || "").trim().slice(0, 700), bounded(signal.confidence), bounded(signal.weight ?? signal.confidence),
    signal.sourceType, signal.sourceId.slice(0, 240), signal.expiresAt || null,
  ).run();
}

export async function readPreferenceSignals(database: D1Database, spaceId: string, limit = 40) {
  const result = await database.prepare(
    `SELECT id, layer, kind, label_zh, label_en, evidence, confidence, weight, source_type,
     observed_at, expires_at
     FROM research_preference_signals
     WHERE space_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY CASE layer WHEN 'explicit' THEN 0 ELSE 1 END, confidence DESC, observed_at DESC LIMIT ?`,
  ).bind(spaceId, limit).all<{
    id: string; layer: PreferenceLayer; kind: string; label_zh: string; label_en: string; evidence: string;
    confidence: number; weight: number; source_type: string; observed_at: string; expires_at: string | null;
  }>();
  const now = Date.now();
  return result.results.map((row) => {
    const ageDays = Math.max(0, (now - Date.parse(row.observed_at)) / 86_400_000);
    const decay = row.layer === "explicit" ? Math.max(0.82, 1 - ageDays / 1825) : Math.max(0.45, 1 - ageDays / 540);
    return {
      id: row.id,
      layer: row.layer,
      kind: row.kind,
      labelZh: row.label_zh,
      labelEn: row.label_en,
      evidence: row.evidence,
      confidence: row.confidence,
      effectiveConfidence: bounded(row.confidence * decay * Math.max(0.3, row.weight / 100)),
      sourceType: row.source_type,
      observedAt: row.observed_at,
      expiresAt: row.expires_at,
    } satisfies PreferenceSignal;
  });
}

export async function recordPaperFeedbackSignal(
  database: D1Database,
  spaceId: string,
  paperId: string,
  paperTitle: string,
  reasonCode: FeedbackReasonCode,
  note = "",
) {
  const reason = FEEDBACK_REASONS[reasonCode];
  const positive = reason.polarity === "positive";
  const mastered = reasonCode === "duplicate_known";
  await upsertPreferenceSignal(database, {
    spaceId,
    layer: "explicit",
    kind: reason.kind,
    labelZh: `${positive ? "偏好" : mastered ? "已掌握" : "排除"}：${paperTitle}`,
    labelEn: `${positive ? "Prefer" : mastered ? "Mastered" : "Exclude"}: ${paperTitle}`,
    evidence: `${reason.zh} / ${reason.en}${note.trim() ? ` · ${note.trim()}` : ""}`,
    confidence: 96,
    weight: positive ? 92 : mastered ? 76 : 100,
    sourceType: "paper_feedback",
    sourceId: `${paperId}:${reasonCode}`,
    expiresAt: new Date(Date.now() + 730 * 86_400_000).toISOString(),
  });
}
