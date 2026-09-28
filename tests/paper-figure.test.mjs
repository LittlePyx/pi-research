import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
const built=await build({entryPoints:['lib/paper-figure.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
const context={module:{exports:{}},exports:{},URL,TextDecoder,Uint8Array};
vm.runInNewContext(built.outputFiles[0].text,context);
const {figureArxivId,firstArxivFigure,boundedFigureHtml}=context.module.exports;
const html='<meta name="citation_title" content="A real paper"><figure id="S1.F1"><img src="x1.png"><figcaption><span>Figure 1:</span> Source coding model.</figcaption></figure>';
test('figure identity accepts known arxiv paths and rejects lookalike hosts and injected identifiers',()=>{
 assert.equal(figureArxivId('https://arxiv.org/abs/2401.12345v2',null),'2401.12345v2');
 assert.equal(figureArxivId('', '10.48550/arXiv.2401.12345'),'2401.12345');
 for(const url of ['https://evil.test/arxiv.org/abs/2401.12345','https://arxiv.org.evil.test/abs/2401.12345','https://arxiv.org/abs/../../admin'])assert.equal(figureArxivId(url,null),'');
});
test('first figure requires matching paper title, caption and complete single image',()=>{
 const figure=firstArxivFigure(html,'2401.12345v2','A real paper');
 assert.equal(figure.url,'https://arxiv.org/html/2401.12345v2/x1.png');
 assert.equal(figure.sourceUrl,'https://arxiv.org/html/2401.12345v2#S1.F1');
 assert.equal(figure.caption,'Figure 1: Source coding model.');
 assert.equal(firstArxivFigure(html,'2401.12345v2','Different paper'),null);
 assert.equal(firstArxivFigure(html.replace('Figure 1:','Figure 2:'),'2401.12345v2','A real paper'),null);
 assert.equal(firstArxivFigure(html.replace('<img src="x1.png">','<img src="x1.png"><img src="x2.png">'),'2401.12345v2','A real paper'),null);
 for(const src of ['https://evil.test/x.png','https://arxiv.org/html/2401.99999/x1.png','https://arxiv.org/html/2401.123450/x1.png','data:image/svg+xml,evil'])assert.equal(firstArxivFigure(html.replace('x1.png',src),'2401.12345v2','A real paper'),null);
});
test('oversized and non-HTML responses cannot become a figure document',async()=>{
 assert.equal(await boundedFigureHtml(new Response('x'.repeat(2_000_001),{headers:{'content-type':'text/html'}})),'');
 assert.equal(await boundedFigureHtml(new Response(html,{headers:{'content-type':'application/json'}})),'');
 assert.equal(await boundedFigureHtml(new Response(html,{headers:{'content-type':'text/html'}})),html);
});
test('owned paper lookup gates external fetching, caches known images, and blocks foreign redirects',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE research_spaces(id TEXT PRIMARY KEY,owner_user_id TEXT);CREATE TABLE monitored_papers(id TEXT PRIMARY KEY,space_id TEXT,title TEXT,url TEXT,doi TEXT);INSERT INTO research_spaces VALUES('s','owner');INSERT INTO monitored_papers VALUES('p','s','A real paper','https://arxiv.org/abs/2401.12345v2',NULL);INSERT INTO monitored_papers VALUES('p2','s','A real paper','https://arxiv.org/abs/2401.54321',NULL);`);
 const testDb={prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {async first(){return statement.get(...args)||null}}}}}};
 let calls=0;
 const result=await build({entryPoints:['app/api/paper-figure/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'services',setup(b){b.onResolve({filter:/db\/repository$/},()=>({path:'db',namespace:'mock'}));b.onResolve({filter:/external-source-throttle$/},()=>({path:'source',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='db'?'export const getApiUser=r=>r.headers.has("x-user")?{userId:r.headers.get("x-user")}:null;export const getDatabase=()=>testDb;export const ensureSchema=async()=>{};':'export const fetchExternalSource=(...args)=>testFetch(...args);'}))}}]});
 const ctx={module:{exports:{}},exports:{},testDb,URL,Response,AbortSignal,TextDecoder,Uint8Array,testFetch:async url=>{calls++;return url.includes('54321')?new Response(null,{status:302,headers:{location:'https://evil.test/private'}}):new Response(html,{headers:{'content-type':'text/html'}})}};
 vm.runInNewContext(result.outputFiles[0].text,ctx);
 const request=(user,space='s',paper='p')=>new Request('https://site/api/paper-figure?spaceId='+space+'&paperId='+paper,{headers:user?{'x-user':user}:{}});
 const get=ctx.module.exports.GET;
 assert.equal((await get(request(null))).status,401);assert.equal((await get(request('other'))).status,404);assert.equal((await get(request('owner','other'))).status,404);assert.equal(calls,0);
 assert.ok((await (await get(request('owner'))).json()).figure);await get(request('owner'));assert.equal(calls,1);
 assert.equal((await (await get(request('owner','s','p2'))).json()).figure,null);assert.equal(calls,2);sqlite.close();
});
