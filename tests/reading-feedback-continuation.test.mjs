import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {readingQueueExclusions,nextReadingPaperId} from '../lib/today-presentation.mjs';

const app=readFileSync(new URL('../app/research-app.tsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('  const saveFeedback ='),app.indexOf('  const openRecommendationMemory ='));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 let resolve;
 const paper={id:'first',title:'First paper',userState:'seen',readingStatus:'unread',readingNote:'Original note',saved:false,feedback:null};
 const state={monitor:{papers:[paper,{...paper,id:'second'}],historyPapers:[paper,{...paper,id:'second'}]},selected:null,receipt:null,saved:{}};
 const ref={current:false},space={current:'a'};
 const update=(key,value)=>{state[key]=typeof value==='function'?value(state[key]):value};
 const scope={activeSpace:{id:'a'},saved:state.saved,locale:'en',feedbackSaving:ref,paperNetworkSpaceRef:space,
  document:{querySelectorAll:()=>[]},setFeedbackBusy:()=>{},setFeedbackReceipt:v=>update('receipt',v),setToast:()=>{},
  setSaved:v=>update('saved',v),setSelectedMonitorPaper:v=>update('selected',v),setMonitor:v=>update('monitor',v),
  setFeedbackPrompt:()=>{},setFeedbackNote:()=>{},historyCountsFor:()=>({}),feedbackEffectCopy:()=> 'Saved',
  fetch:(_url,options)=>options?new Promise(r=>{resolve=r}):Promise.resolve(Response.json({})),
 };
 const save=new Function(...Object.keys(scope),compiled+'\nreturn saveFeedback;')(...Object.values(scope));
 return {state,space,save,paper,async finish(status=200){resolve(Response.json({ok:status===200},{status}));await new Promise(r=>setImmediate(r));assert.equal(ref.current,false)}};
}

for(const kind of ['not_relevant','later'])test(`Persisted ${kind} updates reading continuation only after successful feedback`,async()=>{
 const h=harness();h.save(h.paper,kind);
 assert.deepEqual(readingQueueExclusions(h.state.monitor.historyPapers),[],'pending writes do not hide papers');
 await h.finish();
 const excluded=readingQueueExclusions(h.state.monitor.historyPapers);
 assert.deepEqual(excluded,['first']);
 assert.equal(nextReadingPaperId(['first','second'],[],excluded),'second');
 assert.equal(h.state.monitor.historyPapers[0].readingNote,'Original note');
});

test('Failed or late cross-space feedback cannot change the current reading queue',async()=>{
 for(const switched of [false,true]){
  const h=harness(),before=structuredClone(h.state.monitor);
  h.save(h.paper,'not_relevant');if(switched)h.space.current='b';
  await h.finish(switched?200:503);
  assert.deepEqual(h.state.monitor,before);assert.equal(h.state.receipt,null);
 }
});

test('Withdrawn exclusion restores unread eligibility; positive feedback keeps unread papers but advances the receipt',async()=>{
 const h=harness();h.state.monitor.historyPapers[0]={...h.paper,feedback:'not_relevant',userState:'dismissed'};
 h.save(h.state.monitor.historyPapers[0],'not_relevant',undefined,'',false);await h.finish();
 assert.deepEqual(readingQueueExclusions(h.state.monitor.historyPapers),[]);
 const positive=harness();positive.save(positive.paper,'save');await positive.finish();
 assert.deepEqual(readingQueueExclusions(positive.state.monitor.historyPapers),[]);
 assert.equal(nextReadingPaperId(['first','second'],[],[],[positive.state.receipt.paper.id]),'second');
});

test('Reading refresh identity tracks which papers leave the queue, not only a count',()=>{
 const declaration=app.match(/ {2}const readingQueueKey = ([^\n]+);/)[1];
 const key=ids=>new Function('excludedReadingIds',`return ${declaration}`)(ids);
 assert.notEqual(key(['a']),key(['b']));assert.equal(key(['a','b']),key(['b','a']));
 assert.match(app,/refreshKey=\{`[^`]*\$\{readingQueueKey\}/);
 assert.match(app,/excludedReadingIds=\{excludedReadingIds\}/);
});
