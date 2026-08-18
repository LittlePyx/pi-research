import { ensureSchema, getDatabase } from "./repository";

export type ShareKind = "daily" | "paper";
export type ShareLocale = "zh" | "en";

export type SharePaper = {
  id: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  horizon: "days" | "months" | "years";
  citationCount: number;
  relevanceScore: number;
  summaryZh: string;
  summaryEn: string;
  whyReadZh: string;
  whyReadEn: string;
  qualityScore: number;
  priorityVenue: boolean;
};

export type ShareSnapshotPayload = {
  version: 1;
  kind: ShareKind;
  locale: ShareLocale;
  spaceName: string;
  createdAt: string;
  papers: SharePaper[];
};

export type ShareSnapshot = {
  token: string;
  kind: ShareKind;
  locale: ShareLocale;
  title: string;
  payload: ShareSnapshotPayload;
  createdAt: string;
};

type ShareRow = {
  token: string;
  kind: string;
  locale: string;
  title: string;
  payload: string;
  created_at: string;
};

function isSnapshotPayload(value: unknown): value is ShareSnapshotPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ShareSnapshotPayload>;
  return payload.version === 1
    && (payload.kind === "daily" || payload.kind === "paper")
    && (payload.locale === "zh" || payload.locale === "en")
    && typeof payload.spaceName === "string"
    && typeof payload.createdAt === "string"
    && Array.isArray(payload.papers)
    && payload.papers.length > 0;
}

export async function getShareSnapshot(token: string): Promise<ShareSnapshot | null> {
  if (!/^[a-zA-Z0-9_-]{24,64}$/.test(token)) return null;
  const database = getDatabase();
  await ensureSchema(database);
  const row = await database
    .prepare("SELECT token, kind, locale, title, payload, created_at FROM share_snapshots WHERE token = ?")
    .bind(token)
    .first<ShareRow>();
  if (!row || (row.kind !== "daily" && row.kind !== "paper") || (row.locale !== "zh" && row.locale !== "en")) return null;

  try {
    const payload: unknown = JSON.parse(row.payload);
    if (!isSnapshotPayload(payload)) return null;
    return {
      token: row.token,
      kind: row.kind,
      locale: row.locale,
      title: row.title,
      payload,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}
