import { getRuntimeEnv } from "../db/repository";
import { reserveSemanticScholarUsage } from "./semantic-scholar-quota";

type SemanticScholarContext = {
  database: D1Database;
  spaceId: string;
  scopeKey: string;
  feature?: string;
  featureDailyLimit?: number;
  spaceDailyLimit?: number;
  totalDailyLimit?: number;
  maxRetries?: number;
  maxInlineWaitMs?: number;
};

type ThrottleRow = { scope_key: string; failure_count: number; next_allowed_at: string | null };

const DEFAULT_TOTAL_DAILY_LIMIT = 180;
const DEFAULT_SPACE_DAILY_LIMIT = 120;
const DEFAULT_RETRIES = 3;
const DEFAULT_MAX_INLINE_WAIT_MS = 8_000;
const SUCCESS_SPACING_MS = 1_150;

let semanticScholarGate: Promise<void> = Promise.resolve();

export class SemanticScholarRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Semantic Scholar is cooling down; retry in about ${Math.max(1, retryAfterSeconds)} seconds`);
    this.name = "SemanticScholarRateLimitError";
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export class SemanticScholarQuotaError extends Error {
  constructor() {
    super("Semantic Scholar request budget is exhausted for today; cached verified results are still available");
    this.name = "SemanticScholarQuotaError";
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function queueSemanticScholar<T>(operation: () => Promise<T>) {
  const result = semanticScholarGate.then(operation, operation);
  semanticScholarGate = result.then(() => undefined, () => undefined);
  return result;
}

function throttleScopeKeys(context: SemanticScholarContext) {
  return [
    "semantic-scholar:global",
    `semantic-scholar:space:${context.spaceId}`,
    `semantic-scholar:scope:${context.spaceId}:${context.scopeKey.slice(0, 180)}`,
  ];
}

function retryAfterMilliseconds(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after")?.trim() || "";
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(500, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(500, date - Date.now());
  }
  const exponential = Math.min(30_000, 1_200 * (2 ** attempt));
  return exponential + Math.round(Math.random() * 350);
}

async function throttleRows(database: D1Database, scopeKeys: string[]) {
  const placeholders = scopeKeys.map(() => "?").join(",");
  return database.prepare(
    `SELECT scope_key, failure_count, next_allowed_at FROM semantic_scholar_throttles WHERE scope_key IN (${placeholders})`,
  ).bind(...scopeKeys).all<ThrottleRow>();
}

async function waitForThrottle(context: SemanticScholarContext, scopeKeys: string[], maximumWaitMs = context.maxInlineWaitMs ?? DEFAULT_MAX_INLINE_WAIT_MS) {
  const rows = await throttleRows(context.database, scopeKeys);
  const nextAllowed = Math.max(0, ...rows.results.map((row) => row.next_allowed_at ? Date.parse(row.next_allowed_at) : 0));
  const delay = Math.max(0, nextAllowed - Date.now());
  if (delay > maximumWaitMs) throw new SemanticScholarRateLimitError(Math.ceil(delay / 1000));
  if (delay) await wait(delay);
}

async function acquireThrottleLease(context: SemanticScholarContext, scopeKeys: string[]) {
  const startedAt = Date.now();
  const maximumWaitMs = context.maxInlineWaitMs ?? DEFAULT_MAX_INLINE_WAIT_MS;
  const globalScope = scopeKeys[0];
  await context.database.prepare(
    `INSERT OR IGNORE INTO semantic_scholar_throttles
     (id, scope_key, failure_count, next_allowed_at, last_status, updated_at)
     VALUES (?, ?, 0, NULL, 0, CURRENT_TIMESTAMP)`,
  ).bind(crypto.randomUUID(), globalScope).run();

  while (true) {
    const remainingWait = Math.max(0, maximumWaitMs - (Date.now() - startedAt));
    await waitForThrottle(context, scopeKeys, remainingWait);
    const now = new Date().toISOString();
    const reservedUntil = new Date(Date.now() + SUCCESS_SPACING_MS).toISOString();
    const reservation = await context.database.prepare(
      `UPDATE semantic_scholar_throttles SET next_allowed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE scope_key = ? AND (next_allowed_at IS NULL OR next_allowed_at <= ?)`,
    ).bind(reservedUntil, globalScope, now).run();
    if ((reservation.meta.changes || 0) === 1) return;

    const row = await context.database.prepare(
      "SELECT next_allowed_at FROM semantic_scholar_throttles WHERE scope_key = ? LIMIT 1",
    ).bind(globalScope).first<{ next_allowed_at: string | null }>();
    const delay = Math.max(50, (row?.next_allowed_at ? Date.parse(row.next_allowed_at) : Date.now() + SUCCESS_SPACING_MS) - Date.now());
    const remainingAfterContention = Math.max(0, maximumWaitMs - (Date.now() - startedAt));
    if (delay > remainingAfterContention) throw new SemanticScholarRateLimitError(Math.ceil(delay / 1000));
    await wait(delay);
  }
}

async function consumeUsage(context: SemanticScholarContext) {
  const date = new Date().toISOString().slice(0, 10);
  const totalScope = "semantic-scholar-external:global";
  const spaceScope = `semantic-scholar-space:${context.spaceId}`;
  const featureScope = context.feature ? `semantic-scholar-feature:${context.feature}:${context.spaceId}` : "";
  const reserved = await reserveSemanticScholarUsage(context.database, [
    { scope: totalScope, limit: context.totalDailyLimit ?? DEFAULT_TOTAL_DAILY_LIMIT },
    { scope: spaceScope, limit: context.spaceDailyLimit ?? DEFAULT_SPACE_DAILY_LIMIT },
    ...(featureScope && context.featureDailyLimit ? [{ scope: featureScope, limit: context.featureDailyLimit }] : []),
  ], date);
  if (!reserved) throw new SemanticScholarQuotaError();
}

async function writeThrottle(context: SemanticScholarContext, scopeKeys: string[], status: number, delayMs: number, failed: boolean) {
  const nextAllowedAt = new Date(Date.now() + Math.max(delayMs, failed ? 1_000 : SUCCESS_SPACING_MS)).toISOString();
  await context.database.batch(scopeKeys.map((scopeKey) => context.database.prepare(
    `INSERT INTO semantic_scholar_throttles (id, scope_key, failure_count, next_allowed_at, last_status, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(scope_key) DO UPDATE SET
     failure_count = ${failed ? "failure_count + 1" : "CASE WHEN next_allowed_at IS NULL OR next_allowed_at <= excluded.next_allowed_at THEN 0 ELSE failure_count END"},
     next_allowed_at = CASE WHEN next_allowed_at IS NULL OR next_allowed_at < excluded.next_allowed_at
       THEN excluded.next_allowed_at ELSE next_allowed_at END,
     last_status = excluded.last_status, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), scopeKey, failed ? 1 : 0, nextAllowedAt, status)));
}

function headers(init: RequestInit) {
  const values = new Headers({
    Accept: "application/json",
    "User-Agent": "PiResearch/1.0 (mailto:pi-research@qiudao-pika.chatgpt.site)",
  });
  const key = String(getRuntimeEnv().SEMANTIC_SCHOLAR_API_KEY || "").trim();
  if (key) values.set("x-api-key", key);
  if (init.body) values.set("Content-Type", "application/json");
  new Headers(init.headers).forEach((value, name) => values.set(name, value));
  return values;
}

export async function fetchSemanticScholar(url: URL, init: RequestInit, context: SemanticScholarContext) {
  const scopeKeys = throttleScopeKeys(context);
  const maxAttempts = Math.max(1, Math.min(4, context.maxRetries ?? DEFAULT_RETRIES));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptResult = await queueSemanticScholar(async () => {
      // Reserve the global host slot with a conditional D1 update. This is the
      // cross-isolate guard; the in-memory queue only serializes one isolate.
      await acquireThrottleLease(context, scopeKeys);
      await consumeUsage(context);
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: headers(init),
          signal: init.signal || AbortSignal.timeout(22_000),
        });
      } catch (error) {
        await writeThrottle(context, scopeKeys, 0, Math.min(4_000, 400 * (2 ** attempt)), true);
        throw error;
      }
      if (response.status === 429) {
        const delay = retryAfterMilliseconds(response, attempt);
        await writeThrottle(context, scopeKeys, 429, delay, true);
        return { response, delay };
      }
      if (response.status >= 500) {
        const delay = Math.min(4_000, 400 * (2 ** attempt));
        await writeThrottle(context, scopeKeys, response.status, delay, true);
        return { response, delay };
      }
      await writeThrottle(context, scopeKeys, response.status, SUCCESS_SPACING_MS, false);
      return { response, delay: 0 };
    });
    const { response } = attemptResult;
    if (response.status === 429) {
      const delay = attemptResult.delay;
      if (attempt + 1 >= maxAttempts || delay > (context.maxInlineWaitMs ?? DEFAULT_MAX_INLINE_WAIT_MS)) {
        throw new SemanticScholarRateLimitError(Math.ceil(delay / 1000));
      }
      continue;
    }
    if (response.status >= 500 && attempt + 1 < maxAttempts) {
      continue;
    }
    return response;
  }
  throw new Error("Semantic Scholar request failed after retries");
}
