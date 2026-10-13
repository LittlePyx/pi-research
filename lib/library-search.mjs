export function librarySearchOptions(params) {
 const offset=Number(params.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid offset');
 const pick=(name,allowed,fallback)=>allowed.includes(params.get(name))?params.get(name):fallback;
 return {offset,q:(params.get('q')||'').trim().slice(0,240),filter:pick('filter',['all','inbox','accepted','dismissed'],'all'),stage:pick('stage',['all','evaluated'],'all'),inbox:pick('inbox',['all','unseen','seen','snoozed'],'all'),sort:pick('sort',['priority','newest','quality'],'priority'),tag:pick('tag',['all','saved','notes'],'all')};
}
export const libraryUserStateSql=`CASE WHEN feedback='not_relevant' THEN 'dismissed'
 WHEN saved=1 OR feedback='relevant' OR reading_status IN ('queued','reading','read','mastered','cited') THEN 'accepted'
 WHEN julianday(snoozed_until)>julianday('now') THEN 'snoozed'
 WHEN opened_at IS NOT NULL OR show_count>0 THEN 'seen' ELSE 'unseen' END`;
export function librarySearchWhere(options,abstractBlockReason='') {
 const conditions=[],values=[];
 if(options.filter==='inbox') {
  conditions.push("(quality_stage IN ('recommended','reviewing') OR saved=1 OR (feedback IS NOT NULL AND feedback<>'') OR reading_status<>'unread') AND user_state NOT IN ('accepted','dismissed')");
  if(options.inbox!=='all'){conditions.push('user_state=?');values.push(options.inbox);}
 }else if(options.filter!=='all'){conditions.push('user_state=?');values.push(options.filter);}
 if(options.stage==='evaluated'){conditions.push("quality_stage IN ('reviewed','reviewing','recommended')");if(abstractBlockReason){conditions.push("NOT (quality_stage='reviewed' AND instr(screening_reason,?)>0)");values.push(abstractBlockReason);}}
 if(options.tag==='saved')conditions.push('saved=1');
 if(options.tag==='notes')conditions.push("length(trim(reading_note))>0");
 if(options.q){conditions.push(`(${['title','authors','venue','doi','summary_zh','summary_en','why_read_zh','why_read_en','reading_note'].map(f=>`instr(lower(COALESCE(${f},'')),lower(?))>0`).join(' OR ')})`);values.push(...Array(9).fill(options.q));}
 return {sql:conditions.length?conditions.join(' AND '):'1=1',values};
}
export function librarySearchOrder(sort) {
 const tie='discovered_at DESC,id ASC';
 if(sort==='newest')return tie;
 if(sort==='quality')return `quality_score DESC,llm_relevance_score DESC,${tie}`;
 return `CASE quality_stage WHEN 'recommended' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'reviewed' THEN 2 WHEN 'discovered' THEN 3 ELSE 4 END,
 CASE user_state WHEN 'unseen' THEN 0 WHEN 'seen' THEN 1 WHEN 'snoozed' THEN 2 WHEN 'accepted' THEN 3 ELSE 4 END,
 llm_relevance_score DESC,CASE WHEN quality_stage='recommended' THEN quality_score ELSE 0 END DESC,COALESCE(first_shown_at,'') ASC,${tie}`;
}
