import { routeVerifiedAbstractClaims } from "./verified-abstract-claims";

export type SourceClaimRow = {
  claim_id: string;
  paper_id: string;
  canonical_id: string;
  title: string;
  authors: string;
  venue: string;
  published_at: string | null;
  claim_kind: string;
  claim_zh: string;
  claim_en: string;
  evidence_quote: string;
  section_label: string;
  locator: string;
  source_url: string;
  confidence: number;
  evidence_level: "metadata" | "abstract" | "fulltext";
  text_hash: string;
};

export async function sourceClaims(database: D1Database, spaceId: string, trackId: string) {
  const result = await database.prepare(
    `SELECT DISTINCT claim.id AS claim_id, paper.id AS paper_id, paper.canonical_id, paper.title, paper.authors,
      paper.venue, paper.published_at, claim.kind AS claim_kind, claim.claim_zh, claim.claim_en,
      claim.evidence_quote, claim.section_label, claim.locator, claim.source_url, claim.confidence,
      document.evidence_level, document.text_hash
     FROM paper_evidence_claims claim
     JOIN paper_evidence_documents document ON document.id = claim.document_id AND document.space_id = claim.space_id
     JOIN monitored_papers paper ON paper.id = claim.paper_id AND paper.space_id = claim.space_id
     WHERE claim.space_id = ? AND claim.grounded = 1 AND document.status IN ('ready', 'partial')
      AND (
       EXISTS (SELECT 1 FROM research_map_evidence_proposals proposal
        WHERE proposal.space_id = claim.space_id AND proposal.paper_id = claim.paper_id
         AND proposal.track_id = ? AND proposal.status = 'confirmed')
       OR (
        EXISTS (SELECT 1 FROM research_track_papers route_paper
         WHERE route_paper.space_id = claim.space_id AND route_paper.track_id = ?
          AND route_paper.curation_status = 'active'
          AND (route_paper.canonical_id = paper.canonical_id
           OR (COALESCE(route_paper.doi, '') != '' AND lower(route_paper.doi) = lower(COALESCE(paper.doi, '')))
           OR lower(trim(route_paper.title)) = lower(trim(paper.title))))
        AND (
         EXISTS (SELECT 1 FROM paper_feedback feedback WHERE feedback.space_id = claim.space_id
          AND feedback.paper_id = claim.paper_id AND (feedback.saved = 1 OR feedback.feedback = 'relevant'))
         OR EXISTS (SELECT 1 FROM paper_reading_progress progress WHERE progress.space_id = claim.space_id
          AND progress.paper_id = claim.paper_id AND progress.status IN ('reading','read','mastered','cited'))
        )
       )
      )
     ORDER BY CASE document.evidence_level WHEN 'fulltext' THEN 0 ELSE 1 END,
      paper.published_at DESC, claim.position LIMIT 40`,
  ).bind(spaceId, trackId, trackId).all<SourceClaimRow>();
  const audited = await routeVerifiedAbstractClaims(database, spaceId, trackId);
  const auditedPapers = new Set(audited.map(c => c.paper_id));
  return [...audited, ...result.results.filter(c => !auditedPapers.has(c.paper_id))];
}

