export type ReviewGateInput = {
  isPaper: boolean;
  requestedRecommendation: boolean;
  relevanceScore: number;
  qualityScore: number;
  summaryZh: string;
  summaryEn: string;
  whyReadZh: string;
  whyReadEn: string;
};

export function passesRecommendationGate(input: ReviewGateInput, relevanceThreshold = 75) {
  return input.isPaper
    && input.requestedRecommendation
    && input.relevanceScore >= relevanceThreshold
    && input.qualityScore >= 65
    && Boolean(input.summaryZh.trim() && input.summaryEn.trim() && input.whyReadZh.trim() && input.whyReadEn.trim());
}
