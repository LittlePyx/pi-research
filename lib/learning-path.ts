export type LearningStepKind = "prerequisite" | "foundation" | "method" | "frontier" | "project";
export type LearningStepStatus = "pending" | "active" | "completed";
export type LearningResourceSource = "research-map" | "daily-scan" | "research-map+daily-scan";
export type LearningReadingStatus = "unread" | "queued" | "reading" | "read" | "mastered" | "cited";

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
  status: "draft" | "active" | "completed" | "superseded";
  model: string;
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
  model: string;
};
