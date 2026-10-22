/** Navigation carries a short reading focus; the complete question stays in the comparison. */
export function workbookCheckFocus(goal:string,question=''){
  const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
  const pending=clean(question),task=clean(goal);
  return pending ? [pending.slice(0,420),task&&task!==pending?task.slice(0,160):''].filter(Boolean).join(' · ') : task.slice(0,600);
}

const containsResult=(current:string,labels:string[],result:string)=>Boolean(result.trim())&&labels.some(label=>{
  const block=`${label}\n${result.trim()}`;
  return current===block||current.startsWith(block+'\n\n')||current.endsWith('\n\n'+block)||current.includes('\n\n'+block+'\n\n');
});

/** A local removal must stay editable even when the saved judgment still contains the result. */
export function workbookResultState(current:string,saved:string,labels:string[],result:string){
  return !containsResult(current,labels,result)?'available':containsResult(saved,labels,result)?'saved':'draft';
}

/** Appending is explicit and never truncates or replaces an existing judgment. Both interface languages identify the same record. */
export function appendWorkbookResult(current:string,label:string|string[],result:string):string|null{
  const value=result.trim();
  if(!value)return current;
  const labels=Array.isArray(label)?label:[label];
  if(containsResult(current,labels,value))return current;
  const block=`${labels[0]}\n${value}`;
  const next=current?`${current}\n\n${block}`:block;
  return next.length<=4000?next:null;
}
