export type SynthesisPreparationPaper = {
  id: string; title: string; url: string; confirmed: number; selected: number; grounded: number;
};

export function synthesisPreparation(papers: SynthesisPreparationPaper[], eligibleIds: Set<string>) {
  return papers.map(paper => ({
    id: paper.id, title: paper.title, url: paper.url,
    state: eligibleIds.has(paper.id) ? "ready" as const
      : !paper.confirmed && !paper.selected ? "needs_confirmation" as const
      : "needs_evidence" as const,
    hasGroundedEvidence: Boolean(paper.grounded),
  }));
}

export function preparationReviewState(state: string, reviewStage?: string) {
  if (state === "ready") return state;
  if (reviewStage === "awaiting_evidence") return "awaiting_abstract";
  if (reviewStage === "reviewed") return "not_selected";
  if (reviewStage === "queued") return "awaiting_review";
  if (reviewStage === "reviewing") return "reviewing";
  return state;
}
