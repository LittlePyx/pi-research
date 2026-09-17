export const ROUTE_ROLE_EVIDENCE_PROMPT = `Also return roleEvidence:{role:foundation|milestone|frontier|background,quote,reason}. quote must be 35-900 consecutive characters from the supplied abstract, never the title or stored rationale. Judge relevance separately from stage. Foundation requires a specific original foundational result for this exact direction; milestone requires a specific decisive advance; frontier requires a concrete current result. A survey, general tool, shared Gaussian terminology, or comparing distributions within the Gaussian family does not by itself establish Gaussian extremality over a wider distribution class. Use background for useful surveys or tools without evidenced stage status. Never fill missing stages or defend the assigned role. Missing evidence is not a research gap.`;

export type RoleEvidence = { role: 'foundation'|'milestone'|'frontier'|'background'; quote:string; reason:string };
export const BACKGROUND_ROLE_UPDATE_SQL = `UPDATE research_track_papers SET role='background',rationale_zh=?,rationale_en=?,curation_updated_at=CURRENT_TIMESTAMP
 WHERE id=? AND space_id=? AND role=? AND curation_status='active'
 AND EXISTS(SELECT 1 FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id WHERE p.space_id=research_track_papers.space_id AND p.canonical_id=research_track_papers.canonical_id AND i.abstract_text=?)
 AND title=? AND EXISTS(SELECT 1 FROM research_tracks t WHERE t.id=research_track_papers.track_id AND t.space_id=research_track_papers.space_id AND t.title_en=? AND t.title_zh=? AND t.monitoring_status='active')
 AND NOT EXISTS(SELECT 1 FROM monitor_runs r WHERE r.space_id=research_track_papers.space_id AND r.automation_paused_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM research_map_evidence_proposals ep JOIN monitored_papers p ON p.id=ep.paper_id AND p.space_id=ep.space_id WHERE ep.space_id=research_track_papers.space_id AND ep.track_id=research_track_papers.track_id AND p.canonical_id=research_track_papers.canonical_id AND ep.status='confirmed')`;
export function groundedRouteRole(raw: unknown, abstractText: string): RoleEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const r=raw as Record<string,unknown>;
  if (!['foundation','milestone','frontier','background'].includes(String(r.role)) || typeof r.quote!=='string' || typeof r.reason!=='string') return null;
  const quote=r.quote.trim(),reason=r.reason.trim();
  if(quote.length<35 || quote.length>900 || !abstractText.includes(quote) || reason.length<20 || reason.length>1200)return null;
  return {role:r.role as RoleEvidence['role'],quote,reason};
}
