export type LearningStepKind = "prerequisite" | "foundation" | "method" | "frontier" | "project";
export type LearningStepStatus = "pending" | "active" | "completed";

export type LearningResource = {
  id: string;
  title: string;
  authors: string;
  venue: string;
  url: string;
  publishedAt: string | null;
  trackId: string | null;
};

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
