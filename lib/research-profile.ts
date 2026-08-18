export type ImportSourceKind = "chat" | "published_paper" | "public_project" | "mixed";
export type ImportStatus = "draft" | "confirmed" | "discarded";

export type ProfileSignal = {
  labelZh: string;
  labelEn: string;
  evidenceZh: string;
  evidenceEn: string;
  confidence: number;
};

export type ResearchOpportunity = {
  titleZh: string;
  titleEn: string;
  rationaleZh: string;
  rationaleEn: string;
  startingPointsZh: string[];
  startingPointsEn: string[];
  evidenceFiles: string[];
  confidence: number;
};

export type SourceAssessment = {
  fileName: string;
  documentType: "chat" | "published_paper" | "public_project" | "other";
  relevance: number;
  used: boolean;
  reasonZh: string;
  reasonEn: string;
};

export type ResearchProfileAnalysis = {
  summaryZh: string;
  summaryEn: string;
  primaryDirectionZh: string;
  primaryDirectionEn: string;
  subdirections: ProfileSignal[];
  interests: ProfileSignal[];
  knowledge: ProfileSignal[];
  openQuestions: ProfileSignal[];
  exclusions: ProfileSignal[];
  searchTerms: string[];
  authorsVenues: string[];
  researchOpportunities: ResearchOpportunity[];
  sourceAssessments: SourceAssessment[];
};

export type ResearchImportRecord = {
  id: string;
  spaceId: string;
  sourceKind: ImportSourceKind;
  fileNames: string[];
  status: ImportStatus;
  safetyAttested: boolean;
  analysis: ResearchProfileAnalysis;
  analysisModel: string;
  inputChars: number;
  createdAt: string;
  confirmedAt: string | null;
};
