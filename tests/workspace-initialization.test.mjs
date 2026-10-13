import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../lib/workspace-initialization.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('initialization preserves legacy identity, skips demo and remains usable with blocked storage',async()=>{
 const requests=[],mod={exports:{}};let stored='original-browser-workspace-12345';
 const storage={getItem:()=>stored,setItem:(_key,value)=>{stored=value}};
 const api={workspaceFetch:async(_url,init)=>{requests.push(JSON.parse(init.body));return{ok:true,json:async()=>({mode:'account',spaceCount:2})}}};
 new Function('require','exports','localStorage','crypto',code)(()=>api,mod.exports,storage,{randomUUID:()=> 'new-browser-workspace-00000'});
 assert.equal(await mod.exports.initializeWorkspaceSession(true),null);assert.equal(requests.length,0);
 await mod.exports.initializeWorkspaceSession(false);assert.equal(requests[0].legacyWorkspaceId,stored);assert.equal(stored,'original-browser-workspace-12345','recovered server cookie is never copied to local storage');
 storage.getItem=()=>{throw Error('storage blocked')};assert.equal((await mod.exports.initializeWorkspaceSession(false)).mode,'account');assert.equal(requests[1].legacyWorkspaceId,undefined);
});
