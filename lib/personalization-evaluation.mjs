import {createHash} from 'node:crypto';
export const ABLATIONS = ['none','explicit','all'];
export function candidatePoolHash(candidates) {
 return createHash('sha256').update(JSON.stringify(candidates.map(({id,title,abstract})=>({id,title,abstract})).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
}
/** Score externally obtained rankings only. Labels never participate in ranking. */
export function evaluatePersonalization(cases, runs, k=5) {
 if (!Number.isInteger(k)||k<1) throw new Error('k must be a positive integer');
 if (!cases.length) throw new Error('No judgment cases');
 const caseIds=new Set(cases.map(c=>c.id));
 if(caseIds.size!==cases.length)throw new Error('Duplicate judgment cases');
 if(runs.length!==cases.length*3 || runs.some(r=>!caseIds.has(r.caseId)||!ABLATIONS.includes(r.variant)))throw new Error('Require exactly one run for every case and ablation');
 const metrics=[];
 for(const task of cases) {
  if(!task.contextId||!Array.isArray(task.candidates)||!task.candidates.length)throw new Error('Missing frozen context/candidates');
  const candidates=new Map(task.candidates.map(c=>[c.id,c]));
  if(candidates.size!==task.candidates.length||task.candidates.some(c=>!c.id||!Number.isInteger(c.gain)||c.gain<0||c.gain>3||!Array.isArray(c.facets)||typeof c.known!=='boolean'))throw new Error('Invalid or incomplete relevance judgments');
  const poolHash=candidatePoolHash(task.candidates);
  const ideal=task.candidates.map(c=>c.gain).sort((a,b)=>b-a).slice(0,k);
  const dcg=gains=>gains.reduce((sum,gain,i)=>sum+(2**gain-1)/Math.log2(i+2),0);
  const idcg=dcg(ideal);
  const allFacets=new Set(task.candidates.filter(c=>c.gain>0).flatMap(c=>c.facets));
  for(const variant of ABLATIONS) {
   const matching=runs.filter(r=>r.caseId===task.id&&r.variant===variant);
   if(matching.length!==1)throw new Error('Missing or duplicate ablation');
   const run=matching[0];
   if(run.poolHash!==poolHash||run.contextId!==task.contextId)throw new Error('Frozen context or candidate pool mismatch');
   if(!run.model||!run.promptVersion||!run.sourceCommit||!run.observedAt)throw new Error('Missing run provenance');
   if(!Array.isArray(run.ranking)||run.ranking.some(id=>!candidates.has(id))||new Set(run.ranking).size!==run.ranking.length)throw new Error('Unknown or repeated ranked identity');
   for(const key of ['inputTokens','outputTokens','durationMs'])if(run[key]!=null&&(!Number.isFinite(run[key])||run[key]<0))throw new Error('Invalid measured usage');
   const top=run.ranking.slice(0,k).map(id=>candidates.get(id));
   metrics.push({caseId:task.id,variant,precisionAtK:top.filter(c=>c.gain>0).length/k,
    ndcgAtK:idcg?dcg(top.map(c=>c.gain))/idcg:null,
    knownRate:top.length?top.filter(c=>c.known).length/top.length:null,
    facetCoverage:allFacets.size?new Set(top.filter(c=>c.gain>0).flatMap(c=>c.facets)).size/allFacets.size:null,
    returned:top.length,k,inputTokens:run.inputTokens??null,outputTokens:run.outputTokens??null,durationMs:run.durationMs??null});
  }
  const peers=runs.filter(r=>r.caseId===task.id);
  if(new Set(peers.map(r=>r.model+'|'+r.promptVersion+'|'+r.sourceCommit)).size!==1)throw new Error('Model, prompt and source must be controlled within each case');
 }
 return {status:'scored-recorded-runs',metrics,limitation:'Descriptive paired results only; no causal or population-level gain claim. Relevance labels require independent domain review.'};
}
