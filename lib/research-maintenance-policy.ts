/** Retain explicit user decisions; automatic matching is never formal evidence. */
export const routeReviewCurrentSql = `rr.paper_title=p.title AND json_extract(rr.assessment_json,'$.canonicalId')=p.canonical_id AND rr.abstract_text=substr(COALESCE(i.abstract_text,''),1,5000) AND rr.route_title=t.title_en || char(10) || t.title_zh`;
export const routeReviewEligibleSql = `COALESCE(t.monitoring_status,'active')='active'
  AND NOT EXISTS(SELECT 1 FROM research_route_library m WHERE m.track_id=t.id AND m.paper_id=p.id AND m.status='excluded')
  AND NOT EXISTS(SELECT 1 FROM paper_feedback f WHERE f.space_id=p.space_id AND f.paper_id=p.id AND f.feedback='not_relevant')
  AND NOT EXISTS(SELECT 1 FROM research_track_papers tp WHERE tp.track_id=t.id AND tp.space_id=p.space_id AND tp.canonical_id=p.canonical_id AND tp.curation_status='deactivated')`;
export function routeReviewQuestion(titleEn: string, titleZh: string) {
  return `Assess whether this paper contributes directly to this research direction, offers a transferable method/background, or is unrelated. Direction: ${titleEn}\n${titleZh}`.slice(0,1000);
}
export function routeMaintenanceLane(attempts: number) { return attempts % 2 === 0 ? 'graph' : 'route'; }
