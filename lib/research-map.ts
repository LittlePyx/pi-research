export type ResearchTrackRole = "foundation" | "milestone" | "frontier";

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
  updatedAt: string;
  papers: ResearchTrackPaper[];
};

export type ResearchMapState = {
  tracks: ResearchTrack[];
  model: string;
  generated: boolean;
};
