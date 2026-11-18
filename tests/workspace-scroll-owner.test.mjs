import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../app/components/use-workspace-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('inspector return keeps scroll ownership across duplicate browser events and resets on other navigation',()=>{
 const before=globalThis.window,origin='#workbook/r?space=s&workbookId=v1&workbookPanel=task&workbookFocus=practice-results';let back=0;
 try{
  const location={hash:origin},history={state:null,pushState(state,_,hash){this.state=state;location.hash=hash},replaceState(state,_,hash){this.state=state;location.hash=hash},back(){back++}};
  globalThis.window={location,history};
  const mod={exports:{}};
  new Function('require','exports',code)(name=>name==='react'?{useCallback:fn=>fn,useRef:current=>({current}),useState:()=>[0,()=>{}]}:name.includes('workbook-continuation')?{rememberComparison(){}}:require('../lib/'+name.split('/').at(-1)+'.ts'),mod.exports);
  const navigation=mod.exports.useWorkspaceNavigation('s','u');
  navigation.updateWorkspaceHash({workbookFocus:'objects:p1'},'open-evidence');const marker=history.state;
  navigation.updateWorkspaceHash({workbookFocus:'metric:p2'},'replace');assert.deepEqual(history.state,marker);
  assert.equal(navigation.updateWorkspaceHash({workbookFocus:undefined},'close-evidence'),true);assert.equal(back,1);
  location.hash=origin;navigation.requestLocationRestore();assert.equal(navigation.inspectorReturnHash.current,origin);
  navigation.requestLocationRestore();assert.equal(navigation.inspectorReturnHash.current,origin,'hashchange must not clear ownership set by popstate');
  location.hash='#library?space=s&page=2';navigation.requestLocationRestore();assert.equal(navigation.inspectorReturnHash.current,'','library keeps its ordinary position restore');
 }finally{if(before===undefined)delete globalThis.window;else globalThis.window=before;}
});
