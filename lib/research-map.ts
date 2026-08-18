export type ResearchTrackRole = "foundation" | "milestone" | "frontier";
export type ResearchDirectionRole = "core" | "support" | "explore";
export type ResearchHeatLevel = "hot" | "rising" | "steady" | "quiet";
export type ResearchTrackBuildStatus = "queued" | "ready";
export type ResearchPaperEdgeKind = "citation" | "semantic" | "path";
export type ResearchPaperNetworkStatus = "idle" | "building" | "ready" | "partial" | "error";

export type ResearchDirectionIntelligence = {
  assessmentZh: string;
  assessmentEn: string;
  opportunityZh: string;
  opportunityEn: string;
  watchSignalZh: string;
  watchSignalEn: string;
  evidenceGapZh: string;
  evidenceGapEn: string;
  nextSearchQuery: string;
  confidence: number;
  evidenceCanonicalIds: string[];
  model: string;
  updatedAt: string | null;
};

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
  intelligence: ResearchDirectionIntelligence | null;
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

export type ResearchPaperEdge = {
  id: string;
  sourcePaperId: string;
  targetPaperId: string;
  kind: ResearchPaperEdgeKind;
  relationKind: string;
  relationshipZh: string;
  relationshipEn: string;
  confidence: number;
  evidenceSource: string;
};

export type ResearchPaperNetworkState = {
  status: ResearchPaperNetworkStatus;
  paperCount: number;
  builtPaperCount: number;
  citationEdgeCount: number;
  semanticEdgeCount: number;
  pathEdgeCount: number;
  model: string;
  sources: string[];
  updatedAt: string | null;
  error: string | null;
};

export type ResearchMapState = {
  tracks: ResearchTrack[];
  edges: ResearchTrackEdge[];
  paperEdges: ResearchPaperEdge[];
  paperNetwork: ResearchPaperNetworkState;
  model: string;
  generated: boolean;
  needsStructure?: boolean;
  buildProgress?: {
    ready: number;
    total: number;
    pendingTrackIds: string[];
  };
  intelligenceProgress?: {
    ready: number;
    total: number;
    pendingTrackIds: string[];
  };
};
