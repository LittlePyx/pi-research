export type ResearchTrackRole = "foundation" | "milestone" | "frontier";
export type ResearchDirectionRole = "core" | "support" | "explore";
export type ResearchHeatLevel = "hot" | "rising" | "steady" | "quiet";
export type ResearchTrackBuildStatus = "queued" | "ready";

export type ResearchTrackPaper = {
  id: string;
  canonicalId: string;
  doi: string | null;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  citationCount: number;
  role: ResearchTrackRole;
  summaryZh: string;
  summaryEn: string;
  rationaleZh: string;
  rationaleEn: string;
  position: number;
};

export type ResearchTrack = {
  id: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  expansionCount: number;
  userRole: ResearchDirectionRole;
  depthScore: number;
  supportScore: number;
  interactionScore: number;
  heatScore: number;
  heatLevel: ResearchHeatLevel;
  recentPaperCount: number;
  buildStatus: ResearchTrackBuildStatus;
  updatedAt: string;
  papers: ResearchTrackPaper[];
};

export type ResearchTrackEdge = {
  id: string;
  sourceTrackId: string;
  targetTrackId: string;
  kind: "builds_on" | "bridges" | "supports";
  relationshipZh: string;
  relationshipEn: string;
  strength: number;
};

export type ResearchMapState = {
  tracks: ResearchTrack[];
  edges: ResearchTrackEdge[];
  model: string;
  generated: boolean;
  needsStructure?: boolean;
  buildProgress?: {
    ready: number;
    total: number;
    pendingTrackIds: string[];
  };
};
