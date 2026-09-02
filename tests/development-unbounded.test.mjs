import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { developmentUnboundedEnabled, retryAttemptAllowed } from "../lib/development-policy.mjs";
import {
  RESEARCH_TRACK_CLASSIC_RESCUE_ATTEMPT,
  scheduledResearchRouteRetrySql,
} from "../lib/research-map-reliability.ts";

test("development retry policy removes total caps while production remains bounded", () => {
  assert.equal(developmentUnboundedEnabled("true"), true);
  assert.equal(developmentUnboundedEnabled("unbounded"), true);
  assert.equal(developmentUnboundedEnabled("false"), false);
  assert.equal(retryAttemptAllowed({ unbounded: true, attemptCount: 10_000, maximumAttempts: 3 }), true);
  assert.equal(retryAttemptAllowed({ unbounded: false, attemptCount: 3, maximumAttempts: 3 }), false);

  const boundedSql = scheduledResearchRouteRetrySql(false);
  const unboundedSql = scheduledResearchRouteRetrySql(true);
  assert.match(boundedSql, new RegExp(`build_attempt_count < ${RESEARCH_TRACK_CLASSIC_RESCUE_ATTEMPT}`));
  assert.doesNotMatch(unboundedSql, /track\.build_attempt_count < 3\s+AND track\.build_status/);
  assert.match(unboundedSql, /datetime\(track\.build_retry_at\) <= CURRENT_TIMESTAMP/);
});

test("development flag is wired through model budgets, route retries, gap retries, and source quotas", async () => {
  const [monitor, researchMap, gaps, semanticScholar, worker] = await Promise.all([
    readFile(new URL("../app/api/monitor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-gap-discovery.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/semantic-scholar.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /developmentAnalysisUnbounded\(\)[\s\S]*?unlimited: true/);
  assert.match(monitor, /!developmentAnalysisUnbounded\(\) && \(globalCount/);
  assert.match(monitor, /developmentAnalysisUnbounded\(\) && trigger === "manual"/);
  assert.match(monitor, /developmentAnalysisUnbounded\(\)[\s\S]*?delete previousWork\.draftRegenerationAttempts/);
  assert.match(researchMap, /unboundedRetries: unboundedDevelopmentRetries\(\)/);
  assert.match(gaps, /!input\.unboundedRetries && current\.attempt_count >= RESEARCH_GAP_DISCOVERY_MAX_ATTEMPTS/);
  assert.match(semanticScholar, /developmentUnboundedEnabled\(getRuntimeEnv\(\)\.PI_DEVELOPMENT_UNBOUNDED\)/);
  assert.match(worker, /claimResearchGapDiscovery\(env\.DB, new Date\(\), unboundedRetries\)/);
  assert.match(worker, /recordResearchRouteSentinel\(env\.DB, selected\.id, developmentUnboundedEnabled/);
});
