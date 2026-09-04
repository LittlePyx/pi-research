import type { LearningPath } from "./learning-path";
import { claimResearchGapDiscovery, completeResearchGapDiscovery, supersedeResearchGapDiscovery } from "./research-gap-discovery.ts";

/** One current-path job per request; scheduled workers use the same durable lease. */
export async function advanceLearningDiscovery(input: {
  database: D1Database;
  spaceId: string;
  path: LearningPath;
  unboundedRetries: boolean;
  dispatch: (body: { spaceId: string; trackId: string; action: "expand-auto-gap"; gapJobId: string; gapJobToken: string }) => Promise<Response>;
}) {
  const step = input.path.steps.find((step) => step.status !== "completed" && !step.resources.length && step.discovery
    && ["pending", "retryable", "running"].includes(step.discovery.status));
  if (!step?.discovery) return { attempted: false };
  const claim = await claimResearchGapDiscovery(input.database, new Date(), input.unboundedRetries,
    step.discovery.status === "running" ? "stalled" : "due",
    { spaceId: input.spaceId, pathId: input.path.id, jobId: step.discovery.id });
  if (!claim) return { attempted: false };
  try {
    const response = await input.dispatch({ spaceId: claim.spaceId, trackId: claim.trackId, action: "expand-auto-gap", gapJobId: claim.id, gapJobToken: claim.lockToken });
    const state = await response.json() as {
      automaticGapSuperseded?: boolean; reviewQueuedCount?: number; discoveredRouteCandidateCount?: number;
      routeSourceStatuses?: Array<{ status?: string }>;
    };
    if (state.automaticGapSuperseded) {
      await supersedeResearchGapDiscovery(input.database, { id: claim.id, lockToken: claim.lockToken, error: "signal_superseded" });
      return { attempted: true, status: "superseded" };
    }
    const sources = state.routeSourceStatuses || [];
    const degraded = !response.ok || sources.some((source) => source.status === "failed");
    const completion = await completeResearchGapDiscovery(input.database, {
      id: claim.id, lockToken: claim.lockToken, degraded,
      discoveredCount: state.discoveredRouteCandidateCount || 0, queuedCount: state.reviewQueuedCount || 0,
      sourceStatuses: sources, unboundedRetries: input.unboundedRetries,
      error: !response.ok ? `learning_discovery_http_${response.status}` : degraded ? "source_unavailable" : undefined,
    });
    return { attempted: true, status: completion.status, queuedCount: Math.max(0, state.reviewQueuedCount || 0) };
  } catch {
    const completion = await completeResearchGapDiscovery(input.database, {
      id: claim.id, lockToken: claim.lockToken, degraded: true, queuedCount: 0,
      sourceStatuses: [], error: "learning_discovery_unavailable", unboundedRetries: input.unboundedRetries,
    });
    return { attempted: true, status: completion.status };
  }
}
