import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),settle=()=>new Promise(resolve=>setImmediate(resolve));
const space={id:'s',name:'My original space',description:'Original direction',memberName:'Researcher',accent:'blue'};
function harness(removed=false){
 const cells=[],requests=[],changes=[],selected=[];let index=0,tree;
 const hooks={useState(initial){const i=index++;cells[i]??={value:initial};return[cells[i].value,v=>{cells[i].value=typeof v==='function'?v(cells[i].value):v}]},useRef:()=>({current:null}),useEffect(){}};
 const code=ts.transpileModule(readFileSync('app/components/space-management-list.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 new Function('require','exports',code)(name=>name==='react'?hooks:name.includes('workspace-request')?{workspaceFetch:(url,init)=>new Promise(resolve=>requests.push({url,init,resolve:(data,ok=true)=>resolve({ok,json:async()=>data})}))}:require(name),mod.exports);
 const render=()=>{index=0;tree=mod.exports.SpaceManagementList({spaces:[space],locale:'zh',removed,onSelect:row=>selected.push(row),onChanged:(...args)=>changes.push(args)});return tree};
 const nodes=()=>{const rows=[],visit=n=>{if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){rows.push(n);visit(n.props?.children)}};visit(tree);return rows};render();return{render,nodes,requests,changes,selected,text:()=>JSON.stringify(tree),click(label){nodes().find(n=>n.type==='button'&&n.props.children===label).props.onClick();render()}};
}

test('selecting a space preserves its identity and does not trigger deletion',()=>{
 const h=harness();h.nodes().find(n=>n.type==='button'&&n.props.className==='pi-space-select').props.onClick();assert.deepEqual(h.selected,[space]);assert.equal(h.requests.length,0);assert.equal(h.changes.length,0);
});
test('space deletion is confirmed by identity and uncertain failure keeps the list and confirmation',async()=>{
 const h=harness();h.click('删除');assert.equal(h.requests.length,0);assert.match(h.text(),/已保存笔记/);h.click('取消');assert.equal(h.requests.length,0);
 h.click('删除');h.click('确认删除空间');assert.equal(h.requests[0].init.method,'DELETE');assert.deepEqual(JSON.parse(h.requests[0].init.body),{id:space.id,confirmName:space.name});h.requests.shift().resolve({},false);await settle();h.requests.shift().resolve({spaces:[space],deletedSpaces:[]});await settle();h.render();assert.equal(h.changes.length,0);assert.match(h.text(),/资料保留/);
 h.click('确认删除空间');h.requests.shift().resolve({space:{...space,deletedAt:'now'},deleted:true});await settle();h.render();assert.equal(h.changes[0][0].id,space.id);assert.equal(h.changes[0][1],true);
});
test('restoring a deleted space does not create a new space or repeat an uncertain mutation',async()=>{
 const h=harness(true);h.click('恢复');assert.equal(h.requests[0].init.method,'PATCH');assert.deepEqual(JSON.parse(h.requests[0].init.body),{id:space.id,action:'restore'});h.requests.shift().resolve({},false);await settle();h.requests.shift().resolve({spaces:[space],deletedSpaces:[]});await settle();h.render();assert.deepEqual(h.changes,[[space,false]]);
});
