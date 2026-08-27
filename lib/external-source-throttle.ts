type ExternalSourceThrottleContext = {
  database: D1Database;
  sourceKey: string;
  maxRetries?: number;
  maxInlineWaitMs?: number;
  successSpacingMs?: number;
  requestLeaseMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
};

type ExternalSourceThrottleRow = {
  source_key: string;
  failure_count: number;
  next_allowed_at: string | null;
  last_status: number;
  lease_token: string | null;
  lease_expires_at: string | null;
};

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_INLINE_WAIT_MS = 1_500;
const DEFAULT_SUCCESS_SPACING_MS = 400;
const DEFAULT_REQUEST_LEASE_MS = 25_000;
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const sourceGates = new Map<string, Promise<void>>();

export class ExternalSourceCooldownError extends Error {
  readonly sourceKey: string;
  readonly retryAfterSeconds: number;
  readonly lastStatus: number;

  constructor(sourceKey: string, retryAfterSeconds: number, lastStatus = 0) {
    super(`${sourceKey} is cooling down; retry in about ${Math.max(1, retryAfterSeconds)} seconds`);
    this.name = "ExternalSourceCooldownError";
    this.sourceKey = sourceKey;
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    this.lastStatus = Math.max(0, Math.round(lastStatus || 0));
  }
}

function sourceKey(value: string) {
  const normalized = String(value || "").trim().toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) throw new Error("Invalid external source key");
  return normalized;
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function queueSource<T>(key: string, operation: () => Promise<T>) {
  const previous = sourceGates.get(key) || Promise.resolve();
  const result = previous.then(operation, operation);
  const settled = result.then(() => undefined, () => undefined);
  sourceGates.set(key, settled);
  void settled.finally(() => {
    if (sourceGates.get(key) === settled) sourceGates.delete(key);
  });
  return result;
}

function retryAfterMilliseconds(response: Response, failureCount: number, now: number) {
  const value = response.headers.get("retry-after")?.trim() || "";
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_COOLDOWN_MS, Math.max(1_000, seconds * 1_000));
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(MAX_COOLDOWN_MS, Math.max(1_000, date - now));
  }
  return Math.min(60 * 60 * 1_000, 60_000 * (2 ** Math.min(5, Math.max(0, failureCount))));
}

function failureDelayMilliseconds(status: number, failureCount: number, response: Response | null, now: number) {
  if (status === 429 && response) return retryAfterMilliseconds(response, failureCount, now);
  const base = status >= 500 ? 2_000 : 1_000;
  return Math.min(status >= 500 ? 2 * 60_000 : 30_000, base * (2 ** Math.min(6, Math.max(0, failureCount))));
}

async function readThrottle(database: D1Database, key: string) {
  return database.prepare(
    `SELECT source_key, failure_count, next_allowed_at, last_status, lease_token, lease_expires_at
     FROM external_source_throttles WHERE source_key = ? LIMIT 1`,
  ).bind(key).first<ExternalSourceThrottleRow>();
}

async function acquireSourceLease(context: Required<Pick<ExternalSourceThrottleContext,
  "database" | "maxInlineWaitMs" | "successSpacingMs" | "requestLeaseMs" | "now" | "wait">> & { sourceKey: string }) {
  const startedAt = context.now();
  await context.database.prepare(
    `INSERT OR IGNORE INTO external_source_throttles
     (source_key, failure_count, next_allowed_at, last_status, lease_token, lease_expires_at, updated_at)
     VALUES (?, 0, NULL, 0, NULL, NULL, CURRENT_TIMESTAMP)`,
  ).bind(context.sourceKey).run();

  while (true) {
    const now = context.now();
    const row = await readThrottle(context.database, context.sourceKey);
    const blockedUntil = Math.max(timestamp(row?.next_allowed_at), timestamp(row?.lease_expires_at));
    const delay = Math.max(0, blockedUntil - now);
    const remaining = Math.max(0, context.maxInlineWaitMs - (now - startedAt));
    if (delay > remaining) throw new ExternalSourceCooldownError(context.sourceKey, Math.ceil(delay / 1_000), row?.last_status);
    if (delay) {
      await context.wait(delay);
      continue;
    }

    const leaseToken = crypto.randomUUID();
    const nowIso = new Date(now).toISOString();
    const leaseExpiresAt = new Date(now + context.requestLeaseMs).toISOString();
    const acquired = await context.database.prepare(
      `UPDATE external_source_throttles SET lease_token = ?, lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE source_key = ?
        AND (next_allowed_at IS NULL OR next_allowed_at <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    ).bind(leaseToken, leaseExpiresAt, context.sourceKey, nowIso, nowIso).run();
    if ((acquired.meta.changes || 0) === 1) {
      const current = await readThrottle(context.database, context.sourceKey);
      return { leaseToken, failureCount: Math.max(0, Math.round(current?.failure_count || 0)) };
    }
    if (remaining <= 0) {
      const current = await readThrottle(context.database, context.sourceKey);
      const retryAt = Math.max(timestamp(current?.next_allowed_at), timestamp(current?.lease_expires_at), now + 1_000);
      throw new ExternalSourceCooldownError(context.sourceKey, Math.ceil((retryAt - now) / 1_000), current?.last_status);
    }
  }
}

async function completeSourceLease(
  context: Required<Pick<ExternalSourceThrottleContext, "database" | "successSpacingMs" | "now">> & { sourceKey: string },
  leaseToken: string,
  status: number,
  failureCount: number,
  delayMs: number,
) {
  const failed = status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  const nextAllowedAt = new Date(context.now() + Math.max(failed ? 1_000 : context.successSpacingMs, delayMs)).toISOString();
  await context.database.prepare(
    `UPDATE external_source_throttles SET failure_count = ?, next_allowed_at = ?, last_status = ?,
      lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE source_key = ? AND lease_token = ?`,
  ).bind(failed ? failureCount + 1 : 0, nextAllowedAt, status, context.sourceKey, leaseToken).run();
}

export async function fetchExternalSource(
  url: URL | string,
  init: RequestInit,
  context: ExternalSourceThrottleContext,
) {
  const key = sourceKey(context.sourceKey);
  const resolved = {
    database: context.database,
    sourceKey: key,
    maxRetries: Math.max(1, Math.min(3, context.maxRetries ?? DEFAULT_MAX_RETRIES)),
    maxInlineWaitMs: Math.max(0, Math.min(20_000, context.maxInlineWaitMs ?? DEFAULT_MAX_INLINE_WAIT_MS)),
    successSpacingMs: Math.max(100, Math.min(5_000, context.successSpacingMs ?? DEFAULT_SUCCESS_SPACING_MS)),
    requestLeaseMs: Math.max(5_000, Math.min(60_000, context.requestLeaseMs ?? DEFAULT_REQUEST_LEASE_MS)),
    now: context.now || Date.now,
    wait: context.wait || defaultWait,
  };

  return queueSource(key, async () => {
    for (let attempt = 0; attempt < resolved.maxRetries; attempt += 1) {
      const lease = await acquireSourceLease(resolved);
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (error) {
        const delay = failureDelayMilliseconds(0, lease.failureCount, null, resolved.now());
        await completeSourceLease(resolved, lease.leaseToken, 0, lease.failureCount, delay);
        if (attempt + 1 < resolved.maxRetries && delay <= resolved.maxInlineWaitMs) continue;
        throw error;
      }

      if (response.status === 429) {
        const delay = failureDelayMilliseconds(429, lease.failureCount, response, resolved.now());
        await completeSourceLease(resolved, lease.leaseToken, 429, lease.failureCount, delay);
        if (attempt + 1 < resolved.maxRetries && delay <= resolved.maxInlineWaitMs) continue;
        throw new ExternalSourceCooldownError(key, Math.ceil(delay / 1_000), 429);
      }

      if (response.status === 408 || response.status === 425 || response.status >= 500) {
        const delay = failureDelayMilliseconds(response.status, lease.failureCount, response, resolved.now());
        await completeSourceLease(resolved, lease.leaseToken, response.status, lease.failureCount, delay);
        if (attempt + 1 < resolved.maxRetries && delay <= resolved.maxInlineWaitMs) continue;
        return response;
      }

      await completeSourceLease(resolved, lease.leaseToken, response.status, lease.failureCount, resolved.successSpacingMs);
      return response;
    }
    throw new Error(`${key} request failed after bounded retries`);
  });
}
