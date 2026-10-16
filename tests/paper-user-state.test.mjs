import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {paperUserStateView} from '../lib/paper-user-state.mjs';
import {libraryUserStateSql} from '../lib/library-search.mjs';
test('optimistic UI, monitor and library SQL use the same decision and reading priorities',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const cases=[{}, {saved:true},{readingStatus:'reading'},{readingStatus:'read',saved:false},{saved:true,snoozedUntil:'2099-01-01'},{feedback:'relevant',snoozedUntil:'2099-01-01'},{feedback:'not_relevant',saved:true,readingStatus:'mastered'},{snoozedUntil:'2099-01-01'},{openedAt:'2026-01-01'},{showCount:1}];
  for(const p of cases){const row=db.prepare(`SELECT ${libraryUserStateSql} AS state FROM (SELECT ? AS feedback,? AS saved,? AS reading_status,? AS snoozed_until,? AS opened_at,? AS show_count)`).get(p.feedback||null,Number(p.saved||false),p.readingStatus||'unread',p.snoozedUntil||null,p.openedAt||null,p.showCount||0);assert.equal(paperUserStateView(p),row.state);}
  assert.equal(paperUserStateView({readingStatus:'read',saved:false}),'accepted','removing a bookmark does not erase reading acceptance');
 }finally{db.close()}
});
test('optimistic updates apply deltas to full catalog counts instead of replacing them with a partial list',()=>{
 const source=readFileSync(new URL('../app/research-app.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='historyCountsFor');assert.ok(fn);
 const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const count=new Function(code+';return historyCountsFor')();
 const before=[{qualityStage:'recommended',userState:'seen',readingStatus:'unread',saved:false,feedback:null}];
 const after=[{...before[0],userState:'accepted',readingStatus:'reading'}];
 const full={all:2959,inbox:157,unseen:150,seen:7,snoozed:0,accepted:5,saved:2,dismissed:3,reading:{reading:2}};
 const result=count(after,full,before);assert.equal(result.all,2959);assert.equal(result.inbox,156);assert.equal(result.accepted,6);assert.equal(result.seen,6);assert.equal(result.saved,2);assert.equal(result.reading.reading,3);
});
