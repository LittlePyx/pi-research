import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(name,props){
 const cells=[],requests=[];let index=0,tree,reloads=0;
 const hooks={useState(initial){const i=index++;cells[i]??={value:initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]}};
 const code=ts.transpileModule(readFileSync(new URL('../app/components/'+(name==='WorkspaceAccess'?'workspace-access':'workspace-welcome')+'.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 new Function('require','exports','window','localStorage',code)(n=>n==='react'?hooks:n.includes('workspace-request')?{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(data,ok=true)=>resolve({ok,status:ok?200:503,json:async()=>data})}))}:n==='./workspace-access'?{WorkspaceAccess:()=>null}:require(n),mod.exports,{location:{reload(){reloads++}}},{getItem:()=> 'original-browser-workspace-12345'});
 const render=()=>{index=0;tree=mod.exports[name](props);return tree};
 const nodes=()=>{const found=[];const visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){found.push(n);visit(n.props?.children)}};visit(tree);return found};
 render();return{props,requests,render,nodes,reloads:()=>reloads,text:()=>JSON.stringify(tree),click(label){nodes().find(n=>n.type==='button'&&n.props.children===label).props.onClick();render()}};
}
const session={mode:'browser',signedIn:true,accountLabel:'Fixture',linked:false,differentWorkspace:false,spaceCount:2,accountAvailable:true};
test('connecting and restoring access require a specific confirmation; failures preserve the screen',async()=>{
 const h=harness('WorkspaceAccess',{session,locale:'zh'});h.click('连接当前工作区');assert.equal(h.requests.length,0);h.click('取消');assert.equal(h.requests.length,0);
 h.click('连接当前工作区');h.click('确认连接');assert.equal(JSON.parse(h.requests[0].init.body).action,'connect');h.requests.shift().resolve({},false);await settle();h.render();assert.equal(h.reloads(),0);assert.match(h.text(),/现有资料保留/);
 h.click('确认连接');h.requests.shift().resolve({...session,mode:'account'});await settle();assert.equal(h.reloads(),1);
 const r=harness('WorkspaceAccess',{session:{...session,linked:true,differentWorkspace:true},locale:'zh'});assert.equal(r.nodes().some(n=>n.props?.children==='连接当前工作区'),false);r.click('恢复已连接的工作区');assert.equal(r.requests.length,0);assert.match(r.text(),/请先保存正在编辑的内容/);r.click('确认恢复并切换');assert.equal(JSON.parse(r.requests[0].init.body).action,'restore');
});
test('welcome preserves failed creation drafts and reconciles a committed insert before retrying',async()=>{
 const created=[],h=harness('WorkspaceWelcome',{session,locale:'zh',onLocale(){},onCreated:s=>created.push(s)});
 const fill=(tag,value)=>{h.nodes().find(n=>n.type===tag).props.onChange({target:{value}});h.render()};fill('input','My direction');fill('textarea','My question');
 h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.requests.shift().resolve({},false);await settle();const read=h.requests.shift();assert.equal(read.url,'/api/spaces');read.resolve({spaces:[]});await settle();h.render();assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,'My question');assert.equal(created.length,0);
 h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.requests.shift().resolve({},false);await settle();h.requests.shift().resolve({spaces:[{id:'already-committed',name:'My direction',description:'My question'}]});await settle();assert.equal(created[0].id,'already-committed');
});
test('locked account access cannot create new spaces and offers top-level platform sign-in',()=>{
 const h=harness('WorkspaceWelcome',{session:{...session,mode:'locked'},locale:'zh',onLocale(){},onCreated(){}});assert.equal(h.nodes().some(n=>n.type==='form'),false);
 const access=harness('WorkspaceAccess',{session:{...session,mode:'locked'},locale:'zh'});const signin=access.nodes().find(n=>n.type==='a'&&n.props.href.startsWith('/signin-with-chatgpt'));assert.equal(signin.props.target,'_top');assert.equal(access.requests.length,0);
});
test('returning to the original browser workspace is explicit and does not remove the account link',async()=>{
 const h=harness('WorkspaceAccess',{session:{...session,mode:'account',linked:true,canReturnToBrowser:true},locale:'zh'});h.click('返回本浏览器原工作区');assert.equal(h.requests.length,0);assert.match(h.text(),/账号连接仍然保留/);h.click('确认返回');assert.deepEqual(JSON.parse(h.requests[0].init.body),{action:'browser',legacyWorkspaceId:'original-browser-workspace-12345'});h.requests.shift().resolve({...session,mode:'browser'});await settle();assert.equal(h.reloads(),1);
});
