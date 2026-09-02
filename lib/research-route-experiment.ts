export type ResearchRouteExperimentArm = "current" | "shadow";

export const RESEARCH_ROUTE_SHADOW_MAX_ATTEMPTS = 2;
export const RESEARCH_ROUTE_SHADOW_RESULT_LIMIT = 8;

export type ResearchRouteExperimentIdentity = {
  experimentArm: ResearchRouteExperimentArm;
  routeRevisionId: string;
  routeVersion: number;
};

/**
 * The identity is embedded in the durable discovery query key. Candidate
 * queues can therefore recover experiment provenance after an interrupted
 * scan without adding migration-sensitive columns to discovery coverage.
 */
export function researchRouteExperimentPlanKey(
  identity: ResearchRouteExperimentIdentity,
  suffix: string,
) {
  const revisionId = identity.routeRevisionId.trim();
  const routeVersion = Math.max(1, Math.floor(identity.routeVersion));
  const safeSuffix = suffix.trim().replace(/~/g, "-");
  if (!/^[A-Za-z0-9._:-]+$/.test(revisionId) || !safeSuffix) throw new Error("route experiment identity is incomplete");
  const encodedRevisionId = encodeURIComponent(revisionId).replace(/~/g, "%7E");
  return `research-route-version~${identity.experimentArm}~${encodedRevisionId}~${routeVersion}~${safeSuffix}`;
}

export function parseResearchRouteExperimentQueryKey(queryKey: string): ResearchRouteExperimentIdentity | null {
  const planKey = queryKey.split(":", 1)[0];
  const parts = planKey.split("~");
  if (parts.length < 5 || parts[0] !== "research-route-version") return null;
  const experimentArm = parts[1];
  if (experimentArm !== "current" && experimentArm !== "shadow") return null;
  let routeRevisionId = "";
  try {
    routeRevisionId = decodeURIComponent((parts[2] || "").trim());
  } catch {
    return null;
  }
  const routeVersion = Number(parts[3]);
  if (!routeRevisionId || !Number.isInteger(routeVersion) || routeVersion < 1) return null;
  return { experimentArm, routeRevisionId, routeVersion };
}
