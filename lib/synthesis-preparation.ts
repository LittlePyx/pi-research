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
