/** Navigation carries a short reading focus; the complete question stays in the comparison. */
export function workbookCheckFocus(goal:string,question=''){
  const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
  const pending=clean(question),task=clean(goal);
  return pending ? [pending.slice(0,420),task&&task!==pending?task.slice(0,160):''].filter(Boolean).join(' · ') : task.slice(0,600);
}

/** Appending is explicit and never truncates or replaces an existing judgment. */
export function appendWorkbookResult(current:string,label:string,result:string):string|null{
  const value=result.trim();
  if(!value)return current;
  const block=`${label}\n${value}`;
  if(current.includes(block))return current;
  const next=current?`${current}\n\n${block}`:block;
  return next.length<=4000?next:null;
}
