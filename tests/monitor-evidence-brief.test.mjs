import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('persisted evidence briefs never shift a later paper finding into an earlier empty citation slot',async()=>{
 const source=readFileSync(new URL('../app/api/monitor/route.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('monitor.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='generateDailyBrief');assert.ok(fn);
 const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let saved,captured;
 const generate=new Function('shanghaiDateKey','isPublishedRecommendation','selectDiverseItems','prepareTaskBriefCapture','saveDailyBrief',code+';return generateDailyBrief')(()=> '2026-10-16',()=>true,reviews=>reviews,async(_db,_space,_job,_description,summary,_candidates,_reviews,ids)=>{captured={summary,ids};return null},async(_db,input)=>{saved=input});
 const blank={canonicalId:'a',recommendationTier:'must_read',relevanceScore:99,contributionZh:'',contributionEn:'',summaryZh:'',summaryEn:'',whyReadZh:'',whyReadEn:'',readingFocusZh:'',readingFocusEn:''};
 const reviews=[blank,{...blank,canonicalId:'b',contributionZh:'B 的真实贡献',contributionEn:'Actual B contribution',readingFocusZh:'核对 B 的条件',readingFocusEn:'Check B assumptions'}];
 const db={prepare:()=>({bind:()=>({all:async()=>({results:[{id:'paper-a',canonical_id:'a'},{id:'paper-b',canonical_id:'b'}]})})})};
 await generate(db,{id:'s',description:'Real research question'},'owner','job',reviews.map(r=>({canonicalId:r.canonicalId,horizon:'years'})),reviews,{scanned:2,reviewed:2,recommended:2},new Date('2026-10-16'),'unused',true);
 assert.deepEqual(saved.paperIds,['paper-a','paper-b']);assert.deepEqual(saved.signalsZh,['','B 的真实贡献']);assert.deepEqual(saved.signalsEn,['','Actual B contribution']);assert.deepEqual(saved.readingPlanZh,['','核对 B 的条件']);assert.deepEqual(saved.readingPlanEn,['','Check B assumptions']);assert.deepEqual(captured.ids,['a','b']);assert.equal(captured.summary,saved);
});
