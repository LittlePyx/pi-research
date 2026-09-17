/** Only current, independently checked recommendations can seed a new route. */
export const START_ELIGIBLE = `i.llm_recommended=1 AND i.analysis_source='deepseek'
 AND i.verification_status IN ('verified','revised') AND length(trim(i.abstract_text))>=120
 AND NOT EXISTS(SELECT 1 FROM paper_feedback f WHERE f.paper_id=p.id AND f.space_id=p.space_id AND f.feedback IN ('not_relevant','later'))
 AND NOT EXISTS(SELECT 1 FROM paper_delivery_state d WHERE d.paper_id=p.id AND d.space_id=p.space_id AND datetime(d.snoozed_until)>CURRENT_TIMESTAMP)`;
export const START_SOURCES_SQL = `SELECT p.id,p.canonical_id AS canonicalId,p.title,
 i.problem_zh AS problemZh,i.problem_en AS problemEn,i.why_read_zh AS reasonZh,i.why_read_en AS reasonEn,
 i.reading_focus_zh AS taskZh,i.reading_focus_en AS taskEn,i.limitations_zh AS limitationZh,i.limitations_en AS limitationEn,
 i.abstract_text AS abstractText,i.updated_at AS updatedAt
 FROM monitored_papers p JOIN paper_insights i ON i.paper_id=p.id AND i.space_id=p.space_id
 WHERE p.space_id=? AND ${START_ELIGIBLE}`;
export type ResearchStartSource = {id:string;canonicalId:string;title:string;problemZh:string;problemEn:string;reasonZh:string;reasonEn:string;taskZh:string;taskEn:string;limitationZh:string;limitationEn:string;abstractText:string;updatedAt:string};
export async function researchStartDigest(value: unknown) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
