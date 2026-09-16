export type LibraryPaper = { id:string; canonicalId:string; title:string; authors:string; venue:string; url:string; doi:string|null; publishedAt:string|null; abstractText:string; recommended:number; verified:number; inRoute:number; membership:string|null; category:string|null; graphStatus:string|null; checkedAt:string|null; matchTerms:string[] };
const STOP = new Set('the and for with from into using based study theory analysis approach method methods application applications research information optimal problem problems function functions'.split(' '));
export function routeCatalogTerms(title:string) {
  return [...new Set((title.toLowerCase().match(/[a-z][a-z-]{3,}/g)||[]).filter(w=>!STOP.has(w)).map(w=>w.replace(/s$/, '')))].slice(0,8);
}
export function catalogWhere(spaceId:string, query:string, terms:string[], routeId:string, all:boolean) {
  const bindings: (string|number)[]=[spaceId];
  const clauses=['p.space_id = ?'];
  if(query) { clauses.push("instr(lower(p.title || ' ' || p.authors || ' ' || COALESCE(i.abstract_text,'')), lower(?)) > 0"); bindings.push(query); }
  if(routeId && !all) {
    const matches=terms.map(()=>"CASE WHEN instr(lower(p.title || ' ' || COALESCE(i.abstract_text,'')), ?) > 0 THEN 1 ELSE 0 END");
    clauses.push(`(m.status='included' OR EXISTS(SELECT 1 FROM research_track_papers tp WHERE tp.space_id=p.space_id AND tp.track_id=? AND tp.canonical_id=p.canonical_id AND tp.curation_status='active') OR (COALESCE(m.status,'')!='excluded' AND NOT EXISTS(SELECT 1 FROM research_track_papers tp WHERE tp.space_id=p.space_id AND tp.track_id=? AND tp.canonical_id=p.canonical_id AND tp.curation_status='deactivated') AND NOT EXISTS(SELECT 1 FROM paper_feedback f WHERE f.space_id=p.space_id AND f.paper_id=p.id AND f.feedback='not_relevant') AND (${matches.length?matches.join('+'):'0'}) >= ?))`);
    bindings.push(routeId,routeId,...terms,Math.max(1,Math.min(2,terms.length)));
  }
  return {sql:clauses.join(' AND '),bindings};
}
