export type LearningStepKind = "prerequisite" | "foundation" | "method" | "milestone" | "frontier" | "project";
export type LearningStepStatus = "pending" | "active" | "completed";
export type LearningResourceSource = "research-map" | "daily-scan" | "research-map+daily-scan";
export type LearningReadingStatus = "unread" | "queued" | "reading" | "read" | "mastered" | "cited";
export type LearningEvidenceStatus = "ready" | "searching" | "awaiting_quality" | "retryable" | "degraded" | "insufficient" | "missing";

export const LEARNING_STAGE_ORDER = ["foundation", "method", "milestone", "frontier", "project"] as const;

export type LearningResource = {
  id: string;
  /** Stable scholarly identity. Optional so learning paths saved before V64 remain readable. */
  canonicalId?: string;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  trackId: string | null;
  /** Discovery provenance and review signals are optional for legacy resources. */
  source?: LearningResourceSource;
  qualityScore?: number | null;
  readingStatus?: LearningReadingStatus;
  suggestedMinutes?: number | null;
  /** Formal learning material is admitted only after the shared quality queue has approved it. */
  qualification?: "quality_approved";
  /** Internal stage-specific grounding; never a replacement for shared quality approval. */
  stageEvidence?: import("./learning-stage-match").LearningStageEvidence;
};

export type LearningEvidenceDiscovery = {
  id: string;
  status: "pending" | "running" | "retryable" | "ready" | "empty" | "degraded" | "superseded";
  attemptCount: number;
  queuedCount: number;
  reviewPendingCount: number;
  reviewedCount: number;
  nextRetryAt: string | null;
  updatedAt: string;
};

/**
 * Return a safe, usable original-paper URL for both current and legacy paths.
 * Old saved resources can lack a URL but still carry a DOI canonical ID.
 */
export function learningResourceHref(resource: Pick<LearningResource, "url" | "canonicalId">): string | null {
  const rawUrl = resource.url.trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
    } catch {
      // Fall through to the DOI canonical identity when a legacy URL is invalid.
    }
  }
  const canonicalId = resource.canonicalId?.trim() || "";
  if (!canonicalId.toLocaleLowerCase().startsWith("doi:")) return null;
  const doi = canonicalId.slice(4).trim();
  if (!doi) return null;
  return `https://doi.org/${doi.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

/** A stable title fallback for paths saved before canonical IDs were persisted. */
export function learningResourceTitleKey(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Use the hydrated paper identity; never open another paper just by title. */
export function learningResourcePaperId(resource: Pick<LearningResource, "id">): string | null {
  return resource.id.startsWith("monitor:") ? resource.id.slice("monitor:".length).trim() || null : null;
}

export type LearningPathStep = {
  id: string;
  kind: LearningStepKind;
  titleZh: string;
  titleEn: string;
  goalZh: string;
  goalEn: string;
  whyZh: string;
  whyEn: string;
  readFocusZh: string;
  readFocusEn: string;
  checkpointZh: string;
  checkpointEn: string;
  estimatedMinutes: number;
  status: LearningStepStatus;
  position: number;
  resources: LearningResource[];
  /** Previously attached papers remain accessible without claiming to fill this stage. */
  supplementaryResources?: LearningResource[];
  evidenceStatus: LearningEvidenceStatus;
  evidenceQuery: string;
  discovery: LearningEvidenceDiscovery | null;
  completedAt: string | null;
};

export type LearningPath = {
  id: string;
  target: string;
  /** Null for an all-space path and for paths created before direction-scoped planning. */
  targetTrackId: string | null;
  titleZh: string;
  titleEn: string;
  rationaleZh: string;
  rationaleEn: string;
  status: "draft" | "waiting_evidence" | "active" | "completed" | "superseded";
  model: string;
  parentPathId: string | null;
  revision: number;
  sourceRevision: string;
  estimatedMinutes: number;
  completedSteps: number;
  createdAt: string;
  updatedAt: string;
  steps: LearningPathStep[];
};

export type LearningPathState = {
  path: LearningPath | null;
  suggestedTarget: string;
  availablePaperCount: number;
  waitingQualityCount: number;
  model: string;
};

export function learningEvidenceStatus(input: {
  resourceCount: number;
  discovery: LearningEvidenceDiscovery | null;
}): LearningEvidenceStatus {
  if (input.resourceCount > 0) return "ready";
  const discovery = input.discovery;
  if (!discovery) return "missing";
  if (discovery.status === "pending" || discovery.status === "running") return "searching";
  if (discovery.status === "retryable") return "retryable";
  if (discovery.status === "degraded") return "degraded";
  if (discovery.status === "empty") return "insufficient";
  if (discovery.status === "ready") {
    if (discovery.reviewPendingCount > 0) return "awaiting_quality";
    return discovery.queuedCount > 0 && discovery.reviewedCount === 0 ? "awaiting_quality" : "insufficient";
  }
  return "missing";
}

/** The sequential path cannot advance past the first incomplete stage without visible evidence. */
export function learningPathProgressState(steps: Array<Pick<LearningPathStep, "status" | "resources">>) {
  if (steps.length > 0 && steps.every((step) => step.status === "completed")) {
    return { pathStatus: "completed" as const, activeIndex: -1 };
  }
  const firstOpen = steps.findIndex((step) => step.status !== "completed");
  if (firstOpen < 0 || steps[firstOpen].resources.length === 0) {
    return { pathStatus: "waiting_evidence" as const, activeIndex: -1 };
  }
  return { pathStatus: "active" as const, activeIndex: firstOpen };
}
